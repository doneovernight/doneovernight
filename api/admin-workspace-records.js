const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const ADMIN_AUTH_TIMEOUT_MS = 10_000;
const OPERATOR_ACCESS_EMAIL_TIMEOUT_MS = 8_000;
const OPERATOR_LOGIN_URL = "https://operator.doneovernight.com";
const OPERATOR_REVIEW_URL = "https://admin.doneovernight.com";
const OPERATOR_WORKFLOW_VERSION = "operator_webhooks_v2";
const OPERATOR_ACCESS_WEBHOOK_URL = "https://n8n.doneovernight.com/webhook/operator-access";

const crypto = require("crypto");
const { clean, dispatchWebhook, getWebhookUrls, parseBody, send, slugify, supabaseFetch } = require("../lib/ops");
const { getConfig } = require("../heartbeat/config");
const { generateHeartbeat, sendHeartbeat } = require("../heartbeat/summary");

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

function isClearlyMarkedTestRecord(record = {}) {
  const parts = [
    record.message,
    record.title,
    record.notes,
    record.scope_summary,
    record.task_id,
    record.metadata?.marker,
    record.metadata?.purpose
  ];
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return /\b(test|diagnostic|don diagnostic|don_verify|verification test|test verification)\b/.test(haystack);
}

async function listWorkspaceRecords() {
  const [messages, quotes] = await Promise.all([
    supabaseFetch("workspace_messages?select=*&order=created_at.desc&limit=30"),
    supabaseFetch("workspace_quotes?select=*&order=created_at.desc&limit=30")
  ]);

  return {
    messages: Array.isArray(messages) ? messages : [],
    quotes: Array.isArray(quotes) ? quotes : []
  };
}

async function listDispatchContacts() {
  const path = [
    "crm_contacts?dispatch_subscribed=eq.true",
    "select=id,email,source,last_source,page_hostname,segment,marketing_consent,marketing_consent_at,dispatch_subscribed,dispatch_subscribed_at,created_at,updated_at",
    "order=dispatch_subscribed_at.desc",
    "limit=200"
  ].join("&");

  try {
    const rows = await supabaseFetch(path);
    const contacts = Array.isArray(rows) ? rows : [];
    return {
      contacts,
      connection: {
        table: "crm_contacts",
        connected: true,
        status: contacts.length ? "connected" : "connected_empty"
      }
    };
  } catch (error) {
    return {
      contacts: [],
      connection: {
        table: "crm_contacts",
        connected: false,
        status: "unavailable",
        reason: error.statusCode ? `Supabase ${error.statusCode}` : "query_failed"
      }
    };
  }
}

function getAdminSystemStatus() {
  return {
    auth: {
      method: "n8n admin key",
      sharedKey: true,
      resetFlow: false
    },
    integrations: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      telegram: Boolean(process.env.OPERATOR_APPLY_TELEGRAM_WEBHOOK_URL || process.env.TASK_SUBMIT_WEBHOOK_URL),
      payments: Boolean(process.env.STRIPE_SECRET_KEY || process.env.PAYMENT_PROVIDER),
      analytics: false,
      speedInsights: false,
      heartbeat: true,
      vercelDeployment: Boolean(process.env.VERCEL)
    }
  };
}

function getTelegramReadiness() {
  const config = getConfig();
  if (!config.telegramBotToken) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing TELEGRAM_BOT_TOKEN"
    };
  }

  if (!config.telegramChatId) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing HEARTBEAT_TELEGRAM_CHAT_ID"
    };
  }

  return {
    sent: false,
    status: "Configured",
    reason: "Ready to send"
  };
}

async function runHeartbeat(input = {}) {
  const shouldSend = input.send === true || input.send === "true";
  const result = shouldSend
    ? await sendHeartbeat()
    : { summary: await generateHeartbeat(), telegram: getTelegramReadiness() };

  return {
    sent: shouldSend,
    summary: result.summary,
    telegram: result.telegram
  };
}

