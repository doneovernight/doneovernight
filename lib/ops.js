const crypto = require("crypto");

const SUPABASE_TIMEOUT_MS = 10_000;
const WEBHOOK_TIMEOUT_MS = 10_000;
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

function splitWebhookUrls(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function getWebhookUrls(envNames = [], defaultUrls = []) {
  const envUrls = envNames.flatMap((name) => splitWebhookUrls(process.env[name]));
  return [...new Set([
    ...envUrls,
    ...defaultUrls.map(clean).filter(Boolean)
  ])];
}

async function dispatchWebhook({ tag, event, urls = [], payload = {}, timeoutMs = WEBHOOK_TIMEOUT_MS }) {
  const uniqueUrls = [...new Set(urls.map(clean).filter(Boolean))];
  const summary = {
    tag,
    event,
    attempted: uniqueUrls.length,
    fulfilled: 0,
    rejected: 0,
    urls: uniqueUrls
  };

  console.log(tag, "dispatch_start", {
    event,
    attempted: uniqueUrls.length,
    urls: uniqueUrls,
    payload_keys: Object.keys(payload || {})
  });

  if (!uniqueUrls.length) {
    console.warn(tag, "dispatch_skipped", { event, reason: "no_webhook_urls" });
    return summary;
  }

  const results = await Promise.allSettled(uniqueUrls.map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    console.log(tag, "webhook_post", {
      event,
      url,
      email: payload.email || payload.to || null,
      application_id: payload.application_id || null,
      operator_id: payload.operator_id || null
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const responseText = await response.text().catch(() => "");
      if (!response.ok) {
        const error = new Error(`Webhook POST failed: ${response.status}`);
        error.statusCode = response.status;
        error.url = url;
        error.responseText = responseText.slice(0, 500);
        throw error;
      }

      console.log("[WEBHOOK_SUCCESS]", {
        tag,
        event,
        url,
        status: response.status,
        response_preview: responseText.slice(0, 300)
      });
      return { url, status: response.status };
    } catch (error) {
      console.error("[WEBHOOK_ERROR]", {
        tag,
        event,
        url,
        message: error.message,
        status: error.statusCode || null,
        response_preview: error.responseText || null
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }));

  summary.fulfilled = results.filter((result) => result.status === "fulfilled").length;
  summary.rejected = results.filter((result) => result.status === "rejected").length;
  summary.errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => ({
      message: result.reason?.message || "Webhook failed",
      status: result.reason?.statusCode || null,
      response_preview: result.reason?.responseText || null
    }));

  console.log(tag, "dispatch_complete", summary);
  return summary;
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

function hashWorkspaceToken(token) {
  return crypto.createHash("sha256").update(clean(token)).digest("hex");
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    if (key) cookies[key] = value;
    return cookies;
  }, {});
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase is not configured");
    error.code = "SUPABASE_NOT_CONFIGURED";
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
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

function inferWorkspaceSlug(record = {}) {
  return slugify(record.workspace_slug || record.username || record.slug || record.company || record.name || record.email || "");
}

function recordMatchesSlug(record, slug) {
  const normalizedSlug = slugify(slug);
  const candidates = [
    record.workspace_slug,
    record.username,
    record.slug,
    record.company_slug,
    record.company,
    record.name,
    record.email,
    record.raw_payload?.project_name,
    record.raw_payload?.company_slug,
    record.raw_payload?.workspace_slug,
    record.raw_payload?.source
  ].map(slugify).filter(Boolean);
  return candidates.includes(normalizedSlug);
}

function isActiveClient(record = {}) {
  return clean(record.status).toLowerCase() === "active";
}

function normalizeAccessKey(value) {
  return clean(value).toUpperCase();
}

async function findAccessKeyRowsByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];
  try {
    const rows = await supabaseFetch([
      `access_keys?email=eq.${encodeURIComponent(normalizedEmail)}`,
      "select=*",
      "order=created_at.desc",
      "limit=20"
    ].join("&"));
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    try {
      const rows = await supabaseFetch([
        `access_keys?email=eq.${encodeURIComponent(normalizedEmail)}`,
        "select=*",
        "limit=20"
      ].join("&"));
      return Array.isArray(rows) ? rows : [];
    } catch (fallbackError) {
      return [];
    }
  }
}

