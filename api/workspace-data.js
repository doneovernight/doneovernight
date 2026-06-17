const crypto = require("crypto");

const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const ADMIN_AUTH_TIMEOUT_MS = 10_000;
const SUPABASE_AUTH_TIMEOUT_MS = 10_000;
const DEFAULT_SESSION_DAYS = 21;

const {
  clean,
  findPortalRequest,
  findPortalRequestByIdentifier,
  findPortalRequestById,
  findTasksForWorkspace,
  getCanonicalAccessKeyForPortalRequest,
  getWorkspaceSessionFromRequest,
  hashWorkspaceToken,
  inferWorkspaceSlug,
  isActiveClient,
  normalizeAccessKey,
  parseBody,
  send,
  slugify,
  supabaseFetch,
  WORKSPACE_SESSION_COOKIE,
  workspaceSessionMatchesRequest
} = require("../lib/ops");

async function verifyAdminKey(adminKey) {
  if (!adminKey) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADMIN_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(ADMIN_AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ admin_key: adminKey }),
      signal: controller.signal
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data?.success === true;
  } finally {
    clearTimeout(timeout);
  }
}

function getRequestOrigin(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "doneovernight.com";
  return `${protocol}://${host}`;
}

function getCleanWorkspacePath(req, slug) {
  const cleanSlug = slugify(slug);
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return host === "portal.doneovernight.com" ? `/@${cleanSlug}` : `/workspace/@${cleanSlug}`;
}

function setWorkspaceCookie(res, token, expiresAt) {
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  res.setHeader("Set-Cookie", [
    `${WORKSPACE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; "));
}

function clearWorkspaceCookie(res) {
  res.setHeader("Set-Cookie", [
    `${WORKSPACE_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; "));
}

function getSupabaseAuthConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase auth is not configured");
    error.statusCode = 503;
    error.code = "SUPABASE_AUTH_NOT_CONFIGURED";
    throw error;
  }
  return { url, serviceRoleKey };
}

async function verifySupabaseAccessToken(accessToken) {
  const token = clean(accessToken);
  if (!token) {
    const error = new Error("Google session is required");
    error.statusCode = 400;
    error.code = "GOOGLE_SESSION_REQUIRED";
    throw error;
  }

  const { url, serviceRoleKey } = getSupabaseAuthConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error("Google session could not be verified");
      error.statusCode = 401;
      error.code = "GOOGLE_SESSION_INVALID";
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePortalRequest(input) {
  const byId = await findPortalRequestById(clean(input.portal_request_id || input.portalRequestId));
  if (byId) return byId;
  return findPortalRequest({
    email: clean(input.email).toLowerCase(),
    slug: slugify(input.workspace_slug || input.slug || "")
  });
}

async function createWorkspaceSession(req, input) {
  const portalRequest = await resolvePortalRequest(input);
  if (!portalRequest || !isActiveClient(portalRequest)) {
    const error = new Error("Workspace client is not active");
    error.statusCode = 404;
    throw error;
  }

  const workspaceSlug = inferWorkspaceSlug(portalRequest);
  if (!workspaceSlug) {
    const error = new Error("Workspace slug could not be resolved");
    error.statusCode = 400;
    throw error;
  }

  const days = Math.min(30, Math.max(1, Number(input.expires_in_days || input.expiresInDays || DEFAULT_SESSION_DAYS)));
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseFetch("workspace_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      portal_request_id: String(portalRequest.id || ""),
      email: clean(portalRequest.email).toLowerCase(),
      workspace_slug: workspaceSlug,
      token_hash: hashWorkspaceToken(rawToken),
      expires_at: expiresAt
    })
  });

  const path = `${getCleanWorkspacePath(req, workspaceSlug)}?token=${encodeURIComponent(rawToken)}`;
  return {
    session: Array.isArray(rows) ? rows[0] : rows,
    link: path,
    absoluteLink: `${getRequestOrigin(req)}${path}`,
    expiresAt,
    workspaceSlug
  };
}

async function redeemWorkspaceSession(req, res, input) {
  const token = clean(input.token);
  if (!token) {
    const error = new Error("Workspace token is required");
    error.statusCode = 400;
    throw error;
  }

  const tokenHash = hashWorkspaceToken(token);
  const now = new Date().toISOString();
  const rows = await supabaseFetch([
    `workspace_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`,
    "revoked_at=is.null",
    `expires_at=gt.${encodeURIComponent(now)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const session = Array.isArray(rows) ? rows[0] : null;
  if (!session) {
    const error = new Error("Workspace link is invalid or expired");
    error.statusCode = 401;
    throw error;
  }

  const portalRequest = await findPortalRequest({
    email: session.email,
    slug: session.workspace_slug
  });
  if (!portalRequest || !isActiveClient(portalRequest)) {
    const error = new Error("Workspace access is pending");
    error.statusCode = 403;
    throw error;
  }

  await supabaseFetch(`workspace_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: now })
  });

  setWorkspaceCookie(res, token, session.expires_at);
  const workspaceSlug = inferWorkspaceSlug(portalRequest) || session.workspace_slug;
  return {
    redirectTo: getCleanWorkspacePath(req, workspaceSlug),
    workspace: {
      slug: workspaceSlug,
      email: portalRequest.email || session.email,
      name: portalRequest.name || "",
      company: portalRequest.company || portalRequest.raw_payload?.project_name || ""
    }
  };
}