async function safeSupabaseRows(path) {
  try {
    const rows = await supabaseFetch(path);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

async function findOperatorProfileByEmail(email) {
  const rows = await safeSupabaseRows(`operator_profiles?email=eq.${encodeURIComponent(clean(email).toLowerCase())}&select=*&limit=1`);
  return rows[0] || null;
}

async function findOperatorApplicationByEmail(email) {
  const rows = await safeSupabaseRows([
    `operator_applications?email=eq.${encodeURIComponent(clean(email).toLowerCase())}`,
    "select=*",
    "order=created_at.desc",
    "limit=1"
  ].join("&"));
  return rows[0] || null;
}

async function operatorAccessKeyExists(accessKey) {
  if (!accessKey) return false;
  const [profileRows, credentialRows] = await Promise.all([
    safeSupabaseRows(`operator_profiles?access_key=eq.${encodeURIComponent(accessKey)}&select=id&limit=1`),
    safeSupabaseRows(`access_keys?access_key=eq.${encodeURIComponent(accessKey)}&select=id&limit=1`)
  ]);
  return profileRows.length > 0 || credentialRows.length > 0;
}

async function generateUniqueOperatorAccessKey() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const accessKey = generateOperatorAccessKey();
    if (!(await operatorAccessKeyExists(accessKey))) return accessKey;
  }
  const error = new Error("Could not generate operator access key");
  error.statusCode = 500;
  throw error;
}

async function usernameExists(username, email) {
  if (!username) return false;
  const rows = await safeSupabaseRows(`operator_profiles?username=ilike.${encodeURIComponent(username)}&select=email&limit=1`);
  return rows.some((row) => clean(row.email).toLowerCase() !== clean(email).toLowerCase());
}

async function generateUniqueOperatorUsername(profile = {}) {
  const base = usernameFromIdentity(profile);
  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : normalizeUsername(`${base}${index + 1}`);
    if (candidate && !(await usernameExists(candidate, profile.email))) return candidate;
  }
  return normalizeUsername(`${base}-${Date.now().toString(36).slice(-4)}`);
}

function getOperatorAccessEmailUrls() {
  return getWebhookUrls([
    "OPERATOR_ACCESS_WEBHOOK_URL",
    "OPERATOR_ACCESS_EMAIL_WEBHOOK_URL",
    "OPERATOR_ACCESS_TELEGRAM_WEBHOOK_URL",
    "OPERATOR_APPLY_EMAIL_WEBHOOK_URL"
  ], [OPERATOR_ACCESS_WEBHOOK_URL]);
}

