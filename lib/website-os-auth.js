const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { clean, slugify, supabaseFetch } = require("./ops");

const WEBSITE_OS_SESSION_COOKIE = "don_website_os_session";
const WEBSITE_OS_SESSION_DAYS = 14;
const WEBSITE_OS_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const WEBSITE_OS_LOGIN_MAX_FAILURES = 6;
const WEBSITE_OS_LOGIN_LOCK_MS = 15 * 60 * 1000;
const WEBSITE_OS_DUMMY_PASSWORD_HASH = "$2b$12$LHkZu8FIe.sUYipauO7ftuloY679OHFO8lWbngHhmKTR2jfZkOMI6";
const ROLE_RANK = {
  Owner: 4,
  Admin: 3,
  Editor: 2,
  Viewer: 1
};

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function requestHost(req = {}) {
  return clean(req.headers?.["x-forwarded-host"] || req.headers?.host).toLowerCase().split(":")[0];
}

function requestIp(req = {}) {
  return clean(req.headers?.["x-forwarded-for"]).split(",")[0].trim() ||
    clean(req.headers?.["x-real-ip"]) || "unknown";
}

function authFingerprint(value) {
  const key = process.env.WEBSITE_OS_AUTH_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || "website-os";
  return crypto.createHmac("sha256", key).update(clean(value).toLowerCase()).digest("hex");
}

function authIdentifiers(req, slug, email) {
  return {
    emailHash: authFingerprint(normalizeEmail(email) || "unknown"),
    ipHash: authFingerprint(requestIp(req)),
    workspaceSlug: slugify(slug)
  };
}

function assertWebsiteOsRequestOrigin(req = {}) {
  const host = requestHost(req);
  if (!host || host === "localhost" || host === "127.0.0.1") return true;
  const origin = clean(req.headers?.origin);
  let originHost = "";
  try {
    originHost = origin ? new URL(origin).hostname.toLowerCase() : "";
  } catch (error) {}
  const samePreviewHost = host.endsWith(".vercel.app") && originHost === host;
  if (originHost !== "admin.doneovernight.com" && !samePreviewHost) {
    const error = new Error("Website OS request origin rejected");
    error.statusCode = 403;
    error.code = "WEBSITE_OS_ORIGIN_REJECTED";
    throw error;
  }
  return true;
}

function normalizeRole(value) {
  const role = clean(value);
  return ROLE_RANK[role] ? role : "Viewer";
}

