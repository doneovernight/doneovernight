const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const SUPABASE_TIMEOUT_MS = 10_000;
const { buildSecureReviewUrl } = require("../lib/review-token");
const { withFreshTaskAttachmentUrls } = require("../lib/attachments");
const xContentRoutes = require("../lib/x-content/routes");
const { requireWebsiteOsSession } = require("../lib/website-os-auth");
const { listScopedRecords } = require("../lib/website-os-repository");
const { summarizeInvoices } = require("../lib/website-os-invoices");
const tenantContext = require("../lib/x-content/tenant-context");

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Admin tasks are not configured");
    error.code = "ADMIN_TASKS_NOT_CONFIGURED";
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
      if (body.length > 50_000) {
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

async function verifyAdminKey(adminKey) {
  if (!adminKey) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

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

async function verifyAdminOrWebsiteOsSession(req, adminKey) {
  if (adminKey && await verifyAdminKey(adminKey)) return { mode: "admin" };
  const current = await requireWebsiteOsSession(req, {
    slug: "cp",
    roles: ["Owner", "Admin", "Editor", "Viewer"]
  });
  return { mode: "website_os", workspaceSlug: current.workspace.slug, current };
}

function isCommonplaceTask(task = {}) {
  const raw = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const source = clean(task.source || raw.source || raw.booking_source || raw.bookingSource).toLowerCase();
  const workspace = clean(task.workspace || task.workspace_slug || raw.workspace || raw.workspace_slug).toLowerCase();
  return source === "commonpl4ce_booker" ||
    source === "commonpl4ce_booker_v1" ||
    source === "commonpl4ce_newsletter" ||
    workspace === "commonpl4ce" ||
    workspace === "cp";
}

async function fetchTasks() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/rest/v1/task_requests?select=*&order=created_at.desc`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`Supabase tasks read failed: ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichTask(task = {}) {
  const taskWithAttachments = await withFreshTaskAttachmentUrls(task).catch(() => task);
  const secureReviewUrl = buildSecureReviewUrl(task);
  return {
    ...taskWithAttachments,
    secure_review_url: secureReviewUrl || "",
    client_review_url: secureReviewUrl || task.client_review_url || task.raw_payload?.client_review_url || "",
    review_token_configured: Boolean(secureReviewUrl)
  };
}

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`);
  const xContentRoute = requestUrl.searchParams.get("x_content_route");
  if (xContentRoute && xContentRoutes[xContentRoute]) {
    // The legacy internal admin/cron boundary is the only Phase 1 compatibility
    // adapter. It supplies the seeded workspace after the cutover flag is on;
    // shared repositories still require an explicit context and never default.
    const routedRequest = tenantContext.workspaceScopingEnabled() && !req.tenantContext
      ? { ...req, tenantContext: tenantContext.seededCompatibilityContext() }
      : req;
    return xContentRoutes[xContentRoute](routedRequest, res);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const adminKey = clean(input.admin_key || input.adminKey);
    const authorized = await verifyAdminOrWebsiteOsSession(req, adminKey);
    if (!authorized) {
      return send(res, 401, { success: false, error: "Admin access denied" });
    }

    const tasks = await fetchTasks();
    const scopedTasks = authorized.mode === "website_os"
      ? (Array.isArray(tasks) ? tasks.filter(isCommonplaceTask) : [])
      : tasks;
    const enrichedTasks = Array.isArray(scopedTasks) ? await Promise.all(scopedTasks.map(enrichTask)) : [];
    const invoices = authorized.mode === "website_os"
      ? await listScopedRecords(authorized.current, "invoice", { order: "created_at.desc", limit: 200 })
      : [];
    return send(res, 200, {
      success: true,
      tasks: enrichedTasks,
      invoices,
      invoiceSummary: summarizeInvoices(invoices)
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
      error: "Could not load admin tasks",
      code: error.code || "ADMIN_TASKS_FAILED"
    });
  }
};