function buildOperatorAccessEmailPayload(profile = {}) {
  const fullName = profile.full_name || profile.display_name || profile.name || "Operator";
  const username = profile.username || "";
  const accessKey = profile.access_key || "";
  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const text = [
    `Welcome to DONEOVERNIGHT, ${fullName}.`,
    "",
    "Your private operator access has been approved.",
    "",
    `Operator username: ${username}`,
    `Operator email: ${profile.email}`,
    `Operator access key: ${accessKey}`,
    `Login URL: ${OPERATOR_LOGIN_URL}`,
    "",
    "Keep this access key private. It is issued for the DONEOVERNIGHT operator layer and assigned work only."
  ].join("\n");

  const timestamp = new Date().toISOString();
  const payload = {
    event: "operator_access_approved",
    event_type: "operator_activation",
    type: "operator_access",
    workflow_version: OPERATOR_WORKFLOW_VERSION,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp,
    operator_id: profile.id || profile.operator_id || null,
    application_id: profile.application_id || profile.application_snapshot_id || null,
    name: fullName || null,
    role: profile.role_type || profile.role || null,
    location: profile.location || profile.country || null,
    timezone: profile.timezone || null,
    portfolio: profile.portfolio_url || profile.portfolio || null,
    created_at: profile.created_at || null,
    approved_at: profile.approved_at || null,
    review_url: OPERATOR_REVIEW_URL,
    to: profile.email,
    email: profile.email,
    subject: "DONEOVERNIGHT operator access approved",
    operator_name: fullName,
    username,
    access_key: accessKey,
    login_url: OPERATOR_LOGIN_URL,
    text,
    html: `
      <div style="background:#050608;color:#f5f1ea;font-family:Inter,Arial,sans-serif;padding:32px">
        <div style="max-width:560px;margin:0 auto;border:1px solid rgba(233,196,138,.22);border-radius:8px;padding:28px;background:rgba(245,241,234,.03)">
          <p style="color:#e9c48a;letter-spacing:.16em;text-transform:uppercase;font-size:11px">DONEOVERNIGHT Operator Access</p>
          <h1 style="font-weight:400;margin:12px 0 14px">Welcome to the operator layer.</h1>
          <p>Your private operator access has been approved.</p>
          <p><strong>Username:</strong> ${escapeHtml(username)}</p>
          <p><strong>Email:</strong> ${escapeHtml(profile.email)}</p>
          <p><strong>Access key:</strong> ${escapeHtml(accessKey)}</p>
          <p><a href="${OPERATOR_LOGIN_URL}" style="color:#e9c48a">Open Operator Headquarters</a></p>
          <p style="color:rgba(245,241,234,.58);font-size:13px">Keep this access key private. It is issued for assigned DONEOVERNIGHT work only.</p>
        </div>
      </div>
    `
  };
  payload.admin_review_url = payload.review_url;
  payload.telegram_message = [
    "OPERATOR ACCESS APPROVED",
    "",
    `Operator: ${payload.name || "Unknown"}`,
    `Email: ${payload.email || "Not provided"}`,
    `Username: ${payload.username || "Not issued"}`,
    `Role: ${payload.role || "Not specified"}`,
    `Location: ${payload.location || "Not specified"}`,
    `Timezone: ${payload.timezone || "Not specified"}`,
    `Portfolio: ${payload.portfolio || "None"}`,
    "",
    `Login: ${payload.login_url}`,
    `Approved: ${payload.approved_at || timestamp}`
  ].join("\n");
  return payload;
}

async function sendOperatorAccessEmail(profile) {
  const payload = buildOperatorAccessEmailPayload(profile);
  const result = await dispatchWebhook({
    tag: "[OPERATOR_ACCESS_WEBHOOK]",
    event: payload.event,
    urls: getOperatorAccessEmailUrls(),
    payload,
    timeoutMs: OPERATOR_ACCESS_EMAIL_TIMEOUT_MS
  });
  const sent = result.fulfilled > 0;
  return {
    sent,
    reason: sent ? "sent" : (result.attempted ? "failed" : "not_configured"),
    webhook: result
  };
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeUsername(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 30);
}

function usernameFromIdentity({ username = "", email = "", name = "" } = {}) {
  const base = username || String(email).split("@")[0] || name || "operator";
  return normalizeUsername(base) || `operator-${Math.random().toString(36).slice(2, 8)}`;
}

