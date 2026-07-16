const crypto = require("crypto");
const { getConfig } = require("./config");

const API = "https://api.x.com";
function encode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
function sanitizeResponse(response = {}) { const result = {}; for (const key of ["title", "detail", "type", "status", "code"]) if (response[key] !== undefined) result[key] = String(response[key]).slice(0, 500); return result; }
function authenticationMethod(options = {}) {
  const x = getConfig(options).x;
  if (x.apiKey && x.apiSecret && x.accessToken && x.accessTokenSecret) return "oauth_1_0a_user_context";
  if (x.accessToken || (x.clientId && x.refreshToken)) return "oauth_2_0_user_context";
  if (x.bearerToken) return "oauth_2_0_app_only";
  return "unconfigured";
}
function oauth1Header(method, url, credentials, overrides = {}) {
  const oauth = { oauth_consumer_key: credentials.apiKey, oauth_nonce: overrides.nonce || crypto.randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(overrides.timestamp || Math.floor(Date.now() / 1000)), oauth_token: credentials.accessToken, oauth_version: "1.0" };
  const parsed = new URL(url);
  const params = [...parsed.searchParams.entries(), ...Object.entries(oauth)].map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : (a < b ? -1 : a > b ? 1 : 0));
  const normalized = params.map(([key, value]) => `${key}=${value}`).join("&");
  const base = [method.toUpperCase(), encode(`${parsed.protocol}//${parsed.host}${parsed.pathname}`), encode(normalized)].join("&");
  oauth.oauth_signature = crypto.createHmac("sha1", `${encode(credentials.apiSecret)}&${encode(credentials.accessTokenSecret)}`).update(base).digest("base64");
  return `OAuth ${Object.entries(oauth).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}
async function refreshAccessToken(x) {
  if (!x.clientId || !x.refreshToken) return null;
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (x.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${x.clientId}:${x.clientSecret}`).toString("base64")}`;
  const response = await fetch(`${API}/2/oauth2/token`, { method: "POST", headers, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: x.refreshToken, ...(x.clientSecret ? {} : { client_id: x.clientId }) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) { const error = new Error(data.error_description || `X OAuth refresh failed: ${response.status}`); error.statusCode = response.status; error.category = "authentication"; throw error; }
  return data;
}
async function authorization(method, url, options = {}) {
  const x = getConfig(options).x;
  if (x.apiKey && x.apiSecret && x.accessToken && x.accessTokenSecret) return { header: oauth1Header(method, url, x), refreshed: false };
  if (x.accessToken) return { header: `Bearer ${x.accessToken}`, refreshed: false };
  const refreshed = await refreshAccessToken(x);
  if (refreshed) return { header: `Bearer ${refreshed.access_token}`, refreshed: true, refreshTokenRotated: Boolean(refreshed.refresh_token) };
  const error = new Error(x.bearerToken ? "X_BEARER_TOKEN is app-only and cannot publish or verify a user identity; user-context credentials are required" : "Missing X user-context credentials"); error.code = "X_CREDENTIALS_MISSING"; error.category = "authentication"; throw error;
}
async function request(method, path, body, options = {}) {
  const url = `${API}${path}`;
  let auth = await authorization(method, url, options);
  let response = await fetch(url, { method, headers: { Authorization: auth.header, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (response.status === 401 && !auth.refreshed && getConfig(options).x.refreshToken) {
    auth = await authorization(method, url, { ...options, xAccessToken: "" });
    response = await fetch(url, { method, headers: { Authorization: auth.header, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.detail || data.title || `X API HTTP ${response.status}`); error.statusCode = response.status; error.category = response.status === 429 || response.status >= 500 ? "transient" : response.status === 401 || response.status === 403 ? "authentication" : "content"; error.response = data; throw error; }
  return { data, refreshed: auth.refreshed, refreshTokenRotated: auth.refreshTokenRotated };
}
async function withRetries(fn) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fn(); } catch (error) { last = error; if (error.category !== "transient" || attempt === 2) throw error; await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt))); }
  }
  throw last;
}
async function verifyIdentity(options) {
  const result = await request("GET", "/2/users/me?user.fields=username,name", null, options);
  const username = String(result.data?.data?.username || "").toLowerCase();
  if (username !== "doneovernight") { const error = new Error(`X identity guard failed: expected @doneovernight, got @${username || "unknown"}`); error.code = "X_USERNAME_GUARD_FAILED"; throw error; }
  return { username, userId: result.data.data.id, authenticationMethod: authenticationMethod(options), refreshed: result.refreshed, refreshTokenRotated: result.refreshTokenRotated };
}
async function isolatedIdentityCheck(options = {}) {
  const x = getConfig(options).x; const required = ["apiKey", "apiSecret", "accessToken", "accessTokenSecret"]; const missing = required.filter((key) => !x[key]);
  if (missing.length) return { httpStatus: null, missing, authenticationMethod: "oauth_1_0a_user_context" };
  const url = `${API}/2/users/me?user.fields=username,name`; const parsed = new URL(url); const oauth = { oauth_consumer_key: x.apiKey, oauth_nonce: crypto.randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: x.accessToken, oauth_version: "1.0" };
  const parameters = [...parsed.searchParams.entries(), ...Object.entries(oauth)].map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : (a < b ? -1 : a > b ? 1 : 0));
  const base = ["GET", encode(`${parsed.protocol}//${parsed.host}${parsed.pathname}`), encode(parameters.map(([key, value]) => `${key}=${value}`).join("&"))].join("&"); oauth.oauth_signature = crypto.createHmac("sha1", `${encode(x.apiSecret)}&${encode(x.accessTokenSecret)}`).update(base).digest("base64");
  const header = `OAuth ${Object.entries(oauth).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
  const response = await fetch(url, { method: "GET", headers: { Authorization: header, Accept: "application/json" } }); const payload = await response.json().catch(() => ({})); const remoteDate = response.headers.get("date");
  return { httpStatus: response.status, missing: [], authenticationMethod: "oauth_1_0a_user_context", authorizationScheme: "OAuth", oauthParameters: Object.keys(oauth).sort(), signatureMethod: "HMAC-SHA1", baseUrl: `${parsed.protocol}//${parsed.host}${parsed.pathname}`, queryParameterCount: [...parsed.searchParams].length, bodyParameterCount: 0, usesBearerFallback: false, clockSkewSeconds: remoteDate ? Math.round((Date.now() - new Date(remoteDate).getTime()) / 1000) : null, sanitizedResponse: sanitizeResponse(payload) };
}
async function publish(text, options) { return withRetries(async () => request("POST", "/2/tweets", { text }, options)); }
module.exports = { authenticationMethod, verifyIdentity, isolatedIdentityCheck, publish, refreshAccessToken, oauth1Header, sanitizeResponse };