function parseCookies(req) {
  return String(req.headers?.cookie || "").split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = clean(part.slice(0, index));
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function sessionTokenHash(token) {
  return crypto.createHash("sha256").update(clean(token)).digest("hex");
}

function setWebsiteOsSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  res.setHeader("Set-Cookie", [
    `${WEBSITE_OS_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ].join("; "));
}

function clearWebsiteOsSessionCookie(res) {
  res.setHeader("Set-Cookie", [
    `${WEBSITE_OS_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0"
  ].join("; "));
}

function publicWorkspace(workspace = {}) {
  return {
    id: workspace.id,
    slug: workspace.slug,
    displayName: workspace.display_name,
    domain: workspace.domain,
    status: workspace.status
  };
}

function publicUser(user = {}) {
  return {
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    active: user.active === true,
    lastLogin: user.last_login || null,
    passwordChangedAt: user.password_changed_at || user.updated_at || null
  };
}

function hasRole(userRole, allowedRoles = []) {
  if (!allowedRoles.length) return true;
  const rank = ROLE_RANK[normalizeRole(userRole)] || 0;
  return allowedRoles.some((role) => rank >= (ROLE_RANK[normalizeRole(role)] || 99));
}

async function getWorkspaceBySlug(slug) {
  const workspaceSlug = slugify(slug);
  if (!workspaceSlug) return null;
  const rows = await supabaseFetch([
    `website_os_workspaces?slug=eq.${encodeURIComponent(workspaceSlug)}`,
    "status=eq.active",
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : null;
}

async function getUserByEmail(workspaceId, email) {
  const rows = await supabaseFetch([
    `website_os_users?workspace_id=eq.${encodeURIComponent(workspaceId)}`,
    `email=eq.${encodeURIComponent(normalizeEmail(email))}`,
    "active=eq.true",
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : null;
}

async function createWebsiteOsSession(req, res, workspace, user) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + WEBSITE_OS_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseFetch("website_os_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      workspace_id: workspace.id,
      user_id: user.id,
      session_token: sessionTokenHash(rawToken),
      expires_at: expiresAt,
      last_activity: now,
      user_agent: clean(req?.headers?.["user-agent"]).slice(0, 240) || null,
      ip_hash: authFingerprint(requestIp(req))
    })
  });
  await supabaseFetch(`website_os_users?id=eq.${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_login: now, updated_at: now })
  });
  setWebsiteOsSessionCookie(res, rawToken, expiresAt);
  return { expiresAt };
}

async function writeWebsiteOsAuthEvent({ workspace = null, user = null, eventType, success, identifiers = {}, req = null, metadata = {} }) {
  await supabaseFetch("website_os_auth_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      workspace_id: workspace?.id || null,
      user_id: user?.id || null,
      event_type: eventType,
      success: success === true,
      email_hash: identifiers.emailHash || null,
      ip_hash: identifiers.ipHash || null,
      metadata: {
        host: requestHost(req),
        userAgent: clean(req?.headers?.["user-agent"]).slice(0, 240),
        ...metadata
      }
    })
  }).catch(() => {});
}

async function currentAuthRateLimit(identifiers) {
  const rows = await supabaseFetch([
    `website_os_auth_rate_limits?workspace_slug=eq.${encodeURIComponent(identifiers.workspaceSlug)}`,
    `email_hash=eq.${encodeURIComponent(identifiers.emailHash)}`,
    `ip_hash=eq.${encodeURIComponent(identifiers.ipHash)}`,
    "select=failure_count,locked_until,window_started_at",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function registerAuthAttempt(identifiers, succeeded) {
  return supabaseFetch("rpc/website_os_register_auth_attempt", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_slug: identifiers.workspaceSlug,
      p_email_hash: identifiers.emailHash,
      p_ip_hash: identifiers.ipHash,
      p_succeeded: succeeded === true,
      p_window_seconds: Math.round(WEBSITE_OS_LOGIN_WINDOW_MS / 1000),
      p_max_failures: WEBSITE_OS_LOGIN_MAX_FAILURES,
      p_lock_seconds: Math.round(WEBSITE_OS_LOGIN_LOCK_MS / 1000)
    })
  });
}

async function getWebsiteOsSession(req, options = {}) {
  const token = parseCookies(req)[WEBSITE_OS_SESSION_COOKIE];
  if (!token) return null;
  const now = new Date().toISOString();
  const rows = await supabaseFetch([
    `website_os_sessions?session_token=eq.${encodeURIComponent(sessionTokenHash(token))}`,
    `expires_at=gt.${encodeURIComponent(now)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const session = Array.isArray(rows) ? rows[0] : null;
  if (!session) return null;

  const [workspaceRows, userRows] = await Promise.all([
    supabaseFetch(`website_os_workspaces?id=eq.${encodeURIComponent(session.workspace_id)}&status=eq.active&select=*&limit=1`),
    supabaseFetch(`website_os_users?id=eq.${encodeURIComponent(session.user_id)}&active=eq.true&select=*&limit=1`)
  ]);
  const workspace = Array.isArray(workspaceRows) ? workspaceRows[0] : null;
  const user = Array.isArray(userRows) ? userRows[0] : null;
  if (!workspace || !user || user.workspace_id !== workspace.id) return null;
  const expectedSlug = slugify(options.slug || "");
  if (expectedSlug && workspace.slug !== expectedSlug) return null;

  supabaseFetch(`website_os_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_activity: now })
  }).catch(() => {});

  return { session, workspace, user };
}

async function requireWebsiteOsSession(req, options = {}) {
  const current = await getWebsiteOsSession(req, options);
  if (!current) {
    const error = new Error("Website OS session required");
    error.statusCode = 401;
    error.code = "WEBSITE_OS_SESSION_REQUIRED";
    throw error;
  }
  if (!hasRole(current.user.role, options.roles || [])) {
    const error = new Error("Website OS permission denied");
    error.statusCode = 403;
    error.code = "WEBSITE_OS_PERMISSION_DENIED";
    throw error;
  }
  return current;
}

async function loginWebsiteOsUser(req, res, { slug, email, password }) {
  const identifiers = authIdentifiers(req, slug, email);
  const rate = await currentAuthRateLimit(identifiers);
  if (rate?.locked_until && Date.parse(rate.locked_until) > Date.now()) {
    await writeWebsiteOsAuthEvent({ eventType: "login_rate_limited", success: false, identifiers, req });
    const error = new Error("Too many login attempts. Try again in 15 minutes.");
    error.statusCode = 429;
    error.code = "WEBSITE_OS_LOGIN_RATE_LIMITED";
    throw error;
  }
  const workspace = await getWorkspaceBySlug(slug);
  const user = workspace ? await getUserByEmail(workspace.id, email) : null;
  const passwordOk = await bcrypt.compare(clean(password), user?.password_hash || WEBSITE_OS_DUMMY_PASSWORD_HASH);
  if (!workspace || !user || !passwordOk) {
    const result = await registerAuthAttempt(identifiers, false);
    await writeWebsiteOsAuthEvent({ workspace, user, eventType: "login_failed", success: false, identifiers, req });
    if (result?.locked === true) {
      const rateError = new Error("Too many login attempts. Try again in 15 minutes.");
      rateError.statusCode = 429;
      rateError.code = "WEBSITE_OS_LOGIN_RATE_LIMITED";
      throw rateError;
    }
    const error = new Error("Incorrect password.");
    error.statusCode = 401;
    error.code = "INCORRECT_PASSWORD";
    throw error;
  }
  await registerAuthAttempt(identifiers, true);
  const session = await createWebsiteOsSession(req, res, workspace, user);
  await writeWebsiteOsAuthEvent({ workspace, user, eventType: "login_succeeded", success: true, identifiers, req });
  return {
    workspace: publicWorkspace(workspace),
    user: publicUser(user),
    expiresAt: session.expiresAt
  };
}

async function logoutWebsiteOsUser(req, res) {
  const current = await getWebsiteOsSession(req).catch(() => null);
  const token = parseCookies(req)[WEBSITE_OS_SESSION_COOKIE];
  if (token) {
    await supabaseFetch(`website_os_sessions?session_token=eq.${encodeURIComponent(sessionTokenHash(token))}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    }).catch(() => {});
  }
  clearWebsiteOsSessionCookie(res);
  if (current) {
    await writeWebsiteOsAuthEvent({
      workspace: current.workspace,
      user: current.user,
      eventType: "logout",
      success: true,
      identifiers: authIdentifiers(req, current.workspace.slug, current.user.email),
      req
    });
  }
}

async function changeWebsiteOsPassword(req, { slug, currentPassword, newPassword }) {
  const current = await requireWebsiteOsSession(req, { slug, roles: ["Owner", "Admin"] });
  const validCurrent = await bcrypt.compare(clean(currentPassword), current.user.password_hash || "");
  if (!validCurrent) {
    const error = new Error("Current password is incorrect.");
    error.statusCode = 401;
    error.code = "CURRENT_PASSWORD_INCORRECT";
    throw error;
  }
  const nextPassword = clean(newPassword);
  if (nextPassword.length < 12) {
    const error = new Error("New password must be at least 12 characters.");
    error.statusCode = 400;
    error.code = "PASSWORD_TOO_SHORT";
    throw error;
  }
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(nextPassword, 12);
  await supabaseFetch(`website_os_users?id=eq.${encodeURIComponent(current.user.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      password_hash: passwordHash,
      password_changed_at: now,
      updated_at: now
    })
  });
  await supabaseFetch([
    `website_os_sessions?user_id=eq.${encodeURIComponent(current.user.id)}`,
    `id=neq.${encodeURIComponent(current.session.id)}`
  ].join("&"), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  }).catch(() => {});
  await writeWebsiteOsAuthEvent({
    workspace: current.workspace,
    user: current.user,
    eventType: "password_changed",
    success: true,
    identifiers: authIdentifiers(req, current.workspace.slug, current.user.email),
    req
  });
  return { changedAt: now };
}

async function logoutOtherWebsiteOsSessions(req, { slug } = {}) {
  const current = await requireWebsiteOsSession(req, { slug, roles: ["Owner", "Admin"] });
  await supabaseFetch([
    `website_os_sessions?user_id=eq.${encodeURIComponent(current.user.id)}`,
    `id=neq.${encodeURIComponent(current.session.id)}`
  ].join("&"), {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  await writeWebsiteOsAuthEvent({
    workspace: current.workspace,
    user: current.user,
    eventType: "sessions_revoked",
    success: true,
    identifiers: authIdentifiers(req, current.workspace.slug, current.user.email),
    req
  });
  return { revoked: true };
}

async function listWebsiteOsSessions(req, { slug } = {}) {
  const current = await requireWebsiteOsSession(req, { slug });
  const rows = await supabaseFetch([
    `website_os_sessions?workspace_id=eq.${encodeURIComponent(current.workspace.id)}`,
    `user_id=eq.${encodeURIComponent(current.user.id)}`,
    `expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    "select=id,created_at,last_activity,expires_at,user_agent",
    "order=last_activity.desc"
  ].join("&"));
  return {
    sessions: (Array.isArray(rows) ? rows : []).map((session) => ({
      id: session.id,
      createdAt: session.created_at,
      lastActivity: session.last_activity,
      expiresAt: session.expires_at,
      userAgent: clean(session.user_agent).slice(0, 240),
      current: session.id === current.session.id
    }))
  };
}

