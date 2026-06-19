const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const ADMIN_AUTH_TIMEOUT_MS = 10_000;
const OPERATOR_ACCESS_EMAIL_TIMEOUT_MS = 8_000;
const OPERATOR_LOGIN_URL = "https://operator.doneovernight.com";
const OPERATOR_REVIEW_URL = "https://admin.doneovernight.com";
const OPERATOR_WORKFLOW_VERSION = "operator_webhooks_v2";
const OPERATOR_ACCESS_WEBHOOK_URL = "https://n8n.doneovernight.com/webhook/operator-access";

const crypto = require("crypto");
const { clean, dispatchWebhook, getWebhookUrls, parseBody, send, slugify, supabaseFetch } = require("../lib/ops");
const { withFreshAttachmentUrls } = require("../lib/attachments");
const { resolveOperatorAvailability } = require("../lib/operator-availability");
const { getConfig } = require("../heartbeat/config");
const { getAnalyticsSummary } = require("../heartbeat/providers/analytics");
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
    supabaseFetch("workspace_messages?select=*&order=created_at.desc&limit=120"),
    supabaseFetch("workspace_quotes?select=*&order=created_at.desc&limit=30")
  ]);

  return {
    messages: await Promise.all((Array.isArray(messages) ? messages : []).map(signWorkspaceMessageRecord)),
    quotes: Array.isArray(quotes) ? quotes : []
  };
}

async function signWorkspaceMessageRecord(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const attachments = await withFreshAttachmentUrls(metadata.attachments || metadata.files || [], {
    expiresIn: 60 * 60 * 24 * 7
  }).catch(() => metadata.attachments || metadata.files || []);
  return {
    ...record,
    metadata: {
      ...metadata,
      ...(Array.isArray(attachments) && attachments.length ? { attachments } : {})
    }
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

async function getTrafficSignals() {
  return getAnalyticsSummary(getConfig());
}

function hasEnv(name) {
  return Boolean(clean(process.env[name]));
}

function getDispatchNotificationReadiness() {
  const webhookConfigured = [
    "DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL"
  ].some(hasEnv);
  const doneovernightOpsBotConfigured =
    hasEnv("DONEOVERNIGHT_OPS_BOT_TOKEN") && hasEnv("DONEOVERNIGHT_OPS_CHAT_ID");

  return {
    configured: doneovernightOpsBotConfigured || webhookConfigured,
    method: doneovernightOpsBotConfigured
        ? "DONEOVERNIGHT Ops bot"
      : webhookConfigured
        ? "DONEOVERNIGHT Ops webhook"
        : "Not configured"
  };
}

function getAdminSystemStatus() {
  const dispatchNotification = getDispatchNotificationReadiness();
  return {
    auth: {
      method: "n8n admin key",
      sharedKey: true,
      resetFlow: false
    },
    integrations: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.HEARTBEAT_TELEGRAM_CHAT_ID),
      payments: Boolean(process.env.STRIPE_SECRET_KEY || process.env.PAYMENT_PROVIDER),
      manualBunqLinks: true,
      analytics: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      heartbeat: true,
      vercelDeployment: Boolean(process.env.VERCEL),
      dispatchNotification: dispatchNotification.configured,
      dispatchNotificationMethod: dispatchNotification.method
    }
  };
}

function getTelegramReadiness() {
  const config = getConfig();
  if (config.telegramBotToken && config.telegramChatId) {
    return {
      sent: false,
      status: "Connected",
      reason: "Bot API configured",
      provider: "bot_api"
    };
  }

  if (!config.telegramBotToken) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing TELEGRAM_BOT_TOKEN",
      provider: "none"
    };
  }

  if (!config.telegramChatId) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing HEARTBEAT_TELEGRAM_CHAT_ID",
      provider: "none"
    };
  }
}

