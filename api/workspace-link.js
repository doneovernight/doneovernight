const SUPABASE_TIMEOUT_MS = 10_000;
const { syncAccessKeyCredential } = require("../lib/ops");

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Workspace linking is not configured");
    error.code = "WORKSPACE_LINK_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return { url, serviceRoleKey };
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
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

async function findSubmittedTask(taskId, email) {
  const query = [
    `task_id=eq.${encodeURIComponent(taskId)}`,
    `email=eq.${encodeURIComponent(email)}`,
    "select=task_id,email,name,company,source,created_at",
    "limit=1"
  ].join("&");
  const rows = await supabaseFetch(`task_requests?${query}`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function findPortalRequest(email) {
  const query = [
    `email=eq.${encodeURIComponent(email)}`,
    "select=*",
    "order=created_at.desc",
    "limit=1"
  ].join("&");
  const rows = await supabaseFetch(`portal_requests?${query}`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function findAccessKey(email) {
  try {
    const query = [
      `email=eq.${encodeURIComponent(email)}`,
      "select=*",
      "order=created_at.desc",
      "limit=1"
    ].join("&");
    const rows = await supabaseFetch(`access_keys?${query}`);
    return Array.isArray(rows) ? rows[0] : null;
  } catch (error) {
    return null;
  }
}

async function createPortalRequest({ email, name, company, taskId, source }) {
  const basePayload = {
    email,
    name,
    status: "pending",
    source: "task_intake_handoff",
    signup_method: "intake_handoff",
    marketing_consent: false,
    created_at: new Date().toISOString()
  };
  const enrichedPayload = {
    ...basePayload,
    company: company || null,
    intake_task_id: taskId,
    raw_payload: {
      task_id: taskId,
      source
    }
  };

  try {
    const rows = await supabaseFetch("portal_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(enrichedPayload)
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    try {
      const rows = await supabaseFetch("portal_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(basePayload)
      });
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (fallbackError) {
      const rows = await supabaseFetch("portal_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          email,
          name,
          status: "pending",
          source: "task_intake_handoff"
        })
      });
      return Array.isArray(rows) ? rows[0] : rows;
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const taskId = clean(input.taskId || input.task_id);
    const email = normalizeEmail(input.email);
    const name = clean(input.name);
    const company = clean(input.company);
    const source = clean(input.source) || "task_intake";

    if (!taskId || !email) {
      return send(res, 400, {
        success: false,
        error: "Missing workspace link fields",
        code: "WORKSPACE_LINK_FIELDS_REQUIRED"
      });
    }

    const submittedTask = await findSubmittedTask(taskId, email);
    if (!submittedTask) {
      return send(res, 403, {
        success: false,
        error: "Workspace link could not be verified",
        code: "WORKSPACE_LINK_NOT_VERIFIED"
      });
    }

    const portalRequest = await findPortalRequest(email);
    const linkedRequest = portalRequest || await createPortalRequest({
      email,
      name: name || submittedTask.name || "",
      company: company || submittedTask.company || "",
      taskId,
      source
    });
    const legacyAccessRecord = linkedRequest?.access_key ? null : await findAccessKey(email);
    const accessKey = linkedRequest?.access_key || legacyAccessRecord?.access_key || "";
    const status = clean(linkedRequest?.status || "pending").toLowerCase();
    if (linkedRequest && accessKey) {
      await syncAccessKeyCredential(linkedRequest, accessKey).catch(() => {});
    }
    const workspaceReady = status === "active" && Boolean(accessKey);

    return send(res, 200, {
      success: true,
      workspaceReady,
      setupRequired: !workspaceReady,
      status: workspaceReady ? "active" : clean(linkedRequest?.status || "pending"),
      taskId,
      email,
      name: clean(linkedRequest?.name || name || submittedTask.name || ""),
      company: company || submittedTask.company || "",
      source,
      workspacePath: "/workspace",
      portalPath: "/portal.html",
      ...(workspaceReady ? { access_key: accessKey } : {})
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }

    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }

    console.warn(`Workspace link error: ${error.code || error.message}`);
    return send(res, error.statusCode || 500, {
      success: false,
      error: "Could not prepare workspace link",
      code: error.code || "WORKSPACE_LINK_FAILED"
    });
  }
};
