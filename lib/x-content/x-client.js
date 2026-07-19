const crypto = require("crypto");
const repository = require("./repository");
const { getConfig } = require("./config");

const API = "https://api.x.com";
const OAUTH2_AUTHORIZE = "https://x.com/i/oauth2/authorize";
const OAUTH2_CONNECTION_KEY = "x_oauth2_connection";
const OAUTH2_PENDING_KEY = "x_oauth2_pkce_pending";
const OAUTH2_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];
const REFRESH_EARLY_MS = 5 * 60_000;
function encode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
function base64url(value) { return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function safeJson(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function oauth2Error(message, code, statusCode = 400) { const error = new Error(message); error.code = code; error.statusCode = statusCode; error.category = "authentication"; return error; }
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
  await repository.setSetting(OAUTH2_PENDING_KEY, JSON.stringify({ state, verifier, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), created_at: new Date().toISOString() }));
  return { authorizationUrl: buildOAuth2AuthorizationUrl({ clientId: x.clientId, redirectUri: x.redirectUri, state, verifier }), scopes: OAUTH2_SCOPES };
}
async function tokenRequest(body, x) {
  const response = await fetch(`${API}/2/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${x.clientId}:${x.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(body) }); const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw oauth2Error(data.error_description || data.error || "X OAuth 2.0 token exchange failed", "X_OAUTH2_TOKEN_EXCHANGE_FAILED", response.status || 502);
  return data;
}
function tokenScopes(data) { return String(data.scope || "").split(/\s+/).filter(Boolean); }
function assertRequiredScopes(scopes) { const missing = OAUTH2_SCOPES.filter((scope) => !scopes.includes(scope)); if (missing.length) throw oauth2Error("X did not grant all required OAuth 2.0 scopes", "X_OAUTH2_SCOPE_MISSING", 403); }
async function verifyOAuth2User(accessToken) {
  const response = await fetch(`${API}/2/users/me`, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }); const data = await response.json().catch(() => ({}));
  if (!response.ok) throw oauth2Error(data.detail || data.title || "X OAuth 2.0 identity verification failed", "X_OAUTH2_IDENTITY_FAILED", response.status || 502);
  const username = String(data?.data?.username || "").toLowerCase(); if (username !== "doneovernight") throw oauth2Error("OAuth 2.0 authorization must be completed as @doneovernight", "X_USERNAME_GUARD_FAILED", 403);
  return { username, userId: data.data.id };
}
function connectionFromToken(data, previous = {}) { return { access_token: data.access_token, refresh_token: data.refresh_token || previous.refresh_token || "", expires_at: new Date(Date.now() + Math.max(0, Number(data.expires_in || 0)) * 1000).toISOString(), scopes: tokenScopes(data).length ? tokenScopes(data) : (previous.scopes || []), username: previous.username || null, user_id: previous.user_id || null, updated_at: new Date().toISOString() }; }
async function completeOAuth2Authorization({ code, state }, options = {}) {
  if (!code || !state) throw oauth2Error("OAuth 2.0 callback is missing code or state", "X_OAUTH2_CALLBACK_INVALID"); const x = oauth2ClientConfig(options); const pending = safeJson((await repository.getSetting(OAUTH2_PENDING_KEY))?.value, {});
  const expected = String(pending?.state || ""); const actual = String(state); if (!expected || expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual)) || Date.now() > new Date(pending.expires_at).getTime()) throw oauth2Error("OAuth 2.0 authorization state is invalid or expired", "X_OAUTH2_STATE_INVALID", 403);
  await repository.setSetting(OAUTH2_PENDING_KEY, JSON.stringify({ consumed_at: new Date().toISOString() }));
  const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: x.redirectUri, code_verifier: pending.verifier }, x); const scopes = tokenScopes(token); assertRequiredScopes(scopes); if (!token.refresh_token) throw oauth2Error("X did not return a refresh token", "X_OAUTH2_REFRESH_MISSING", 403);
  const identity = await verifyOAuth2User(token.access_token); const connection = { ...connectionFromToken(token), username: identity.username, user_id: identity.userId }; await repository.setSetting(OAUTH2_CONNECTION_KEY, JSON.stringify(connection));
  return { ...identity, scopes, refreshTokenAvailable: true };
}
async function storedOAuth2Connection(options = {}) {
  const configured = getConfig(options).x; if (!configured.clientId || !configured.clientSecret || !configured.redirectUri) return null; const row = await repository.getSetting(OAUTH2_CONNECTION_KEY); const connection = safeJson(row?.value, null); if (!connection?.access_token) return null; const x = oauth2ClientConfig(options);
  if (Date.now() + REFRESH_EARLY_MS < new Date(connection.expires_at).getTime()) return connection;
  if (!connection.refresh_token) throw oauth2Error("Stored OAuth 2.0 refresh token is unavailable", "X_OAUTH2_REFRESH_MISSING", 503);
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: connection.refresh_token }, x); const next = connectionFromToken(refreshed, connection); assertRequiredScopes(next.scopes); await repository.setSetting(OAUTH2_CONNECTION_KEY, JSON.stringify(next)); return next;
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
  const data = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(data.detail || data.title || `X API HTTP ${response.status}`); error.statusCode = response.status; error.category = response.status === 429 || response.status >= 500 ? "transient" : response.status === 401 || response.status === 403 ? "authentication" : "content"; error.response = data; throw error; }
  return { data, refreshed: auth.refreshed, refreshTokenRotated: auth.refreshTokenRotated, authenticationMethod: auth.method };
}
async function withRetries(fn) { let last; for (let attempt = 0; attempt < 3; attempt += 1) { try { return await fn(); } catch (error) { last = error; if (error.category !== "transient" || attempt === 2) throw error; await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt))); } } throw last; }
async function verifyIdentity(options) { const result = await request("GET", "/2/users/me?user.fields=username,name", null, options); const username = String(result.data?.data?.username || "").toLowerCase(); if (username !== "doneovernight") { const error = new Error(`X identity guard failed: expected @doneovernight, got @${username || "unknown"}`); error.code = "X_USERNAME_GUARD_FAILED"; throw error; } return { username, userId: result.data.data.id, authenticationMethod: result.authenticationMethod || authenticationMethod(options), refreshed: result.refreshed, refreshTokenRotated: result.refreshTokenRotated }; }
async function publish(text, options) { return withRetries(async () => request("POST", "/2/tweets", { text }, options)); }
async function getMentions(userId, options) { return request("GET", `/2/users/${encodeURIComponent(userId)}/mentions?max_results=25&tweet.fields=author_id,created_at,conversation_id,in_reply_to_user_id,public_metrics&expansions=author_id&user.fields=username,name`, null, options); }
async function getReplies(postId, options) { return request("GET", `/2/tweets/search/recent?query=${encodeURIComponent(`conversation_id:${postId}`)}&max_results=25&tweet.fields=author_id,created_at,conversation_id,in_reply_to_user_id,referenced_tweets,public_metrics&expansions=author_id&user.fields=username,name`, null, options); }
async function getQuotes(postId, options) { return request("GET", `/2/tweets/${encodeURIComponent(postId)}/quote_tweets?max_results=25&tweet.fields=author_id,created_at,public_metrics&expansions=author_id&user.fields=username,name`, null, options); }
async function getPostMetrics(postId, options) { return request("GET", `/2/tweets/${encodeURIComponent(postId)}?tweet.fields=public_metrics,non_public_metrics,organic_metrics,created_at`, null, options); }
async function getUserMetrics(options) { return request("GET", "/2/users/me?user.fields=username,public_metrics", null, options); }
async function getUserPosts(userId, options = {}) { const params = new URLSearchParams({ max_results: String(Math.min(100, Math.max(5, Number(options.maxResults) || 100))), "tweet.fields": "author_id,created_at,conversation_id,in_reply_to_user_id,referenced_tweets" }); if (options.paginationToken) params.set("pagination_token", String(options.paginationToken)); return request("GET", `/2/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`, null, options); }
module.exports = { OAUTH2_SCOPES, authenticationMethod, buildOAuth2AuthorizationUrl, completeOAuth2Authorization, getMentions, getPostMetrics, getQuotes, getReplies, getUserMetrics, getUserPosts, oauth1Header, publish, refreshAccessToken, startOAuth2Authorization, verifyIdentity, verifyOAuth2User };
