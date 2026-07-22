const crypto = require("crypto");
const repository = require("./repository");
const { getConfig } = require("./config");

const API = "https://api.x.com";
const OAUTH2_AUTHORIZE = "https://x.com/i/oauth2/authorize";
const OAUTH2_CONNECTION_KEY = "x_oauth2_connection";
const OAUTH2_PENDING_KEY = "x_oauth2_pkce_pending";
const OAUTH2_LAST_IDENTITY_KEY = "x_oauth2_last_identity_check";
const OAUTH2_LAST_REFRESH_KEY = "x_oauth2_last_refresh";
const OAUTH2_ERROR_KEY = "x_oauth2_connection_error";
const REQUIRED_X_USER_ID = "2037306333813235713";
const OAUTH2_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];
const REFRESH_EARLY_MS = 5 * 60_000;
function encode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
function base64url(value) { return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function decodeBase64url(value) { const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/"); return Buffer.from(raw + "=".repeat((4 - (raw.length % 4)) % 4), "base64"); }
function safeJson(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function oauth2Error(message, code, statusCode = 400) { const error = new Error(message); error.code = code; error.statusCode = statusCode; error.category = "authentication"; return error; }
function tokenKey() { const secret = String(process.env.SUPABASE_SERVICE_ROLE_KEY || ""); if (!secret) return null; return crypto.createHash("sha256").update(`doneovernight:x-oauth2:${secret}`).digest(); }
function sealConnection(value) { const key = tokenKey(); if (!key) throw oauth2Error("Server token encryption is not configured", "X_OAUTH2_ENCRYPTION_UNAVAILABLE", 503); const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]); return `enc:v1:${base64url(iv)}:${base64url(cipher.getAuthTag())}:${base64url(encrypted)}`; }
function openConnection(value) { if (!value) return null; if (!String(value).startsWith("enc:v1:")) return safeJson(value, null); const key = tokenKey(); if (!key) return null; const [, , iv, tag, ciphertext] = String(value).split(":"); try { const decipher = crypto.createDecipheriv("aes-256-gcm", key, decodeBase64url(iv)); decipher.setAuthTag(decodeBase64url(tag)); return safeJson(Buffer.concat([decipher.update(decodeBase64url(ciphertext)), decipher.final()]).toString("utf8"), null); } catch { return null; } }
async function saveConnection(connection) { await repository.setSetting(OAUTH2_CONNECTION_KEY, sealConnection(JSON.stringify(connection))); return connection; }
function sanitizedText(value) { return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || null; }
function xErrorDetails(statusCode, data, headers, failurePhase) {
  const first = Array.isArray(data?.errors) ? data.errors[0] || {} : {};
  const code = first.code ?? data?.code ?? null;
  const title = sanitizedText(first.title || data?.title);
  const detail = sanitizedText(first.detail || data?.detail || data?.error_description);
  const type = sanitizedText(first.type || data?.type);
  const category = statusCode === 429 ? "rate_limit" : statusCode >= 500 ? "transient" : statusCode === 401 || statusCode === 403 ? "authentication" : "content";
  const rateLimit = {};
  for (const name of ["x-rate-limit-limit", "x-rate-limit-remaining", "x-rate-limit-reset", "retry-after"]) {
    const value = headers?.get?.(name);
    if (value !== null && value !== undefined && /^\d{1,20}$/.test(String(value))) rateLimit[name.replaceAll("-", "_")] = Number(value);
  }
  return { http_status: statusCode, x_error_code: code, x_error_category: category, x_title: title, x_detail: detail, x_type: type, sanitized_message: detail || title || `X API HTTP ${statusCode}`, failure_phase: failurePhase || "x_request", rate_limit: rateLimit };
}
function authenticationMethod(options = {}) {
  const x = getConfig(options).x;
  if (x.apiKey && x.apiSecret && x.accessToken && x.accessTokenSecret) return "oauth_1_0a_user_context";
  if (x.accessToken || (x.clientId && x.refreshToken)) return "oauth_2_0_user_context";
  if (x.bearerToken) return "oauth_2_0_app_only";
  return "unconfigured";
}
function oauth1Header(method, url, credentials, overrides = {}) {
  const oauth = { oauth_consumer_key: credentials.apiKey, oauth_nonce: overrides.nonce || crypto.randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(overrides.timestamp || Math.floor(Date.now() / 1000)), oauth_token: credentials.accessToken, oauth_version: "1.0" };
  const parsed = new URL(url); const params = [...parsed.searchParams.entries(), ...Object.entries(oauth)].map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : (a < b ? -1 : a > b ? 1 : 0));
  const normalized = params.map(([key, value]) => `${key}=${value}`).join("&"); const base = [method.toUpperCase(), encode(`${parsed.protocol}//${parsed.host}${parsed.pathname}`), encode(normalized)].join("&");
  oauth.oauth_signature = crypto.createHmac("sha1", `${encode(credentials.apiSecret)}&${encode(credentials.accessTokenSecret)}`).update(base).digest("base64");
  return `OAuth ${Object.entries(oauth).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}
function oauth2ClientConfig(options = {}) {
  const x = getConfig(options).x;
  if (!x.clientId || !x.clientSecret || !x.redirectUri) throw oauth2Error("OAuth 2.0 PKCE is not configured", "X_OAUTH2_NOT_CONFIGURED", 503);
  try { const redirect = new URL(x.redirectUri); if (redirect.protocol !== "https:") throw new Error(); } catch { throw oauth2Error("X_REDIRECT_URI must be an HTTPS URL", "X_OAUTH2_REDIRECT_INVALID", 503); }
  return x;
}
function buildOAuth2AuthorizationUrl({ clientId, redirectUri, state, verifier }) {
  const url = new URL(OAUTH2_AUTHORIZE); url.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: OAUTH2_SCOPES.join(" "), state, code_challenge: base64url(crypto.createHash("sha256").update(verifier).digest()), code_challenge_method: "S256" }).toString(); return url.toString();
}
async function startOAuth2Authorization(options = {}) {
  const x = oauth2ClientConfig(options); const state = base64url(crypto.randomBytes(32)); const verifier = base64url(crypto.randomBytes(64));
  const callbackNonce = base64url(crypto.randomBytes(24));
  await repository.setSetting(OAUTH2_PENDING_KEY, JSON.stringify({ state, verifier, callback_nonce: callbackNonce, workspace_id: options.workspaceId || null, admin_binding: options.adminBinding || null, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), created_at: new Date().toISOString() }));
  return { authorizationUrl: buildOAuth2AuthorizationUrl({ clientId: x.clientId, redirectUri: x.redirectUri, state, verifier }), scopes: OAUTH2_SCOPES, callbackNonce };
}
async function tokenRequest(body, x) {
  const response = await fetch(`${API}/2/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${x.clientId}:${x.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(body) }); const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) { const error = oauth2Error(data.error_description || data.error || "X OAuth 2.0 token exchange failed", "X_OAUTH2_TOKEN_EXCHANGE_FAILED", response.status || 502); error.xFailure = { http_status: response.status || 502, x_error_code: data.error || null, x_error_category: "authentication", x_title: null, x_detail: sanitizedText(data.error_description || data.error), x_type: null, sanitized_message: sanitizedText(data.error_description || data.error || error.message), failure_phase: "oauth2_token_exchange", rate_limit: {} }; throw error; }
  return data;
}
function tokenScopes(data) { return String(data.scope || "").split(/\s+/).filter(Boolean); }
function assertRequiredScopes(scopes) { const missing = OAUTH2_SCOPES.filter((scope) => !scopes.includes(scope)); if (missing.length) throw oauth2Error("X did not grant all required OAuth 2.0 scopes", "X_OAUTH2_SCOPE_MISSING", 403); }
async function verifyOAuth2User(accessToken) {
  const response = await fetch(`${API}/2/users/me`, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }); const data = await response.json().catch(() => ({}));
  if (!response.ok) throw oauth2Error(data.detail || data.title || "X OAuth 2.0 identity verification failed", "X_OAUTH2_IDENTITY_FAILED", response.status || 502);
  const username = String(data?.data?.username || "").toLowerCase(); if (username !== "doneovernight" || String(data?.data?.id || "") !== REQUIRED_X_USER_ID) throw oauth2Error("OAuth 2.0 authorization must be completed as @doneovernight", "X_USERNAME_GUARD_FAILED", 403);
  return { username, userId: data.data.id };
}
function connectionFromToken(data, previous = {}) { return { access_token: data.access_token, refresh_token: data.refresh_token || previous.refresh_token || "", expires_at: new Date(Date.now() + Math.max(0, Number(data.expires_in || 0)) * 1000).toISOString(), scopes: tokenScopes(data).length ? tokenScopes(data) : (previous.scopes || []), username: previous.username || null, user_id: previous.user_id || null, updated_at: new Date().toISOString() }; }
async function completeOAuth2Authorization({ code, state, callbackNonce }, options = {}) {
  if (!code || !state) throw oauth2Error("OAuth 2.0 callback is missing code or state", "X_OAUTH2_CALLBACK_INVALID"); const x = oauth2ClientConfig(options); const pending = safeJson((await repository.getSetting(OAUTH2_PENDING_KEY))?.value, {});
  const expected = String(pending?.state || ""); const actual = String(state); const expectedNonce = String(pending?.callback_nonce || ""); const actualNonce = String(callbackNonce || ""); const expectedBinding = String(pending?.admin_binding || ""); const actualBinding = String(options.adminBinding || ""); if (!expected || expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual)) || !expectedNonce || expectedNonce.length !== actualNonce.length || !crypto.timingSafeEqual(Buffer.from(expectedNonce), Buffer.from(actualNonce)) || (expectedBinding && (expectedBinding.length !== actualBinding.length || !crypto.timingSafeEqual(Buffer.from(expectedBinding), Buffer.from(actualBinding)))) || (pending.workspace_id && options.workspaceId && pending.workspace_id !== options.workspaceId) || Date.now() > new Date(pending.expires_at).getTime()) throw oauth2Error("OAuth 2.0 authorization state is invalid or expired", "X_OAUTH2_STATE_INVALID", 403);
  await repository.setSetting(OAUTH2_PENDING_KEY, JSON.stringify({ consumed_at: new Date().toISOString() }));
  const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: x.redirectUri, code_verifier: pending.verifier }, x); const scopes = tokenScopes(token); assertRequiredScopes(scopes); if (!token.refresh_token) throw oauth2Error("X did not return a refresh token", "X_OAUTH2_REFRESH_MISSING", 403);
  const initial = { ...connectionFromToken(token), scopes, username: null, user_id: null }; await saveConnection(initial);
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: token.refresh_token }, x); const refreshedScopes = tokenScopes(refreshed).length ? tokenScopes(refreshed) : scopes; assertRequiredScopes(refreshedScopes);
  const identity = await verifyOAuth2User(refreshed.access_token); const connection = { ...connectionFromToken({ ...refreshed, scope: refreshed.scope || scopes.join(" ") }, initial), scopes: refreshedScopes, username: identity.username, user_id: identity.userId }; await saveConnection(connection); await repository.setSetting(OAUTH2_LAST_IDENTITY_KEY, JSON.stringify({ at: new Date().toISOString(), username: identity.username, user_id: identity.userId })).catch(() => null); await repository.setSetting(OAUTH2_LAST_REFRESH_KEY, new Date().toISOString()).catch(() => null); await repository.setSetting(OAUTH2_ERROR_KEY, "").catch(() => null); await repository.setSetting("x_autonomy_safe_stop", "false"); await Promise.resolve(repository.recordAutonomyAudit?.({ event_type: "mode_changed", mode: "auto", reason: "oauth2_reconnect_verified_and_safe_stop_cleared", payload: { workspace_id: pending.workspace_id || null, username: identity.username, user_id: identity.userId, scopes: refreshedScopes } })).catch(() => null);
  return { ...identity, scopes: refreshedScopes, refreshTokenAvailable: true, refreshed: true };
}
async function storedOAuth2Connection(options = {}) {
  const configured = getConfig(options).x; if (!configured.clientId || !configured.clientSecret || !configured.redirectUri) return null; const row = await repository.getSetting(OAUTH2_CONNECTION_KEY); const connection = openConnection(row?.value); if (!connection?.access_token) return null; const x = oauth2ClientConfig(options);
  if (Date.now() + REFRESH_EARLY_MS < new Date(connection.expires_at).getTime()) return connection;
  if (!connection.refresh_token) throw oauth2Error("Stored OAuth 2.0 refresh token is unavailable", "X_OAUTH2_REFRESH_MISSING", 503);
  try { const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: connection.refresh_token }, x); const next = connectionFromToken(refreshed, connection); assertRequiredScopes(next.scopes); await saveConnection(next); await repository.setSetting(OAUTH2_LAST_REFRESH_KEY, new Date().toISOString()).catch(() => null); await repository.setSetting(OAUTH2_ERROR_KEY, "").catch(() => null); return next; } catch (error) { await repository.setSetting(OAUTH2_ERROR_KEY, JSON.stringify({ code: error.code || null, message: sanitizedText(error.message), at: new Date().toISOString() })).catch(() => null); throw error; }
}
async function storedOAuth2Metadata(options = {}) { const row = await repository.getSetting(OAUTH2_CONNECTION_KEY).catch(() => null); const connection = openConnection(row?.value); return { present: Boolean(connection), accessTokenPresent: Boolean(connection?.access_token), refreshTokenAvailable: Boolean(connection?.refresh_token), scopes: Array.isArray(connection?.scopes) ? connection.scopes.filter((scope) => OAUTH2_SCOPES.includes(scope)) : [], expiresAt: connection?.expires_at || null, username: connection?.username || null, userId: connection?.user_id || null, lastIdentityCheck: safeJson((await repository.getSetting(OAUTH2_LAST_IDENTITY_KEY).catch(() => null))?.value, null), lastRefresh: (await repository.getSetting(OAUTH2_LAST_REFRESH_KEY).catch(() => null))?.value || null, error: safeJson((await repository.getSetting(OAUTH2_ERROR_KEY).catch(() => null))?.value, null) };
}
async function revokeOAuth2Connection(options = {}) { const x = oauth2ClientConfig(options); const metadata = await storedOAuth2Metadata(options); const row = await repository.getSetting(OAUTH2_CONNECTION_KEY).catch(() => null); const connection = openConnection(row?.value); if (connection?.refresh_token) { await fetch(`${API}/2/oauth2/revoke`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${x.clientId}:${x.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ token: connection.refresh_token, token_type_hint: "refresh_token" }) }).catch(() => null); } await repository.setSetting(OAUTH2_CONNECTION_KEY, "{}"); await repository.setSetting(OAUTH2_ERROR_KEY, ""); return { disconnected: true, previous_scopes: metadata.scopes };
}
async function refreshAccessToken(x) {
  if (!x.clientId || !x.refreshToken) return null; const headers = { "Content-Type": "application/x-www-form-urlencoded" }; if (x.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${x.clientId}:${x.clientSecret}`).toString("base64")}`;
  const response = await fetch(`${API}/2/oauth2/token`, { method: "POST", headers, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: x.refreshToken, ...(x.clientSecret ? {} : { client_id: x.clientId }) }) }); const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) { const error = new Error(data.error_description || `X OAuth refresh failed: ${response.status}`); error.statusCode = response.status; error.category = "authentication"; throw error; } return data;
}
async function authorization(method, url, options = {}) {
  const x = getConfig(options).x; const oauth2 = await storedOAuth2Connection(options); if (oauth2) return { header: `Bearer ${oauth2.access_token}`, refreshed: false, method: "oauth_2_0_pkce_user_context" };
  if (x.apiKey && x.apiSecret && x.accessToken && x.accessTokenSecret) return { header: oauth1Header(method, url, x), refreshed: false, method: "oauth_1_0a_user_context" };
  if (x.accessToken) return { header: `Bearer ${x.accessToken}`, refreshed: false, method: "oauth_2_0_user_context" };
  const refreshed = await refreshAccessToken(x); if (refreshed) return { header: `Bearer ${refreshed.access_token}`, refreshed: true, refreshTokenRotated: Boolean(refreshed.refresh_token), method: "oauth_2_0_user_context" };
  const error = new Error(x.bearerToken ? "X_BEARER_TOKEN is app-only and cannot publish or verify a user identity; user-context credentials are required" : "Missing X user-context credentials"); error.code = "X_CREDENTIALS_MISSING"; error.category = "authentication"; throw error;
}
async function request(method, path, body, options = {}) {
  const url = `${API}${path}`; let auth = await authorization(method, url, options); let response = await fetch(url, { method, headers: { Authorization: auth.header, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (response.status === 401 && !auth.refreshed && getConfig(options).x.refreshToken) { auth = await authorization(method, url, { ...options, xAccessToken: "" }); response = await fetch(url, { method, headers: { Authorization: auth.header, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  const data = await response.json().catch(() => ({})); if (!response.ok) { const failure = xErrorDetails(response.status, data, response.headers, options.failurePhase || (path === "/2/tweets" ? "tweet_create" : "x_request")); const error = new Error(failure.sanitized_message); error.statusCode = response.status; error.code = failure.x_error_code || `X_HTTP_${response.status}`; error.category = response.status === 429 || response.status >= 500 ? "transient" : failure.x_error_category; error.xFailure = failure; error.response = data; throw error; }
  return { data, refreshed: auth.refreshed, refreshTokenRotated: auth.refreshTokenRotated, authenticationMethod: auth.method };
}
async function withRetries(fn) { let last; for (let attempt = 0; attempt < 3; attempt += 1) { try { return await fn(); } catch (error) { last = error; if (error.category !== "transient" || attempt === 2) throw error; await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt))); } } throw last; }
async function verifyIdentity(options) { const result = await request("GET", "/2/users/me?user.fields=username,name", null, { ...(options || {}), failurePhase: "identity" }); const username = String(result.data?.data?.username || "").toLowerCase(); if (username !== "doneovernight") { const error = new Error(`X identity guard failed: expected @doneovernight, got @${username || "unknown"}`); error.code = "X_USERNAME_GUARD_FAILED"; throw error; } return { username, userId: result.data.data.id, authenticationMethod: result.authenticationMethod || authenticationMethod(options), refreshed: result.refreshed, refreshTokenRotated: result.refreshTokenRotated }; }
async function publish(text, options) { return withRetries(async () => request("POST", "/2/tweets", { text }, { ...(options || {}), failurePhase: "tweet_create" })); }
async function getMentions(userId, options) { return request("GET", `/2/users/${encodeURIComponent(userId)}/mentions?max_results=25&tweet.fields=author_id,created_at,conversation_id,in_reply_to_user_id,public_metrics&expansions=author_id&user.fields=username,name`, null, options); }
async function getReplies(postId, options) { return request("GET", `/2/tweets/search/recent?query=${encodeURIComponent(`conversation_id:${postId}`)}&max_results=25&tweet.fields=author_id,created_at,conversation_id,in_reply_to_user_id,referenced_tweets,public_metrics&expansions=author_id&user.fields=username,name`, null, options); }
async function getQuotes(postId, options) { return request("GET", `/2/tweets/${encodeURIComponent(postId)}/quote_tweets?max_results=25&tweet.fields=author_id,created_at,public_metrics&expansions=author_id&user.fields=username,name`, null, options); }
async function getPostMetrics(postId, options) { return request("GET", `/2/tweets/${encodeURIComponent(postId)}?tweet.fields=public_metrics,non_public_metrics,organic_metrics,created_at`, null, options); }
async function getUserMetrics(options) { return request("GET", "/2/users/me?user.fields=username,public_metrics", null, options); }
async function getUserPosts(userId, options = {}) { const params = new URLSearchParams({ max_results: String(Math.min(100, Math.max(5, Number(options.maxResults) || 100))), "tweet.fields": "author_id,created_at,conversation_id,in_reply_to_user_id,referenced_tweets,public_metrics,non_public_metrics,organic_metrics" }); if (options.paginationToken) params.set("pagination_token", String(options.paginationToken)); return request("GET", `/2/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`, null, options); }
module.exports = { OAUTH2_SCOPES, REQUIRED_X_USER_ID, authenticationMethod, buildOAuth2AuthorizationUrl, completeOAuth2Authorization, getMentions, getPostMetrics, getQuotes, getReplies, getUserMetrics, getUserPosts, oauth1Header, openConnection, publish, refreshAccessToken, revokeOAuth2Connection, saveConnection, refreshOAuth2Connection: storedOAuth2Connection, storedOAuth2Metadata, startOAuth2Authorization, verifyIdentity, verifyOAuth2User, xErrorDetails };