function generateOperatorAccessKey() {
  return `DONE-OP-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function mergeOperatorRecord(map, email, patch) {
  const key = clean(email).toLowerCase();
  if (!key) return;
  const current = map.get(key) || { email: key };
  map.set(key, {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined && value !== null && value !== ""))
  });
}

function getOperatorStatusGroup(status) {
  const normalized = clean(status).toLowerCase();
  if (["active", "approved"].includes(normalized)) return "active";
  if (["revoked", "inactive", "rejected", "cancelled"].includes(normalized)) return "inactive";
  return "pending";
}

async function listOperators() {
  const [operators, profiles, applicationSnapshots, applications] = await Promise.all([
    safeSupabaseRows("operators?select=*&order=created_at.desc"),
    safeSupabaseRows("operator_profiles?select=*&order=created_at.desc"),
    safeSupabaseRows("operator_applications?select=*&order=created_at.desc"),
    safeSupabaseRows("portal_requests?source=eq.operator_apply&select=*&order=created_at.desc")
  ]);

  const byEmail = new Map();

  operators.forEach((operator) => {
    mergeOperatorRecord(byEmail, operator.email, {
      operator_id: operator.id,
      name: operator.name,
      email: operator.email,
      status: operator.status,
      skills: splitList(operator.skills),
      created_at: operator.created_at,
      updated_at: operator.updated_at,
      source_table: "operators"
    });
  });

  profiles.forEach((profile) => {
    mergeOperatorRecord(byEmail, profile.email, {
      profile_id: profile.id,
      operator_id: profile.operator_id,
      name: profile.full_name || profile.display_name,
      username: profile.username,
      role_type: profile.role_type || profile.role,
      skills: splitList(profile.skills || profile.specialties),
      country: profile.location,
      birthdate: profile.birthdate,
      payout_email: profile.payout_email,
      tools: splitList(profile.tools),
      availability: profile.availability,
      portfolio: profile.portfolio_url,
      notes: profile.notes,
      profile_image: profile.profile_image,
      signup_method: profile.onboarding_method,
      approved_at: profile.approved_at,
      access_key_issued: Boolean(profile.access_key),
      activation_email_sent_at: profile.activation_email_sent_at,
      timezone: profile.timezone,
      status: profile.status,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      source_table: "operator_profiles"
    });
  });

  applicationSnapshots.forEach((application) => {
    const raw = application.submitted_payload || {};
    mergeOperatorRecord(byEmail, application.email || raw.email, {
      application_snapshot_id: application.id,
      profile_id: application.operator_profile_id,
      name: raw.name || raw.full_name,
      email: application.email || raw.email,
      status: application.approval_state,
      source: raw.source || "operator_apply",
      signup_method: raw.signup_method || raw.onboarding_method || "operator_apply",
      role_type: raw.role || raw.role_type,
      skills: splitList(raw.skills),
      country: raw.country || raw.location,
      birthdate: raw.birthdate || raw.birth_date,
      payout_email: raw.payout_email,
      tools: splitList(raw.tools),
      timezone: raw.timezone,
      availability: raw.availability,
      portfolio: raw.portfolio || raw.portfolio_url,
      notes: raw.notes,
      profile_image: raw.profile_image,
      review_notes: application.review_notes,
      created_at: application.created_at,
      updated_at: application.updated_at,
      source_table: "operator_applications"
    });
  });

  applications.forEach((application) => {
    const raw = application.raw_payload || {};
    mergeOperatorRecord(byEmail, application.email, {
      application_id: application.id,
      name: application.name,
      email: application.email,
      status: application.status,
      source: application.source || "operator_apply",
      signup_method: application.signup_method || raw.signup_method || raw.source || "operator_apply",
      role_type: raw.role || raw.role_type,
      skills: splitList(raw.skills || application.company),
      country: raw.country || raw.location,
      birthdate: raw.birthdate || raw.birth_date,
      payout_email: raw.payout_email,
      tools: splitList(raw.tools),
      timezone: raw.timezone,
      availability: raw.availability,
      portfolio: raw.portfolio,
      notes: raw.notes,
      profile_image: raw.profile_image,
      created_at: application.created_at,
      updated_at: application.updated_at,
      source_table: "portal_requests"
    });
  });

  return [...byEmail.values()]
    .map((record) => ({ ...record, status_group: getOperatorStatusGroup(record.status) }))
    .sort((a, b) => {
      const rank = { pending: 0, active: 1, inactive: 2 };
      const aRank = rank[a.status_group] ?? 3;
      const bRank = rank[b.status_group] ?? 3;
      if (aRank !== bRank) return aRank - bRank;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
}

async function patchIfPossible(path, body) {
  try {
    await supabaseFetch(path, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    // Operator identity spans optional foundation tables; update the layers that exist.
  }
}

async function patchOperatorProfile(email, body) {
  try {
    await supabaseFetch(`operator_profiles?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body)
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function syncOperatorAccessKeyCredential(profile = {}) {
  const email = clean(profile.email).toLowerCase();
  const accessKey = clean(profile.access_key).toUpperCase();
  if (!email || !accessKey) return { success: false, reason: "missing_identity" };
  const now = new Date().toISOString();

  try {
    const existingRows = await safeSupabaseRows(`access_keys?email=eq.${encodeURIComponent(email)}&credential_scope=eq.operator&select=*&limit=20`);
    const matching = existingRows.find((row) => clean(row.access_key).toUpperCase() === accessKey);
    await Promise.all(existingRows
      .filter((row) => row.id && clean(row.access_key).toUpperCase() !== accessKey)
      .map((row) => supabaseFetch(`access_keys?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          credential_scope: "operator",
          status: "revoked",
          revoked_at: row.revoked_at || now,
          updated_at: now
        })
      }).catch(() => null)));

    if (matching?.id) {
      await supabaseFetch(`access_keys?id=eq.${encodeURIComponent(matching.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          credential_scope: "operator",
          username: profile.username,
          access_key: accessKey,
          status: "active",
          updated_at: now
        })
      });
      return { success: true, credentialId: matching.id };
    }

    await supabaseFetch("access_keys", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        credential_scope: "operator",
        email,
        username: profile.username,
        access_key: accessKey,
        status: "active",
        issued_at: now,
        updated_at: now,
        created_at: now
      })
    });
    return { success: true };
  } catch (error) {
    return { success: false, reason: "operator_credential_sync_unavailable" };
  }
}