async function revokeWebsiteOsSession(req, { slug, sessionId } = {}) {
  const current = await requireWebsiteOsSession(req, { slug });
  const targetId = clean(sessionId);
  if (!targetId || targetId === current.session.id) {
    const error = new Error(targetId ? "Use Log out to end the current session." : "Session is required.");
    error.statusCode = 400;
    error.code = targetId ? "CURRENT_SESSION_REVOKE_REJECTED" : "SESSION_REQUIRED";
    throw error;
  }
  const rows = await supabaseFetch([
    `website_os_sessions?id=eq.${encodeURIComponent(targetId)}`,
    `workspace_id=eq.${encodeURIComponent(current.workspace.id)}`,
    `user_id=eq.${encodeURIComponent(current.user.id)}`,
    "select=id",
    "limit=1"
  ].join("&"));
  if (!Array.isArray(rows) || !rows[0]) {
    const error = new Error("Session not found.");
    error.statusCode = 404;
    error.code = "SESSION_NOT_FOUND";
    throw error;
  }
  await supabaseFetch(`website_os_sessions?id=eq.${encodeURIComponent(targetId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  await writeWebsiteOsAuthEvent({
    workspace: current.workspace,
    user: current.user,
    eventType: "session_revoked",
    success: true,
    identifiers: authIdentifiers(req, current.workspace.slug, current.user.email),
    req,
    metadata: { sessionId: targetId }
  });
  return { revoked: true, sessionId: targetId };
}

module.exports = {
  WEBSITE_OS_SESSION_COOKIE,
  assertWebsiteOsRequestOrigin,
  changeWebsiteOsPassword,
  clearWebsiteOsSessionCookie,
  getWebsiteOsSession,
  listWebsiteOsSessions,
  loginWebsiteOsUser,
  logoutOtherWebsiteOsSessions,
  logoutWebsiteOsUser,
  publicUser,
  publicWorkspace,
  revokeWebsiteOsSession,
  requireWebsiteOsSession
};
