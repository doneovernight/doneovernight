const crypto = require("crypto");

const { buildTaskPayload } = require("../lib/tasks/model");
const { createTaskId, saveTask, TaskPersistenceError } = require("../lib/tasks/store");
const { syncAccessKeyCredential } = require("../lib/ops");
const { claimOperatorClientRelationship, normalizeHandle } = require("../lib/operator-relationships");

const SUPABASE_TIMEOUT_MS = 10_000;
const SUPABASE_AUTH_TIMEOUT_MS = 10_000;
const WORKSPACE_SESSION_COOKIE = "don_workspace_session";

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUsername(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 30);
}

function isValidUsername(value) {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(value);
}

function generateAccessKey() {
  return `DONE-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function hashWorkspaceToken(token) {
  return crypto.createHash("sha256").update(clean(token)).digest("hex");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSaiAmyException({ name, email, projectName }) {
  return projectName.toLowerCase() === "saiuniversity branding"
    && (name.toLowerCase() === "amy" || email.toLowerCase() === "amymichellege2");
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Client onboarding is not configured");
    error.code = "CLIENT_ONBOARDING_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return { url, serviceRoleKey };
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 200_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function supabaseFetch(path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Supabase request failed: ${response.status}`);
      error.statusCode = response.status;
      error.detail = text.slice(0, 500);
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function verifySupabaseAccessToken(accessToken) {
  const token = clean(accessToken);
  if (!token) return null;
  const { url, serviceRoleKey } = getSupabaseConfig();
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
      const error = new Error("Google identity could not be verified");
      error.statusCode = 401;
      error.code = "GOOGLE_IDENTITY_INVALID";
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function findPortalByEmail(email) {
  if (!email) return null;
  const rows = await supabaseFetch(`portal_requests?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function findPortalByUsername(username) {
  if (!username) return null;
  const rows = await supabaseFetch(`portal_requests?username=ilike.${encodeURIComponent(username)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function createPortalLead({ email, name, username, accessKey, projectName, taskId, notes, source, allowLegacySaiAccess, operatorReferral = {} }) {
  const workspaceSlug = slugify(username || projectName || name || email);
  const now = new Date().toISOString();
  const operatorSlug = normalizeHandle(operatorReferral.operator_slug || operatorReferral.operator_handle || operatorReferral.referral_operator_slug || operatorReferral.referring_operator_slug);
  const basePayload = {
    email,
    name,
    username,
    access_key: accessKey,
    workspace_slug: workspaceSlug,
    credentials_issued_at: now,
    status: allowLegacySaiAccess ? "active" : "pending",
    source,
    signup_method: "project_preview",
    marketing_consent: false,
    created_at: now
  };

  const enrichedPayload = {
    ...basePayload,
    company: projectName,
    intake_task_id: taskId,
    raw_payload: {
      task_id: taskId,
      project_name: projectName,
      notes,
      source,
      username,
      workspace_slug: workspaceSlug,
      access_delivery: "email_todo",
      ...(operatorSlug ? {
        referral_source: "operator_referral",
        referring_operator_slug: operatorSlug,
        referral_operator_slug: operatorSlug,
        operator_referral_slug: operatorSlug,
        operator_referral_name: clean(operatorReferral.operator_name || operatorReferral.operator_display_name),
        operator_referral_role: clean(operatorReferral.operator_role || operatorReferral.operator_category),
        referral_url: clean(operatorReferral.referral_url),
        referral_submitted_at: now
      } : {})
    }
  };

  const existingByEmail = await findPortalByEmail(email);
  if (existingByEmail) {
    try {
      const rows = await supabaseFetch(`portal_requests?id=eq.${encodeURIComponent(existingByEmail.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name: existingByEmail.name || name,
          username: existingByEmail.username || username,
          access_key: existingByEmail.access_key || accessKey,
          workspace_slug: existingByEmail.workspace_slug || workspaceSlug,
          credentials_issued_at: existingByEmail.credentials_issued_at || now,
          status: allowLegacySaiAccess ? "active" : (existingByEmail.status || "pending"),
          company: projectName,
          intake_task_id: taskId,
          raw_payload: enrichedPayload.raw_payload
        })
      });
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch (error) {
      if (error.statusCode === 409) {
        error.code = "CLIENT_USERNAME_TAKEN";
        error.statusCode = 409;
      }
      throw error;
    }
  }

  try {
    const rows = await supabaseFetch("portal_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(enrichedPayload)
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    const rows = await supabaseFetch("portal_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(basePayload)
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
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

async function createWorkspaceSessionForLead(res, portalLead) {
  const workspaceSlug = slugify(portalLead.workspace_slug || portalLead.username || portalLead.company || portalLead.name || portalLead.email);
  if (!workspaceSlug || !portalLead.email) return null;
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseFetch("workspace_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      portal_request_id: String(portalLead.id || ""),
      email: normalizeEmail(portalLead.email),
      workspace_slug: workspaceSlug,
      token_hash: hashWorkspaceToken(rawToken),
      expires_at: expiresAt
    })
  });
  setWorkspaceCookie(res, rawToken, expiresAt);
  return {
    session: Array.isArray(rows) ? rows[0] : rows,
    workspaceSlug,
    workspacePath: `/workspace/@${workspaceSlug}`,
    expiresAt
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const googleUser = await verifySupabaseAccessToken(input.google_access_token || input.googleAccessToken);
    const googleMeta = googleUser?.user_metadata || {};
    const name = clean(googleMeta.full_name || googleMeta.name || input.name);
    const email = normalizeEmail(googleUser?.email || input.email);
    const username = normalizeUsername(input.username || input.handle || "");
    const projectName = clean(input.project_name || input.projectName);
    const notes = clean(input.notes);
    const source = clean(input.source) || "client_onboarding";
    const operatorSlug = normalizeHandle(input.operator_slug || input.operator_handle || input.referral_operator_slug || input.referring_operator_slug);
    const operatorReferral = {
      operator_slug: operatorSlug,
      operator_name: clean(input.operator_name || input.operatorName),
      operator_role: clean(input.operator_role || input.operatorRole || input.operator_category),
      referral_url: clean(input.referral_url || input.referralUrl)
    };
    const isSaiUniversityPreview = source === "saiuniversity_preview";
    const allowLegacySaiAccess = isSaiAmyException({ name, email, projectName });

    if (!name) {
      return send(res, 400, {
        success: false,
        error: "Missing onboarding fields",
        code: "CLIENT_ONBOARDING_FIELDS_REQUIRED"
      });
    }

    if (!username || !isValidUsername(username)) {
      return send(res, 400, {
        success: false,
        error: "Choose a username to continue.",
        code: "CLIENT_ONBOARDING_USERNAME_REQUIRED"
      });
    }

    if (!projectName) {
      return send(res, 400, {
        success: false,
        error: "Add a project name so operations can prepare the workspace.",
        code: "CLIENT_ONBOARDING_PROJECT_REQUIRED"
      });
    }

    if (!email || (!isValidEmail(email) && !allowLegacySaiAccess)) {
      return send(res, 400, {
        success: false,
        error: "Please enter a valid email address.",
        code: "CLIENT_ONBOARDING_EMAIL_INVALID"
      });
    }

    const usernameOwner = await findPortalByUsername(username);
    if (usernameOwner && normalizeEmail(usernameOwner.email) !== email) {
      return send(res, 409, {
        success: false,
        error: "That username is already in use.",
        code: "CLIENT_USERNAME_TAKEN"
      });
    }

    const now = new Date();
    const taskId = createTaskId(now);
    const accessKey = usernameOwner?.access_key || generateAccessKey();
    const task = buildTaskPayload({
      name,
      email,
      company: projectName,
      taskSummary: projectName,
      deadline: "manual release",
      links: isSaiUniversityPreview ? ["/workspace-assets/saiuniversity-preview/"] : [],
      attachments: [],
      source,
      intakeVersion: isSaiUniversityPreview ? "saiuniversity_preview_v1" : "client_onboarding_v1",
      priority: "standard"
    }, taskId, now);

    task.rawPayload = {
      ...task.rawPayload,
      project_name: projectName,
      notes,
      username,
      google_provider_id: googleUser?.id || null,
      profile_image: clean(input.profile_image || input.profileImage || googleMeta.avatar_url || googleMeta.picture),
      release_required: isSaiUniversityPreview,
      ...(operatorSlug ? {
        referral_source: "operator_referral",
        referring_operator_slug: operatorSlug,
        referral_operator_slug: operatorSlug,
        operator_referral_slug: operatorSlug,
        operator_referral_name: operatorReferral.operator_name,
        operator_referral_role: operatorReferral.operator_role,
        referral_url: operatorReferral.referral_url,
        referral_submitted_at: now.toISOString()
      } : {}),
      ...(isSaiUniversityPreview ? { preview_link: "/workspace-assets/saiuniversity-preview/" } : {})
    };

    const persistedTask = await saveTask(task);
    const portalLead = await createPortalLead({ email, name, username, accessKey, projectName, taskId, notes, source, allowLegacySaiAccess, operatorReferral });
    const operatorRelationship = operatorSlug
      ? await claimOperatorClientRelationship({
        portalRequest: portalLead,
        operatorSlug,
        source: "operator_referral"
      }).catch((error) => ({
        success: false,
        error: error.code || error.message || "OPERATOR_RELATIONSHIP_FAILED"
      }))
      : null;
    await syncAccessKeyCredential(portalLead, portalLead?.access_key || accessKey).catch((error) => {
      console.warn(`Access key sync warning: ${error.code || error.message}`);
    });
    const workspaceSession = allowLegacySaiAccess
      ? await createWorkspaceSessionForLead(res, portalLead).catch(() => null)
      : null;
    const workspaceSlug = slugify(portalLead?.workspace_slug || portalLead?.username || username || projectName);

    return send(res, 200, {
      success: true,
      taskId,
      email,
      name,
      username: portalLead?.username || username,
      accessKey: portalLead?.access_key || accessKey,
      projectName,
      status: allowLegacySaiAccess ? "active" : "pending",
      workspacePath: `/workspace/@${workspaceSlug}`,
      workspaceSlug,
      operatorRelationship,
      ...(workspaceSession ? { workspacePath: workspaceSession.workspacePath, workspaceSlug: workspaceSession.workspaceSlug } : {}),
      portalPath: "/portal.html",
      accessEmailStatus: "not_configured",
      persistedTask,
      portalLead
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }
    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }

    const statusCode = error instanceof TaskPersistenceError ? error.statusCode : error.statusCode || 500;
    const code = error instanceof TaskPersistenceError ? error.code : error.code || "CLIENT_ONBOARDING_FAILED";
    console.warn(`Client onboarding error: ${code}`);
    if (code === "CLIENT_USERNAME_TAKEN") {
      return send(res, 409, { success: false, error: "That username is already in use.", code });
    }
    return send(res, statusCode, {
      success: false,
      error: "Could not create client onboarding record",
      code
    });
  }
};