async function updateOperatorStatus(input) {
  const email = clean(input.email).toLowerCase();
  const status = clean(input.status).toLowerCase();
  if (!email || !["pending", "active", "revoked", "inactive", "rejected"].includes(status)) {
    const error = new Error("Valid operator email and status are required");
    error.statusCode = 400;
    throw error;
  }

  const existingProfile = await findOperatorProfileByEmail(email);
  const approvedAt = new Date().toISOString();
  const patch = { status, updated_at: new Date().toISOString() };
  const applicationPatch = {
    approval_state: status,
    reviewed_at: approvedAt,
    updated_at: approvedAt
  };
  let profilePatch = patch;
  let emailStatus = "not_required";
  let credentialSyncStatus = "not_required";
  let webhookStatus = null;

  if (status === "active") {
    const username = existingProfile?.username || await generateUniqueOperatorUsername(existingProfile || { email });
    const accessKey = existingProfile?.access_key || await generateUniqueOperatorAccessKey();
    profilePatch = {
      ...patch,
      username,
      access_key: accessKey,
      approved_at: existingProfile?.approved_at || approvedAt
    };

  }

  const [, profilePersisted] = await Promise.all([
    patchIfPossible(`operators?email=eq.${encodeURIComponent(email)}`, patch),
    patchOperatorProfile(email, profilePatch),
    patchIfPossible(`operator_applications?email=eq.${encodeURIComponent(email)}`, applicationPatch),
    patchIfPossible(`portal_requests?source=eq.operator_apply&email=eq.${encodeURIComponent(email)}`, patch)
  ]);

  if (status === "active" && profilePersisted) {
    const activatedProfile = await findOperatorProfileByEmail(email);
    const latestApplication = await findOperatorApplicationByEmail(email);
    const activationProfile = {
      ...existingProfile,
      ...profilePatch,
      ...(activatedProfile || {}),
      email,
      application_id: latestApplication?.id || null
    };
    const syncResult = await syncOperatorAccessKeyCredential(activationProfile);
    credentialSyncStatus = syncResult.success ? "synced" : syncResult.reason || "not_synced";

    const emailResult = await sendOperatorAccessEmail(activationProfile)
      .catch((error) => {
        console.error("[WEBHOOK_ERROR]", {
          tag: "[OPERATOR_ACCESS_WEBHOOK]",
          event: "operator_access_approved",
          email,
          message: error.message
        });
        return { sent: false, reason: "failed", webhook: { attempted: 0, fulfilled: 0, rejected: 1, error: error.message } };
      });
    emailStatus = emailResult.reason;
    webhookStatus = emailResult.webhook || null;
    if (emailResult.sent) {
      await patchOperatorProfile(email, { activation_email_sent_at: approvedAt });
    }
  } else if (status === "active") {
    emailStatus = "credential_not_persisted";
    credentialSyncStatus = "credential_not_persisted";
  }

  const operators = await listOperators();
  const operator = operators.find((item) => clean(item.email).toLowerCase() === email) || { email, status };
  return { ...operator, credential_email_status: emailStatus, credential_sync_status: credentialSyncStatus, credential_webhook_status: webhookStatus };
}