function buildHeartbeatStatusLayer(summary = {}, telegram = {}) {
  const integrations = getAdminSystemStatus().integrations || {};
  const health = summary.health || {};
  const deployments = summary.deployments || {};
  const analytics = summary.analytics || {};
  const analyticsConnected = analytics.status === "Connected";
  const generatedAt = summary.generatedAt || null;

  return {
    lastHeartbeat: {
      source: "Last heartbeat",
      state: generatedAt ? "live" : "waiting",
      status: generatedAt ? "Live" : "Waiting",
      value: generatedAt,
      responseTimeMs: summary.runtimeMs,
      reason: generatedAt ? "Heartbeat completed" : "Run Heartbeat to generate status"
    },
    telegram: {
      source: "Telegram status",
      state: telegram.status === "Sent" ? "live" : telegram.status === "Connected" ? "waiting" : "error",
      status: telegram.status === "Sent" ? "Connected" : telegram.status || "Unavailable",
      value: telegram.sentAt || null,
      responseTimeMs: telegram.responseTimeMs,
      reason: telegram.reason || (telegram.messageId ? `Message ${telegram.messageId}` : telegram.provider || "Bot API")
    },
    vercel: {
      source: "Vercel deployment",
      state: deployments.vercel?.status === "Healthy" ? "live" : deployments.vercel?.status === "Needs attention" ? "error" : "waiting",
      status: deployments.vercel?.status || "Unavailable",
      value: deployments.deploymentTimestamp?.value || deployments.deploymentStatus || deployments.vercel?.deploymentUrl || null,
      reason: deployments.latestCommit?.sha
        ? `Commit ${deployments.latestCommit.sha} · ${deployments.deploymentStatus || "Status unavailable"}`
        : deployments.latestCommit?.reason || deployments.vercel?.reason || deployments.vercel?.environment || "Vercel runtime"
    },
    payments: {
      source: "Payment system",
      state: integrations.payments || integrations.manualBunqLinks ? "live" : "waiting",
      status: integrations.payments ? "Connected" : integrations.manualBunqLinks ? "Manual Bunq Links Active" : "Not connected yet",
      value: null,
      reason: integrations.payments ? "Payment provider env detected" : integrations.manualBunqLinks ? "Generated Bunq payment links are active" : "Payment provider not configured"
    },
    analytics: {
      source: "Funnel Tracking",
      state: analyticsConnected ? "live" : "waiting",
      status: analyticsConnected ? "Connected" : "Waiting",
      value: null,
      reason: analyticsConnected ? "Supabase analytics_events source connected" : "Uses Traffic / Signals event store when configured"
    },
    supabase: {
      source: "Supabase",
      state: health.supabase?.status === "Healthy" ? "live" : health.supabase?.status === "Needs attention" ? "error" : "waiting",
      status: health.supabase?.status === "Healthy" ? "Connected" : health.supabase?.status || "Unavailable",
      value: health.supabase?.code ? `HTTP ${health.supabase.code}` : null,
      responseTimeMs: health.supabase?.responseTimeMs,
      reason: health.supabase?.reason || "Supabase task_requests query"
    }
  };
}