async function createWorkspaceSessionForPortalRequest(req, res, portalRequest) {
  const workspaceSlug = inferWorkspaceSlug(portalRequest);
  if (!workspaceSlug) {
    const error = new Error("Workspace slug could not be resolved");
    error.statusCode = 400;
    throw error;
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseFetch("workspace_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      portal_request_id: String(portalRequest.id || ""),
      email: clean(portalRequest.email).toLowerCase(),
      workspace_slug: workspaceSlug,
      token_hash: hashWorkspaceToken(rawToken),
      expires_at: expiresAt
    })
  });

  setWorkspaceCookie(res, rawToken, expiresAt);
  return {
    redirectTo: getCleanWorkspacePath(req, workspaceSlug),
    workspace: {
      slug: workspaceSlug,
      email: portalRequest.email || "",
      name: portalRequest.name || "",
      username: portalRequest.username || "",
      company: portalRequest.company || portalRequest.raw_payload?.project_name || ""
    }
  };
}

async function accessWorkspaceWithKey(req, res, input) {
  const identifier = clean(input.identifier || input.email || input.username || "").toLowerCase().replace(/^@+/, "");
  const accessKey = normalizeAccessKey(input.access_key || input.accessKey);
  if (!identifier || !accessKey) {
    const error = new Error("Workspace identifier and access key are required");
    error.statusCode = 400;
    throw error;
  }

  const portalRequest = await findPortalRequestByIdentifier(identifier);
  const canonicalAccessKey = portalRequest ? await getCanonicalAccessKeyForPortalRequest(portalRequest) : "";

  if (!portalRequest || !isActiveClient(portalRequest) || canonicalAccessKey !== accessKey) {
    const error = new Error("Workspace access could not be verified");
    error.statusCode = 401;
    throw error;
  }

  return createWorkspaceSessionForPortalRequest(req, res, portalRequest);
}

async function accessWorkspaceWithGoogle(req, res, input) {
  const user = await verifySupabaseAccessToken(input.access_token || input.accessToken);
  const email = clean(user.email).toLowerCase();
  if (!email) {
    const error = new Error("Google account email could not be verified");
    error.statusCode = 401;
    error.code = "GOOGLE_EMAIL_REQUIRED";
    throw error;
  }

  const portalRequest = await findPortalRequest({ email });
  if (!portalRequest || !isActiveClient(portalRequest)) {
    const error = new Error("No active workspace found for this account.");
    error.statusCode = 404;
    error.code = "GOOGLE_WORKSPACE_NOT_FOUND";
    throw error;
  }

  return createWorkspaceSessionForPortalRequest(req, res, portalRequest);
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    if (req.method === "POST") {
      const input = await parseBody(req);
      const action = clean(input.action || "redeem");

      if (action === "create") {
        const authorized = await verifyAdminKey(clean(input.admin_key || input.adminKey || req.headers["x-admin-key"]));
        if (!authorized) return send(res, 401, { success: false, error: "Admin access denied" });
        const result = await createWorkspaceSession(req, input);
        return send(res, 200, { success: true, ...result });
      }

      if (action === "redeem") {
        const result = await redeemWorkspaceSession(req, res, input);
        return send(res, 200, { success: true, ...result });
      }

      if (action === "access") {
        const result = await accessWorkspaceWithKey(req, res, input);
        return send(res, 200, { success: true, ...result });
      }

      if (action === "google_access") {
        const result = await accessWorkspaceWithGoogle(req, res, input);
        return send(res, 200, { success: true, authMethod: "google", ...result });
      }

      if (action === "logout") {
        clearWorkspaceCookie(res);
        return send(res, 200, { success: true, redirectTo: "/portal" });
      }

      return send(res, 400, { success: false, error: "Unsupported workspace session action" });
    }

    const url = new URL(req.url, `https://${req.headers.host || "doneovernight.com"}`);
    const slug = slugify(url.searchParams.get("slug") || "");
    const email = clean(url.searchParams.get("email") || "").toLowerCase();
    const session = await getWorkspaceSessionFromRequest(req);

    if (!session || !workspaceSessionMatchesRequest(session, { email, slug })) {
      return send(res, 401, {
        success: false,
        status: "private",
        error: "Private workspace access required",
        code: "WORKSPACE_SESSION_REQUIRED"
      });
    }

    const portalRequest = await findPortalRequest({
      email: session.email,
      slug: session.workspace_slug
    });

    if (!portalRequest || !isActiveClient(portalRequest)) {
      return send(res, 200, {
        success: false,
        status: portalRequest?.status || "pending",
        error: "Workspace not found or access pending",
        code: "WORKSPACE_ACCESS_PENDING"
      });
    }

    const workspaceSlug = inferWorkspaceSlug(portalRequest);
    const tasks = await findTasksForWorkspace({ email: portalRequest.email, slug: workspaceSlug });
    return send(res, 200, {
      success: true,
      workspace: {
        id: portalRequest.id || "",
        slug: workspaceSlug,
        name: portalRequest.name || "",
        email: portalRequest.email || "",
        username: portalRequest.username || "",
        company: portalRequest.company || portalRequest.raw_payload?.project_name || "",
        status: portalRequest.status || "active"
      },
      tasks
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }
    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: error.statusCode && error.statusCode < 500 ? error.message : "Could not load workspace",
      code: error.code || "WORKSPACE_DATA_FAILED"
    });
  }
};