async function createWorkspaceMessage(input) {
  const message = clean(input.message);
  if (!message) {
    const error = new Error("Message is required");
    error.statusCode = 400;
    throw error;
  }

  const payload = {
    workspace_slug: slugify(input.workspace_slug || input.slug || ""),
    task_id: clean(input.task_id || input.taskId),
    email: clean(input.email).toLowerCase(),
    author_role: "operator",
    message_type: clean(input.message_type || input.messageType) || "operator_note",
    message,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };

  const rows = await supabaseFetch("workspace_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function createWorkspaceQuote(input) {
  const title = clean(input.title);
  if (!title) {
    const error = new Error("Quote title is required");
    error.statusCode = 400;
    throw error;
  }

  const amount = input.amount === "" || input.amount === undefined || input.amount === null
    ? null
    : Number(input.amount);
  if (amount !== null && Number.isNaN(amount)) {
    const error = new Error("Quote amount must be numeric");
    error.statusCode = 400;
    throw error;
  }

  const payload = {
    workspace_slug: slugify(input.workspace_slug || input.slug || ""),
    task_id: clean(input.task_id || input.taskId),
    email: clean(input.email).toLowerCase(),
    title,
    scope_summary: clean(input.scope_summary || input.scopeSummary),
    amount,
    currency: clean(input.currency) || "EUR",
    status: clean(input.status) || "sent",
    notes: clean(input.notes)
  };

  const rows = await supabaseFetch("workspace_quotes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function deleteWorkspaceRecord(input) {
  const id = clean(input.id);
  const type = clean(input.type);
  const table = type === "message" ? "workspace_messages" : type === "quote" ? "workspace_quotes" : "";
  if (!id || !table) {
    const error = new Error("Record type and id are required");
    error.statusCode = 400;
    throw error;
  }

  const rows = await supabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record) {
    const error = new Error("Record not found");
    error.statusCode = 404;
    throw error;
  }
  if (!isClearlyMarkedTestRecord(record)) {
    const error = new Error("Only clearly marked test records can be deleted");
    error.statusCode = 403;
    throw error;
  }

  const deletedRows = await supabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" }
  });
  return Array.isArray(deletedRows) ? deletedRows[0] : record;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const adminKey = clean(input.admin_key || input.adminKey || req.headers["x-admin-key"]);
    const authorized = await verifyAdminKey(adminKey);
    if (!authorized) {
      return send(res, 401, { success: false, error: "Admin access denied" });
    }

    const action = clean(input.action || "list");
    if (action === "list") {
      const records = await listWorkspaceRecords();
      return send(res, 200, { success: true, ...records });
    }

    if (action === "list_operators") {
      const operators = await listOperators();
      return send(res, 200, { success: true, operators });
    }

    if (action === "list_dispatch") {
      const result = await listDispatchContacts();
      return send(res, 200, { success: true, ...result });
    }

    if (action === "system_status") {
      return send(res, 200, { success: true, status: getAdminSystemStatus() });
    }

    if (action === "heartbeat") {
      const result = await runHeartbeat(input);
      return send(res, 200, { success: true, ...result });
    }

    if (action === "update_operator_status") {
      const operator = await updateOperatorStatus(input);
      return send(res, 200, { success: true, operator });
    }

    if (action === "create_message") {
      const message = await createWorkspaceMessage(input);
      return send(res, 200, { success: true, message });
    }

    if (action === "create_quote") {
      const quote = await createWorkspaceQuote(input);
      return send(res, 200, { success: true, quote });
    }

    if (action === "delete") {
      const record = await deleteWorkspaceRecord(input);
      return send(res, 200, { success: true, record });
    }

    return send(res, 400, { success: false, error: "Unsupported workspace admin action" });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }
    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: error.statusCode && error.statusCode < 500 ? error.message : "Could not process workspace admin records",
      code: error.code || "ADMIN_WORKSPACE_RECORDS_FAILED"
    });
  }
};
