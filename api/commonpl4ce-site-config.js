const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const ADMIN_AUTH_TIMEOUT_MS = 10_000;
const SITE_CONFIG_SOURCE = "commonpl4ce_site_config";
const SITE_CONFIG_WORKSPACE = "commonpl4ce";
const { createTaskId, saveTask } = require("../lib/tasks/store");
const { clean, parseBody, send, supabaseFetch } = require("../lib/ops");

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

function normalizeSlot(slot = {}, index = 0, format = "desktop") {
  const src = clean(slot.src || slot.image || slot.desktopImage || slot.mobileImage);
  const status = ["Draft", "Ready", "Hidden"].includes(slot.status) ? slot.status : "Ready";
  return {
    id: clean(slot.id) || `${format}_hero_${index + 1}`,
    src,
    alt: clean(slot.alt),
    label: clean(slot.label || slot.caption || slot.note),
    caption: clean(slot.caption || slot.label || slot.note),
    sourceFile: clean(slot.sourceFile),
    status
  };
}

function normalizeConfig(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const hero = source.hero && typeof source.hero === "object" ? source.hero : {};
  const desktop = Array.isArray(hero.desktop) ? hero.desktop.map((slot, index) => normalizeSlot(slot, index, "desktop")).slice(0, 7) : [];
  const mobile = Array.isArray(hero.mobile) ? hero.mobile.map((slot, index) => normalizeSlot(slot, index, "mobile")).slice(0, 7) : [];
  const content = source.content && typeof source.content === "object" ? source.content : {};
  return {
    version: Number(source.version || 1),
    workspace: SITE_CONFIG_WORKSPACE,
    updatedAt: clean(source.updatedAt) || new Date().toISOString(),
    hero: { desktop, mobile },
    content
  };
}

function validatePublishedConfig(config = {}) {
  const errors = [];
  if (config.workspace !== SITE_CONFIG_WORKSPACE) errors.push("workspace_invalid");
  if (config.hero.desktop.length !== 7) errors.push("desktop_hero_requires_7_slots");
  if (config.hero.mobile.length !== 7) errors.push("mobile_hero_requires_7_slots");

  ["desktop", "mobile"].forEach((kind) => {
    config.hero[kind].forEach((slot, index) => {
      const label = `${kind}_${index + 1}`;
      if (!slot.src && slot.status !== "Hidden") errors.push(`${label}_src_required`);
      if (/^data:/i.test(slot.src) || /^blob:/i.test(slot.src) || /^local_/i.test(slot.src)) {
        errors.push(`${label}_requires_upload_storage`);
      }
    });
  });

  if (!clean(config.content.storyTitle)) errors.push("story_title_required");
  if (!clean(config.content.contactEmail)) errors.push("contact_email_required");
  return errors;
}

async function latestPublishedConfig() {
  const rows = await supabaseFetch([
    "task_requests?source=eq.commonpl4ce_site_config",
    "select=task_id,created_at,updated_at,raw_payload",
    "order=created_at.desc",
    "limit=1"
  ].join("&"));
  const record = Array.isArray(rows) ? rows[0] : null;
  const raw = record?.raw_payload && typeof record.raw_payload === "object" ? record.raw_payload : {};
  const config = raw.config && typeof raw.config === "object" ? normalizeConfig(raw.config) : null;
  return config ? {
    config,
    publishedAt: clean(raw.published_at || record.created_at || record.updated_at),
    taskId: clean(record.task_id)
  } : null;
}

async function publishConfig(config = {}, adminKey = "") {
  const now = new Date().toISOString();
  const normalized = normalizeConfig({
    ...config,
    version: Number(config.version || 1) + 1,
    updatedAt: now
  });
  const errors = validatePublishedConfig(normalized);
  if (errors.length) {
    const error = new Error("Config is not publishable");
    error.statusCode = 400;
    error.code = "CONFIG_NOT_PUBLISHABLE";
    error.errors = errors;
    throw error;
  }

  const task = {
    taskId: createTaskId(new Date()),
    createdAt: now,
    updatedAt: now,
    status: "completed",
    paymentStatus: "not_required_yet",
    queueState: "published",
    priority: "normal",
    reviewWindowEstimate: "Published immediately",
    name: "COMMONPL4CE Website OS",
    email: "book@commonpl4ce.com",
    company: "COMMONPL4CE",
    taskSummary: "COMMONPL4CE website config published from Website OS.",
    clientBudget: "",
    deadline: "",
    links: [],
    attachments: [],
    source: SITE_CONFIG_SOURCE,
    quoteId: "",
    paymentId: "",
    clientId: "",
    rawPayload: {
      source: SITE_CONFIG_SOURCE,
      workspace: SITE_CONFIG_WORKSPACE,
      event: "commonpl4ce_site_config_published",
      published_at: now,
      admin_key_fingerprint: adminKey ? `${adminKey.length}:${adminKey.slice(0, 2)}...${adminKey.slice(-2)}` : "",
      config: normalized
    }
  };

  const record = await saveTask(task);
  return {
    config: normalized,
    publishedAt: now,
    taskId: clean(record?.task_id || task.taskId)
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const published = await latestPublishedConfig();
      if (!published) {
        return send(res, 404, { success: false, error: "No published COMMONPL4CE config found", code: "CONFIG_NOT_FOUND" });
      }
      return send(res, 200, { success: true, ...published });
    } catch (error) {
      return send(res, error.statusCode || 503, {
        success: false,
        error: "Published config unavailable",
        code: error.code || "CONFIG_READ_FAILED"
      });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const adminKey = clean(input.admin_key || input.adminKey || req.headers["x-admin-key"]);
    const authorized = await verifyAdminKey(adminKey);
    if (!authorized) {
      return send(res, 401, { success: false, error: "Admin access denied", code: "ADMIN_ACCESS_DENIED" });
    }

    const result = await publishConfig(input.config, adminKey);
    return send(res, 200, { success: true, ...result });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }
    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: error.statusCode && error.statusCode < 500 ? error.message : "Could not publish COMMONPL4CE config",
      code: error.code || "CONFIG_PUBLISH_FAILED",
      errors: error.errors || []
    });
  }
};