async function writeAccessKeyRecord(path, options, payload) {
  const attempts = [
    payload,
    {
      email: payload.email,
      access_key: payload.access_key,
      status: payload.status,
      portal_request_id: payload.portal_request_id
    },
    {
      email: payload.email,
      access_key: payload.access_key,
      status: payload.status
    },
    {
      email: payload.email,
      access_key: payload.access_key
    }
  ].filter((item, index, array) => item && array.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index);

  let lastError;
  for (const attempt of attempts) {
    try {
      return await supabaseFetch(path, {
        ...options,
        body: JSON.stringify(attempt)
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function syncAccessKeyCredential(portalRequest = {}, accessKeyInput = "") {
  const accessKey = normalizeAccessKey(accessKeyInput || portalRequest.access_key);
  const email = normalizeEmail(portalRequest.email);
  if (!email || !accessKey) return { success: false, reason: "missing_identity" };

  const now = new Date().toISOString();
  const workspaceSlug = inferWorkspaceSlug(portalRequest);
  const credentialPayload = {
    portal_request_id: String(portalRequest.id || ""),
    email,
    name: clean(portalRequest.name),
    username: clean(portalRequest.username).toLowerCase().replace(/^@+/, ""),
    workspace_slug: workspaceSlug,
    access_key: accessKey,
    status: "active",
    issued_at: portalRequest.credentials_issued_at || now,
    updated_at: now
  };

  if (normalizeAccessKey(portalRequest.access_key) !== accessKey && portalRequest.id) {
    try {
      await supabaseFetch(`portal_requests?id=eq.${encodeURIComponent(portalRequest.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          access_key: accessKey,
          credentials_issued_at: portalRequest.credentials_issued_at || now,
          workspace_slug: portalRequest.workspace_slug || workspaceSlug
        })
      });
    } catch (error) {
      return { success: false, reason: "portal_request_sync_failed" };
    }
  }

  const existingRows = (await findAccessKeyRowsByEmail(email))
    .filter((row) => clean(row.credential_scope || "client").toLowerCase() !== "operator");
  const matchingRow = existingRows.find((row) => normalizeAccessKey(row.access_key) === accessKey);
  const rowsToRetire = existingRows.filter((row) => row.id && normalizeAccessKey(row.access_key) && normalizeAccessKey(row.access_key) !== accessKey);

  await Promise.all(rowsToRetire.map((row) => writeAccessKeyRecord(`access_keys?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" }
  }, {
    email,
    access_key: normalizeAccessKey(row.access_key),
    status: "revoked",
    revoked_at: now,
    updated_at: now
  }).catch(() => null)));

  if (matchingRow?.id) {
    await writeAccessKeyRecord(`access_keys?id=eq.${encodeURIComponent(matchingRow.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" }
    }, credentialPayload).catch(() => null);
    return { success: true, accessKey, credentialId: matchingRow.id };
  }

  await writeAccessKeyRecord("access_keys", {
    method: "POST",
    headers: { Prefer: "return=minimal" }
  }, {
    ...credentialPayload,
    created_at: now
  }).catch(() => null);

  return { success: true, accessKey };
}

async function getCanonicalAccessKeyForPortalRequest(portalRequest = {}) {
  const portalKey = normalizeAccessKey(portalRequest.access_key);
  if (portalKey) {
    syncAccessKeyCredential(portalRequest, portalKey).catch(() => {});
    return portalKey;
  }

  const accessRows = (await findAccessKeyRowsByEmail(portalRequest.email))
    .filter((row) => clean(row.credential_scope || "client").toLowerCase() !== "operator");
  const activeRow = accessRows.find((row) => clean(row.status).toLowerCase() !== "revoked" && normalizeAccessKey(row.access_key));
  const accessKey = normalizeAccessKey(activeRow?.access_key);
  if (!accessKey) return "";
  await syncAccessKeyCredential(portalRequest, accessKey).catch(() => {});
  return accessKey;
}

async function findPortalRequest({ email = "", slug = "" } = {}) {
  if (email) {
    const rows = await supabaseFetch([
      `portal_requests?email=eq.${encodeURIComponent(normalizeEmail(email))}`,
      "select=*",
      "order=created_at.desc",
      "limit=1"
    ].join("&"));
    return Array.isArray(rows) ? rows[0] : null;
  }

  const normalizedSlug = slugify(slug);
  if (!normalizedSlug) return null;
  const rows = await supabaseFetch("portal_requests?select=*&order=created_at.desc&limit=200");
  return (Array.isArray(rows) ? rows : []).find((record) => recordMatchesSlug(record, normalizedSlug)) || null;
}

async function findPortalRequestByIdentifier(identifier = "") {
  const cleanIdentifier = clean(identifier).toLowerCase().replace(/^@+/, "");
  if (!cleanIdentifier) return null;
  if (cleanIdentifier.includes("@")) {
    return findPortalRequest({ email: cleanIdentifier });
  }

  const rows = await supabaseFetch("portal_requests?select=*&order=created_at.desc&limit=500");
  return (Array.isArray(rows) ? rows : []).find((record) => {
    const username = clean(record.username).toLowerCase().replace(/^@+/, "");
    const workspaceSlug = inferWorkspaceSlug(record);
    const companySlug = slugify(record.company_slug || record.raw_payload?.company_slug || record.company || record.raw_payload?.project_name);
    return cleanIdentifier === username || cleanIdentifier === workspaceSlug || cleanIdentifier === companySlug;
  }) || null;
}

async function findPortalRequestById(id = "") {
  const cleanId = clean(id);
  if (!cleanId) return null;
  const rows = await supabaseFetch([
    `portal_requests?id=eq.${encodeURIComponent(cleanId)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : null;
}

async function getWorkspaceSessionFromRequest(req) {
  const token = parseCookies(req)[WORKSPACE_SESSION_COOKIE];
  if (!token) return null;
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
  if (!session) return null;

  supabaseFetch(`workspace_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: now })
  }).catch(() => {});

  return {
    ...session,
    email: normalizeEmail(session.email),
    workspace_slug: slugify(session.workspace_slug)
  };
}

function workspaceSessionMatchesRequest(session, { email = "", slug = "" } = {}) {
  if (!session) return false;
  const requestedEmail = normalizeEmail(email);
  const requestedSlug = slugify(slug);
  const sessionSlug = slugify(session.workspace_slug);
  if (requestedEmail && requestedEmail !== normalizeEmail(session.email)) return false;
  if (requestedSlug && requestedSlug !== sessionSlug) return false;
  return true;
}

async function findTasksForWorkspace({ email = "", slug = "" } = {}) {
  if (email) {
    const rows = await supabaseFetch([
      `task_requests?email=eq.${encodeURIComponent(normalizeEmail(email))}`,
      "select=*",
      "order=created_at.desc"
    ].join("&"));
    return Array.isArray(rows) ? rows : [];
  }

  const rows = await supabaseFetch("task_requests?select=*&order=created_at.desc&limit=200");
  return (Array.isArray(rows) ? rows : []).filter((task) => recordMatchesSlug(task, slug));
}

module.exports = {
  clean,
  dispatchWebhook,
  findPortalRequest,
  findPortalRequestByIdentifier,
  findPortalRequestById,
  findTasksForWorkspace,
  getCanonicalAccessKeyForPortalRequest,
  getWebhookUrls,
  getWorkspaceSessionFromRequest,
  hashWorkspaceToken,
  inferWorkspaceSlug,
  isActiveClient,
  normalizeAccessKey,
  normalizeEmail,
  parseBody,
  send,
  slugify,
  supabaseFetch,
  syncAccessKeyCredential,
  WORKSPACE_SESSION_COOKIE,
  workspaceSessionMatchesRequest
};