async function runHeartbeat(input = {}) {
  const shouldSend = input.send === true || input.send === "true";
  const result = shouldSend
    ? await sendHeartbeat()
    : { summary: await generateHeartbeat(), telegram: getTelegramReadiness() };
  const statusLayer = buildHeartbeatStatusLayer(result.summary, result.telegram);

  return {
    sent: shouldSend,
    summary: result.summary,
    telegram: result.telegram,
    statusLayer
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

function rawPayloadOf(record = {}) {
  return record.raw_payload && typeof record.raw_payload === "object" ? record.raw_payload : {};
}

async function patchOperatorProfileById(profileId, patch) {
  let activePatch = { ...patch };
  const droppedColumns = [];
  const maxAttempts = Object.keys(activePatch).length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const rows = await supabaseFetch(`operator_profiles?id=eq.${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(activePatch)
      });
      return {
        row: Array.isArray(rows) ? rows[0] : rows,
        persisted_fields: Object.keys(activePatch),
        skipped_missing_columns: droppedColumns
      };
    } catch (error) {
      const column = missingColumnName(error);
      if (!column || !Object.prototype.hasOwnProperty.call(activePatch, column)) throw error;
      droppedColumns.push(column);
      delete activePatch[column];
    }
  }
  const error = new Error("Operator profile could not be updated");
  error.statusCode = 500;
  throw error;
}

function fallbackOperatorActivity(profile = {}) {
  const raw = rawPayloadOf(profile);
  const rows = [
    ...(Array.isArray(raw.operator_runtime_activity) ? raw.operator_runtime_activity : []),
    ...(Array.isArray(raw.operator_messages) ? raw.operator_messages : []),
    ...(Array.isArray(raw.operator_support_pings) ? raw.operator_support_pings : [])
  ];
  const handle = clean(profile.handle || profile.handle_normalized || profile.username).toLowerCase().replace(/^@+/, "");
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id || `profile_activity_${index}`,
      operator_profile_id: item.operator_profile_id || profile.id || "",
      operator_handle: clean(item.operator_handle || item.operator_slug || handle),
      created_at: item.created_at || item.sent_at || item.updated_at || profile.updated_at || profile.created_at,
      updated_at: item.updated_at || item.created_at || item.sent_at || profile.updated_at || profile.created_at,
      raw_payload: {
        ...(item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {}),
        profile_raw_payload_fallback: true
      }
    }));
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

function missingColumnName(error) {
  const detail = [
    error?.detail,
    error?.details,
    error?.hint,
    error?.message,
    error?.body,
    error?.responseText
  ].filter(Boolean).join(" ");
  return detail.match(/'([^']+)' column/)?.[1]
    || detail.match(/column "([^"]+)"/i)?.[1]
    || detail.match(/Could not find the '([^']+)'/i)?.[1]
    || "";
}

async function listOperators() {
  const [operators, profiles, applicationSnapshots, applications, runtimeActivity, assignments, relationships] = await Promise.all([
    safeSupabaseRows("operators?select=*&order=created_at.desc"),
    safeSupabaseRows("operator_profiles?select=*&order=created_at.desc"),
    safeSupabaseRows("operator_applications?select=*&order=created_at.desc"),
    safeSupabaseRows("portal_requests?source=eq.operator_apply&select=*&order=created_at.desc"),
    safeSupabaseRows("operator_runtime_activity?select=*&order=created_at.desc&limit=250"),
    safeSupabaseRows("operator_assignments?select=*&order=updated_at.desc&limit=250"),
    safeSupabaseRows("operator_client_relationships?select=*&order=updated_at.desc&limit=250")
  ]);

  const byEmail = new Map();
  const activityByProfileId = new Map();
  const activityByHandle = new Map();
  const assignmentsByProfileId = new Map();
  const assignmentsByHandle = new Map();
  const relationshipsByProfileId = new Map();
  const relationshipsByHandle = new Map();
  runtimeActivity.forEach((item) => {
    const profileId = clean(item.operator_profile_id);
    const handle = clean(item.operator_handle).toLowerCase().replace(/^@+/, "");
    if (profileId) activityByProfileId.set(profileId, [...(activityByProfileId.get(profileId) || []), item]);
    if (handle) activityByHandle.set(handle, [...(activityByHandle.get(handle) || []), item]);
  });
  assignments.forEach((item) => {
    const profileId = clean(item.operator_profile_id || item.assigned_operator_id);
    const handle = clean(item.operator_handle).toLowerCase().replace(/^@+/, "");
    if (profileId) assignmentsByProfileId.set(profileId, [...(assignmentsByProfileId.get(profileId) || []), item]);
    if (handle) assignmentsByHandle.set(handle, [...(assignmentsByHandle.get(handle) || []), item]);
  });
  relationships.forEach((item) => {
    const profileId = clean(item.operator_profile_id);
    const handle = clean(item.operator_handle).toLowerCase().replace(/^@+/, "");
    if (profileId) relationshipsByProfileId.set(profileId, [...(relationshipsByProfileId.get(profileId) || []), item]);
    if (handle) relationshipsByHandle.set(handle, [...(relationshipsByHandle.get(handle) || []), item]);
  });

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
    const raw = profile.raw_payload && typeof profile.raw_payload === "object" ? profile.raw_payload : {};
    const availability = resolveOperatorAvailability(profile);
    const handle = clean(profile.handle || profile.handle_normalized || profile.username).toLowerCase().replace(/^@+/, "");
    const activityRows = [
      ...(activityByProfileId.get(clean(profile.id)) || []),
      ...(handle ? activityByHandle.get(handle) || [] : []),
      ...fallbackOperatorActivity(profile)
    ].filter((item, index, rows) => {
      const key = item.id || `${item.created_at}:${item.activity_type}:${item.body || item.message || ""}`;
      return rows.findIndex((row) => (row.id || `${row.created_at}:${row.activity_type}:${row.body || row.message || ""}`) === key) === index;
    });
    const unreadMessages = activityRows.filter((item) => {
      const rawPayload = item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {};
      return rawPayload.unread_for_admin === true || item.unread_for_admin === true || (!item.admin_read_at && clean(item.actor_role).toLowerCase() === "operator");
    });
    const supportMessages = activityRows.filter((item) => {
      const rawPayload = item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {};
      return rawPayload.message_type === "OPERATOR_SUPPORT_MESSAGE" || item.activity_type === "operator_support_message";
    });
    const supportPings = activityRows.filter((item) => {
      const rawPayload = item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {};
      return rawPayload.message_type === "OPERATOR_SUPPORT_REQUEST"
        || item.activity_type === "operator_support_request";
    });
    const supportMessageRows = supportMessages.slice(0, 80).map((item) => {
      const rawPayload = item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {};
      const viewedAt = item.viewed_at || item.admin_read_at || rawPayload.viewed_at || rawPayload.admin_read_at || "";
      const resolvedAt = item.resolved_at || rawPayload.resolved_at || "";
      const role = clean(item.actor_role || item.sender_role || rawPayload.sender_role).toLowerCase() || "operator";
      return {
        id: clean(item.id),
        source: rawPayload.profile_raw_payload_fallback ? "profile_raw_payload" : "operator_runtime_activity",
        conversation_id: clean(item.conversation_id || rawPayload.conversation_id || rawPayload.thread_id) || `operator_support:${clean(profile.handle || profile.handle_normalized || profile.username)}`,
        operator_name: clean(rawPayload.operator_name || profile.full_name || profile.display_name || profile.name),
        operator_slug: clean(rawPayload.operator_slug || profile.handle || profile.handle_normalized || profile.username).replace(/^@+/, ""),
        operator_email: clean(rawPayload.operator_email || profile.email),
        sender_role: role,
        recipient_role: clean(item.recipient_role || rawPayload.recipient_role),
        subject: clean(item.subject || rawPayload.subject),
        message: clean(item.body || item.message || item.detail).slice(0, 1200),
        task_reference: clean(item.task_reference || item.don_reference || item.task_id || rawPayload.task_reference || rawPayload.don_reference || rawPayload.task_id),
        priority: clean(item.priority || rawPayload.priority) || "normal",
        created_at: item.created_at || rawPayload.sent_at || "",
        viewed_at: viewedAt,
        resolved_at: resolvedAt,
        status: resolvedAt ? "resolved" : viewedAt ? "viewed" : role === "operator" ? "unread" : "sent",
        unread_for_admin: role === "operator" && !viewedAt && !resolvedAt && (rawPayload.unread_for_admin === true || item.unread_for_admin === true),
        telegram_sent_at: item.telegram_sent_at || rawPayload.telegram_sent_at || "",
        telegram_ok: item.telegram_ok === true || rawPayload.telegram_ok === true,
        telegram_error: clean(item.telegram_error || rawPayload.telegram_error)
      };
    });
    const supportPingRows = supportPings.slice(0, 40).map((item) => {
      const rawPayload = item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {};
      const viewedAt = item.viewed_at || item.admin_read_at || rawPayload.viewed_at || rawPayload.admin_read_at || "";
      const resolvedAt = item.resolved_at || rawPayload.resolved_at || "";
      const unread = !viewedAt && !resolvedAt && (rawPayload.unread_for_admin === true || item.unread_for_admin === true);
      return {
        id: clean(item.id),
        source: rawPayload.profile_raw_payload_fallback ? "profile_raw_payload" : "operator_runtime_activity",
        operator_name: clean(rawPayload.operator_name || profile.full_name || profile.display_name || profile.name),
        operator_slug: clean(rawPayload.operator_slug || profile.handle || profile.handle_normalized || profile.username).replace(/^@+/, ""),
        operator_email: clean(rawPayload.operator_email || profile.email),
        message: clean(item.body || item.message || item.detail).slice(0, 900),
        task_reference: clean(item.task_reference || item.don_reference || item.task_id || rawPayload.task_reference || rawPayload.don_reference || rawPayload.task_id),
        created_at: item.created_at || rawPayload.sent_at || "",
        viewed_at: viewedAt,
        resolved_at: resolvedAt,
        status: resolvedAt ? "resolved" : viewedAt ? "viewed" : "unread",
        unread_for_admin: unread,
        telegram_sent_at: item.telegram_sent_at || rawPayload.telegram_sent_at || "",
        telegram_ok: item.telegram_ok === true || rawPayload.telegram_ok === true,
        telegram_error: clean(item.telegram_error || rawPayload.telegram_error)
      };
    });
    const operatorMessages = activityRows.slice(0, 20).map((item) => {
      const rawPayload = item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {};
      const role = clean(item.actor_role || item.sender_role || rawPayload.sender_role).toLowerCase();
      return {
        id: clean(item.id),
        source: rawPayload.profile_raw_payload_fallback ? "profile_raw_payload" : "operator_runtime_activity",
        title: clean(item.title || item.activity_type) || "Operator message",
        message: clean(item.body || item.message || item.detail).slice(0, 600),
        task_reference: clean(item.task_reference || item.don_reference || item.task_id || rawPayload.task_reference || rawPayload.task_id),
        sender_role: role || "operator",
        message_type: clean(item.activity_type || rawPayload.message_type),
        created_at: item.created_at || rawPayload.sent_at || "",
        unread_for_admin: rawPayload.unread_for_admin === true || item.unread_for_admin === true || (!item.admin_read_at && role === "operator")
      };
    });
    const assignmentRows = [
      ...(assignmentsByProfileId.get(clean(profile.id)) || []),
      ...(handle ? assignmentsByHandle.get(handle) || [] : [])
    ].filter((item, index, rows) => {
      const key = item.id || `${item.workspace_slug}:${item.task_id || item.task_title}`;
      return rows.findIndex((row) => (row.id || `${row.workspace_slug}:${row.task_id || row.task_title}`) === key) === index;
    });
    const activeAssignments = assignmentRows.filter((item) => !["archived", "revoked", "inactive", "completed", "delivered"].includes(clean(item.relationship_status || item.operational_state || item.status).toLowerCase()));
    const pendingDeliveries = activeAssignments.filter((item) => /delivery|ready|review/i.test(`${item.delivery_state || ""} ${item.operational_state || ""} ${item.status || ""}`));
    const relationshipRows = [
      ...(relationshipsByProfileId.get(clean(profile.id)) || []),
      ...(handle ? relationshipsByHandle.get(handle) || [] : [])
    ].filter((item, index, rows) => {
      const key = item.id || `${item.operator_profile_id}:${item.client_id}:${item.workspace_slug}`;
      return key && rows.findIndex((row) => (row.id || `${row.operator_profile_id}:${row.client_id}:${row.workspace_slug}`) === key) === index;
    });
    const activeRelationships = relationshipRows.filter((item) => !["archived", "revoked", "inactive"].includes(clean(item.relationship_status || "active").toLowerCase()));
    const connectedClients = activeRelationships.map((item) => ({
      client_name: clean(item.client_name) || clean(item.workspace_slug) || "Client",
      client_email: clean(item.client_email),
      workspace_slug: clean(item.workspace_slug),
      don_references: [
        ...splitList(item.task_id || item.task_reference || item.don_reference || item.raw_payload?.task_id || item.raw_payload?.task_reference),
        ...(Array.isArray(item.raw_payload?.task_references) ? item.raw_payload.task_references : []),
        ...(Array.isArray(item.raw_payload?.don_references) ? item.raw_payload.don_references : [])
      ].map(clean).filter(Boolean).filter((value, index, rows) => rows.indexOf(value) === index),
      relationship_created_at: item.linked_at || item.created_at || item.updated_at,
      source: clean(item.connection_source || item.source || item.raw_payload?.source) || "operator_referral"
    }));
    mergeOperatorRecord(byEmail, profile.email, {
      profile_id: profile.id,
      operator_id: profile.operator_id,
      name: profile.full_name || profile.display_name,
      username: profile.username,
      handle: profile.handle || profile.handle_normalized || profile.username,
      role_type: profile.role_type || profile.role,
      skills: splitList(profile.skills || profile.specialties),
      country: profile.location,
      birthdate: profile.birthdate,
      payout_email: profile.payout_email,
      tools: splitList(profile.tools),
      availability: availability.value,
      operator_availability: availability.value,
      operator_availability_label: availability.label,
      operator_availability_updated_at: availability.updated_at || null,
      last_active_at: profile.last_active_at || profile.updated_at || profile.created_at,
      connected_clients: connectedClients.length,
      connected_clients_detail: connectedClients,
      active_assigned_tasks: activeAssignments.length,
      unread_operator_messages: unreadMessages.length,
      support_pings: supportPings.length,
      operator_pings_detail: supportPingRows,
      unread_operator_pings: supportPingRows.filter((item) => item.status === "unread").length,
      operator_support_detail: supportMessageRows,
      unread_operator_support_messages: supportMessageRows.filter((item) => item.unread_for_admin).length,
      last_operator_support_at: supportMessageRows.map((item) => item.created_at).filter(Boolean).sort().pop() || "",
      operator_messages_detail: operatorMessages,
      pending_deliveries: pendingDeliveries.length,
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

async function insertOperatorRuntimeActivity(payload) {
  let activePayload = { ...payload };
  const droppedColumns = [];
  const maxAttempts = Object.keys(activePayload).length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const rows = await supabaseFetch("operator_runtime_activity", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(activePayload)
      });
      return {
        row: Array.isArray(rows) ? rows[0] : rows,
        persisted_fields: Object.keys(activePayload),
        skipped_missing_columns: droppedColumns
      };
    } catch (error) {
      const column = missingColumnName(error);
      if (!column || !Object.prototype.hasOwnProperty.call(activePayload, column)) {
        return appendOperatorRuntimeActivityFallback(payload, error);
      }
      droppedColumns.push(column);
      delete activePayload[column];
    }
  }
  const error = new Error("Operator message could not be stored");
  error.statusCode = 500;
  return appendOperatorRuntimeActivityFallback(payload, error);
}

async function appendOperatorRuntimeActivityFallback(payload, sourceError) {
  const profileId = clean(payload.operator_profile_id);
  const email = clean(payload.raw_payload?.operator_email).toLowerCase();
  const profile = profileId
    ? (await safeSupabaseRows(`operator_profiles?id=eq.${encodeURIComponent(profileId)}&select=*&limit=1`))[0]
    : await findOperatorProfileByEmail(email);
  if (!profile?.id) throw sourceError;
  const rawPayload = rawPayloadOf(profile);
  const now = new Date().toISOString();
  const existing = Array.isArray(rawPayload.operator_runtime_activity) ? rawPayload.operator_runtime_activity : [];
  const record = {
    id: payload.id || `profile_activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...payload,
    operator_profile_id: payload.operator_profile_id || profile.id,
    created_at: payload.created_at || now,
    updated_at: payload.updated_at || now,
    raw_payload: {
      ...(payload.raw_payload && typeof payload.raw_payload === "object" ? payload.raw_payload : {}),
      profile_raw_payload_fallback: true,
      primary_insert_failed: true,
      primary_insert_error_code: sourceError?.code || sourceError?.statusCode || "",
      primary_insert_error: clean(sourceError?.message || "").slice(0, 180)
    }
  };
  const patch = await patchOperatorProfileById(profile.id, {
    raw_payload: {
      ...rawPayload,
      operator_runtime_activity: [record, ...existing].slice(0, 120),
      operator_runtime_activity_storage: "profile_raw_payload_fallback",
      operator_runtime_activity_storage_updated_at: now
    },
    updated_at: now
  });
  return {
    row: record,
    persisted_fields: patch.persisted_fields,
    skipped_missing_columns: patch.skipped_missing_columns,
    storage_fallback: true,
    primary_error_code: sourceError?.code || sourceError?.statusCode || "",
    primary_error: clean(sourceError?.message || "").slice(0, 180)
  };
}

async function createOperatorMessage(input) {
  const email = clean(input.email).toLowerCase();
  const message = clean(input.message || input.body || input.note).slice(0, 2000);
  const taskReference = clean(input.task_reference || input.don_reference || input.task_id || input.reference).toUpperCase().slice(0, 80);
  const messageType = clean(input.message_type || input.intent).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  const isSupportMessage = messageType === "operator_support_message" || messageType === "support_message";
  const priority = ["urgent", "normal"].includes(clean(input.priority).toLowerCase()) ? clean(input.priority).toLowerCase() : "normal";
  const subject = clean(input.subject || input.title).slice(0, 160);
  if (!email || !message) {
    const error = new Error("Operator email and message are required");
    error.statusCode = 400;
    throw error;
  }
  const profile = await findOperatorProfileByEmail(email);
  if (!profile?.id) {
    const error = new Error("Operator profile was not found");
    error.statusCode = 404;
    throw error;
  }

  const now = new Date().toISOString();
  const handle = clean(profile.handle || profile.handle_normalized || profile.username).toLowerCase().replace(/^@+/, "");
  const conversationId = isSupportMessage
    ? `operator_support:${handle || profile.id}`
    : taskReference
      ? `operator_task_support:${taskReference}`
      : `operator_admin_message:${handle || profile.id}`;
  return insertOperatorRuntimeActivity({
    operator_profile_id: profile.id,
    operator_handle: handle,
    activity_type: isSupportMessage ? "operator_support_message" : "admin_operator_message",
    title: isSupportMessage ? "HQ support reply" : "HQ instruction",
    subject,
    body: message,
    message,
    detail: message,
    actor_role: "admin",
    sender_role: "admin",
    recipient_role: "operator",
    task_id: taskReference,
    task_reference: taskReference,
    don_reference: taskReference,
    unread_for_operator: true,
    unread_for_admin: false,
    conversation_id: conversationId,
    thread_id: conversationId,
    priority,
    raw_payload: {
      operator_slug: handle,
      operator_email: email,
      operator_name: clean(profile.full_name || profile.display_name || profile.name),
      task_reference: taskReference,
      task_id: taskReference,
      sender_role: "admin",
      recipient_role: "operator",
      message_type: isSupportMessage ? "OPERATOR_SUPPORT_MESSAGE" : "admin_instruction",
      conversation_id: conversationId,
      thread_id: conversationId,
      subject,
      priority,
      source: isSupportMessage ? "admin_operator_support" : "admin_operator_message",
      unread_for_operator: true,
      sent_at: now
    },
    created_at: now,
    updated_at: now
  });
}

async function patchOperatorRuntimeActivityViewed(path, payload) {
  let activePayload = { ...payload };
  const maxAttempts = Object.keys(activePayload).length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await supabaseFetch(path, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(activePayload)
      });
      return { updated: true, persisted_fields: Object.keys(activePayload) };
    } catch (error) {
      const column = missingColumnName(error);
      if (!column || !Object.prototype.hasOwnProperty.call(activePayload, column)) throw error;
      delete activePayload[column];
    }
  }
  return { updated: false, persisted_fields: [] };
}

