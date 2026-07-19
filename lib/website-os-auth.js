const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { clean, slugify, supabaseFetch } = require("./ops");

const WEBSITE_OS_SESSION_COOKIE = "don_website_os_session";
const WEBSITE_OS_SESSION_DAYS = 14;
const ROLE_RANK = {
  Owner: 4,
  Admin: 3,
  Editor: 2,
  Viewer: 1
};

function normalizeEmail(value) {
  return clean(value).toLowerCase();
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

async function createWebsiteOsSession(res, workspace, user) {
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
      last_activity: now
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

async function loginWebsiteOsUser(res, { slug, email, password }) {
  const workspace = await getWorkspaceBySlug(slug);
  const user = workspace ? await getUserByEmail(workspace.id, email) : null;
  const passwordOk = user?.password_hash
    ? await bcrypt.compare(clean(password), user.password_hash)
    : false;
  if (!workspace || !user || !passwordOk) {
    const error = new Error("Incorrect password.");
    error.statusCode = 401;
    error.code = "INCORRECT_PASSWORD";
    throw error;
  }
  const session = await createWebsiteOsSession(res, workspace, user);
  return {
    workspace: publicWorkspace(workspace),
    user: publicUser(user),
    expiresAt: session.expiresAt
  };
}

async function logoutWebsiteOsUser(req, res) {
  const token = parseCookies(req)[WEBSITE_OS_SESSION_COOKIE];
  if (token) {
    await supabaseFetch(`website_os_sessions?session_token=eq.${encodeURIComponent(sessionTokenHash(token))}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    }).catch(() => {});
  }
  clearWebsiteOsSessionCookie(res);
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
  return { revoked: true };
}

module.exports = {
  WEBSITE_OS_SESSION_COOKIE,
  changeWebsiteOsPassword,
  clearWebsiteOsSessionCookie,
  getWebsiteOsSession,
  loginWebsiteOsUser,
  logoutOtherWebsiteOsSessions,
  logoutWebsiteOsUser,
  publicUser,
  publicWorkspace,
  requireWebsiteOsSession
};