async function markOperatorMessageViewed(input) {
  const email = clean(input.email).toLowerCase();
  const messageId = clean(input.message_id || input.id);
  const source = clean(input.source || "operator_runtime_activity");
  if (!email || !messageId) {
    const error = new Error("Operator email and message id are required");
    error.statusCode = 400;
    throw error;
  }
  const profile = await findOperatorProfileByEmail(email);
  if (!profile?.id) {
    const error = new Error("Operator profile was not found");
    error.statusCode = 404;
    throw error;
  }
  const now = new Date().toISOString();
  if (source === "profile_raw_payload") {
    const rawPayload = rawPayloadOf(profile);
    const rows = Array.isArray(rawPayload.operator_runtime_activity) ? rawPayload.operator_runtime_activity : [];
    const updatedRows = rows.map((item) => String(item.id || "") === messageId
      ? {
          ...item,
          viewed_at: item.viewed_at || item.admin_read_at || now,
          admin_read_at: item.admin_read_at || now,
          unread_for_admin: false,
          raw_payload: {
            ...(item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {}),
            unread_for_admin: false,
            viewed_at: item.raw_payload?.viewed_at || item.raw_payload?.admin_read_at || now,
            admin_read_at: item.raw_payload?.admin_read_at || now
          }
        }
      : item);
    await patchOperatorProfileById(profile.id, {
      raw_payload: {
        ...rawPayload,
        operator_runtime_activity: updatedRows,
        operator_runtime_activity_admin_viewed_at: now
      },
      updated_at: now
    });
    return { message_id: messageId, source, viewed_at: now };
  }
  const currentRows = await safeSupabaseRows([
    `operator_runtime_activity?id=eq.${encodeURIComponent(messageId)}`,
    "select=raw_payload",
    "limit=1"
  ].join("&"));
  const currentRaw = currentRows[0]?.raw_payload && typeof currentRows[0].raw_payload === "object" ? currentRows[0].raw_payload : {};
  await patchOperatorRuntimeActivityViewed([
    `operator_runtime_activity?id=eq.${encodeURIComponent(messageId)}`,
    `operator_profile_id=eq.${encodeURIComponent(profile.id)}`
  ].join("&"), {
    viewed_at: now,
    admin_read_at: now,
    unread_for_admin: false,
    raw_payload: {
      ...currentRaw,
      unread_for_admin: false,
      viewed_at: currentRaw.viewed_at || currentRaw.admin_read_at || now,
      admin_read_at: currentRaw.admin_read_at || now,
      status: currentRaw.resolved_at ? "resolved" : "viewed"
    },
    updated_at: now
  });
  return { message_id: messageId, source: "operator_runtime_activity", viewed_at: now };
}

async function markOperatorPingResolved(input) {
  const email = clean(input.email).toLowerCase();
  const messageId = clean(input.message_id || input.id);
  const source = clean(input.source || "operator_runtime_activity");
  if (!email || !messageId) {
    const error = new Error("Operator email and ping id are required");
    error.statusCode = 400;
    throw error;
  }
  const profile = await findOperatorProfileByEmail(email);
  if (!profile?.id) {
    const error = new Error("Operator profile was not found");
    error.statusCode = 404;
    throw error;
  }
  const now = new Date().toISOString();
  if (source === "profile_raw_payload") {
    const rawPayload = rawPayloadOf(profile);
    const rows = Array.isArray(rawPayload.operator_runtime_activity) ? rawPayload.operator_runtime_activity : [];
    const updatedRows = rows.map((item) => String(item.id || "") === messageId
      ? {
          ...item,
          viewed_at: item.viewed_at || item.admin_read_at || now,
          admin_read_at: item.admin_read_at || now,
          resolved_at: item.resolved_at || now,
          unread_for_admin: false,
          raw_payload: {
            ...(item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {}),
            unread_for_admin: false,
            viewed_at: item.raw_payload?.viewed_at || item.raw_payload?.admin_read_at || now,
            admin_read_at: item.raw_payload?.admin_read_at || now,
            resolved_at: item.raw_payload?.resolved_at || now,
            status: "resolved"
          }
        }
      : item);
    await patchOperatorProfileById(profile.id, {
      raw_payload: {
        ...rawPayload,
        operator_runtime_activity: updatedRows,
        operator_runtime_activity_admin_resolved_at: now
      },
      updated_at: now
    });
    return { message_id: messageId, source, resolved_at: now };
  }
  const currentRows = await safeSupabaseRows([
    `operator_runtime_activity?id=eq.${encodeURIComponent(messageId)}`,
    "select=raw_payload",
    "limit=1"
  ].join("&"));
  const currentRaw = currentRows[0]?.raw_payload && typeof currentRows[0].raw_payload === "object" ? currentRows[0].raw_payload : {};
  await patchOperatorRuntimeActivityViewed([
    `operator_runtime_activity?id=eq.${encodeURIComponent(messageId)}`,
    `operator_profile_id=eq.${encodeURIComponent(profile.id)}`
  ].join("&"), {
    viewed_at: now,
    admin_read_at: now,
    resolved_at: now,
    unread_for_admin: false,
    raw_payload: {
      ...currentRaw,
      unread_for_admin: false,
      viewed_at: currentRaw.viewed_at || currentRaw.admin_read_at || now,
      admin_read_at: currentRaw.admin_read_at || now,
      resolved_at: currentRaw.resolved_at || now,
      status: "resolved"
    },
    updated_at: now
  });
  return { message_id: messageId, source: "operator_runtime_activity", resolved_at: now };
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

function getWorkspaceRecordTaskId(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return clean(
    record.task_id ||
      record.taskId ||
      record.reference ||
      record.task_reference ||
      record.don_reference ||
      metadata.task_id ||
      metadata.taskId ||
      metadata.reference ||
      metadata.task_reference ||
      metadata.taskReference ||
      metadata.don_reference ||
      metadata.donReference ||
      metadata.operation
  );
}

function normalizeTaskBindingValue(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  const match = raw.match(/DON-\d{4}-\d{5}/i);
  if (match) return match[0].toUpperCase();
  return raw.toLowerCase();
}

function getWorkspaceRecordTaskBindingKeys(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const keys = [
    record.task_id,
    record.taskId,
    record.reference,
    record.task_reference,
    record.don_reference,
    metadata.task_id,
    metadata.taskId,
    metadata.reference,
    metadata.task_reference,
    metadata.taskReference,
    metadata.don_reference,
    metadata.donReference
  ].map(normalizeTaskBindingValue).filter(Boolean);

  const operationKey = normalizeTaskBindingValue(metadata.operation);
  if (operationKey && operationKey.startsWith("DON-")) keys.push(operationKey);

  return new Set(keys);
}

function workspaceRecordMatchesTaskId(record = {}, taskId = "") {
  const normalizedTaskId = normalizeTaskBindingValue(taskId);
  if (!normalizedTaskId) return false;
  return getWorkspaceRecordTaskBindingKeys(record).has(normalizedTaskId);
}

function isClientOperationUpdateRecord(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const type = clean(record.message_type || record.messageType).toLowerCase();
  return metadata.source === "operation_update" ||
    metadata.update_type === "client_update" ||
    type.includes("client update") ||
    type.includes("client_update");
}

async function markClientUpdatesViewed(input) {
  const taskId = clean(input.task_id || input.taskId);
  if (!taskId) {
    const error = new Error("Task id is required");
    error.statusCode = 400;
    error.code = "TASK_ID_REQUIRED";
    throw error;
  }

  const rows = await supabaseFetch("workspace_messages?select=*&order=created_at.desc&limit=200");
  const updates = (Array.isArray(rows) ? rows : [])
    .filter((record) => isClientOperationUpdateRecord(record) && workspaceRecordMatchesTaskId(record, taskId));

  const viewedAt = new Date().toISOString();
  const actionId = crypto.randomUUID();
  const updated = [];

  for (const record of updates) {
    const id = clean(record.id);
    if (!id) continue;
    const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
    const patchedRows = await supabaseFetch(`workspace_messages?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        metadata: {
          ...metadata,
          admin_viewed_at: viewedAt,
          admin_viewed_by: "admin",
          admin_viewed_action_id: actionId
        }
      })
    });
    if (Array.isArray(patchedRows) && patchedRows[0]) updated.push(patchedRows[0]);
  }

  return {
    task_id: taskId,
    viewed_at: viewedAt,
    viewed_count: updated.length,
    total_updates: updates.length
  };
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

    if (action === "traffic_signals") {
      const analytics = await getTrafficSignals();
      return send(res, 200, { success: true, analytics });
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

    if (action === "create_operator_message") {
      const result = await createOperatorMessage(input);
      return send(res, 200, { success: true, ...result });
    }

    if (action === "mark_operator_message_viewed") {
      const result = await markOperatorMessageViewed(input);
      return send(res, 200, { success: true, ...result });
    }

    if (action === "mark_operator_ping_resolved") {
      const result = await markOperatorPingResolved(input);
      return send(res, 200, { success: true, ...result });
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

    if (action === "mark_client_updates_viewed") {
      const result = await markClientUpdatesViewed(input);
      return send(res, 200, { success: true, ...result });
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
