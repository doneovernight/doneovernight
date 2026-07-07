const crypto = require("node:crypto");
const { clean, dispatchWebhook, getWebhookUrls, supabaseFetch } = require("./ops");
const { sendTelegramMessage } = require("../heartbeat/telegram");
const creatorLiveStatus = require("./creator-live-status");
const { creatorMediaBucket, creatorOsEnvironment, getSupabaseRuntimeConfig } = require("./creator-os-environment");

const WATCHTOWER_EVENT = "creator_watchtower_event";
const WATCHTOWER_ALERT = "creator_watchtower_alert";
const DEFAULT_CREATOR_SLUG = "mosyaamosya";
const TELEGRAM_DEDUPE_MIN_MS = 6 * 60 * 60 * 1000;
const ALERT_WINDOW_MS = TELEGRAM_DEDUPE_MIN_MS;
const SEVERITIES = new Set(["info", "warning", "error", "critical"]);
const memoryAlertCache = new Map();

function normalizeSlug(value = DEFAULT_CREATOR_SLUG) {
  return clean(value || DEFAULT_CREATOR_SLUG).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || DEFAULT_CREATOR_SLUG;
}

function watchtowerEventType(base, slug) {
  return base + "_" + normalizeSlug(slug).replace(/[^a-z0-9_]+/g, "_");
}

function safeText(value, limit = 500) {
  return clean(String(value || "")).replace(/[\r\n\t]+/g, " ").slice(0, limit);
}

function truthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeSeverity(value, fallback = "error") {
  const severity = safeText(value || "", 40).toLowerCase();
  return SEVERITIES.has(severity) ? severity : fallback;
}

function publicUrl(req, path = "/" + DEFAULT_CREATOR_SLUG) {
  const host = clean(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "doneovernight.com");
  const protocol = clean(req?.headers?.["x-forwarded-proto"] || "https");
  const targetHost = host.includes("admin.") ? "doneovernight.com" : host;
  return `${protocol}://${targetHost}${path}`;
}

function fingerprintFor(alert = {}) {
  const basis = [
    normalizeSlug(alert.creator_slug || alert.slug),
    safeText(alert.area, 80),
    safeText(alert.action, 120),
    safeText(alert.error || alert.message, 240),
    safeText(alert.url, 200)
  ].join("|");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

function alertText(alert = {}) {
  const creator = safeText(alert.creator || "Mina Mosya", 100);
  const area = safeText(alert.area || "Creator OS", 80);
  const action = safeText(alert.action || "Unknown", 120);
  const error = safeText(alert.error || alert.message || "Unknown error", 700);
  const url = safeText(alert.url || "", 260);
  const time = safeText(alert.time || new Date().toISOString(), 80);
  const source = safeText(alert.source || "production", 80);
  const hint = safeText(alert.suggested_check || suggestedCheck(alert), 220);
  return [
    "🚨 Creator OS Error",
    "",
    `Creator: ${creator}`,
    `Area: ${area}`,
    `Action: ${action}`,
    `Error: ${error}`,
    `URL: ${url || "Unknown"}`,
    `Time: ${time}`,
    `Source: ${source}`,
    `Suggested check: ${hint}`
  ].join("\n");
}

function suggestedCheck(alert = {}) {
  const error = String(alert.error || alert.message || "").toLowerCase();
  const area = String(alert.area || "").toLowerCase();
  if (error.includes("pgrst") || error.includes("missing table") || error.includes("could not find the table")) return "Check Supabase creators/runtime migrations.";
  if (error.includes("analytics_bridge")) return "Check Creator settings source and public.creators row.";
  if (area.includes("runtime")) return "Check Live Runtime API, creators row updated_at, and public live status.";
  if (area.includes("newsletter")) return "Check newsletter_signup action and creator_newsletter_signups writes.";
  if (area.includes("media")) return "Check creator-media storage bucket and upload response.";
  return "Open Creator Health, inspect Vercel logs, then reproduce the action.";
}

async function writeWatchtowerEvent(eventType, metadata = {}) {
  const slug = normalizeSlug(metadata.creator_slug || metadata.slug || DEFAULT_CREATOR_SLUG);
  try {
    await supabaseFetch("analytics_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        event_type: eventType,
        source: "creator_os_watchtower",
        route: safeText(metadata.url || "/" + slug, 180),
        metadata: { ...metadata, creator_slug: slug }
      })
    });
  } catch (error) {
    console.warn("[CREATOR_WATCHTOWER_EVENT_FAILED]", error.message);
  }
}

async function recentAlertExists(fingerprint, slug = DEFAULT_CREATOR_SLUG) {
  const cachedAt = memoryAlertCache.get(fingerprint);
  if (cachedAt && Date.now() - cachedAt < TELEGRAM_DEDUPE_MIN_MS) return true;
  try {
    const rows = await supabaseFetch([
      `analytics_events?event_type=eq.${encodeURIComponent(watchtowerEventType(WATCHTOWER_ALERT, slug))}`,
      "select=metadata,created_at",
      "order=created_at.desc",
      "limit=50"
    ].join("&"));
    const cutoff = Date.now() - TELEGRAM_DEDUPE_MIN_MS;
    return (Array.isArray(rows) ? rows : []).some((row) => {
      const created = Date.parse(row.created_at || "");
      return Number.isFinite(created) &&
        created >= cutoff &&
        row.metadata &&
        row.metadata.fingerprint === fingerprint;
    });
  } catch (error) {
    console.warn("[CREATOR_WATCHTOWER_RATE_LIMIT_FAILED]", error.message);
    return false;
  }
}

function rememberAlert(fingerprint) {
  memoryAlertCache.set(fingerprint, Date.now());
  if (memoryAlertCache.size > 200) {
    const cutoff = Date.now() - TELEGRAM_DEDUPE_MIN_MS;
    for (const [key, value] of memoryAlertCache.entries()) {
      if (value < cutoff) memoryAlertCache.delete(key);
    }
  }
}

function isExpectedAuthFailure(alert = {}) {
  const text = [
    alert.area,
    alert.action,
    alert.error || alert.message,
    alert.url,
    alert.status,
    alert.status_code,
    alert.code
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return /\b(401|403)\b/.test(text) ||
    text.includes("creator access denied") ||
    text.includes("admin access denied") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("wrong password");
}

function isPreviewWatchtowerSurface(alert = {}) {
  const env = creatorOsEnvironment().environment;
  const source = String(alert.source || "").toLowerCase();
  const environment = String(alert.environment || alert.env || "").toLowerCase();
  const url = String(alert.url || "").toLowerCase();
  return env === "preview" ||
    source === "preview" ||
    environment === "preview" ||
    url.includes(".vercel.app/");
}

function telegramGateFor(alert = {}) {
  const severity = normalizeSeverity(alert.severity, "error");
  if (isPreviewWatchtowerSurface(alert)) {
    return { enabled: false, reason: "preview_telegram_disabled" };
  }
  if (isExpectedAuthFailure(alert)) {
    return { enabled: false, reason: "expected_auth_failure" };
  }
  if (!(severity === "error" || severity === "critical")) {
    return { enabled: false, reason: "severity_below_telegram_threshold" };
  }
  if (!truthy(alert.action_required)) {
    return { enabled: false, reason: "action_required_false" };
  }
  if (!truthy(alert.user_initiated)) {
    return { enabled: false, reason: "user_initiated_false" };
  }
  return { enabled: true, reason: "user_action_failed" };
}

function telegramConfig() {
  return {
    botToken: clean(process.env.DONEOVERNIGHT_OPS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN),
    chatId: clean(process.env.DONEOVERNIGHT_OPS_CHAT_ID || process.env.HEARTBEAT_TELEGRAM_CHAT_ID)
  };
}

function isHttpWebhookUrl(value) {
  try {
    const parsed = new URL(clean(value));
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function summarizeWebhookResult(result = {}, invalidCount = 0) {
  return {
    attempted: result.attempted || 0,
    fulfilled: result.fulfilled || 0,
    rejected: result.rejected || 0,
    invalid: invalidCount,
    errors: Array.isArray(result.errors) ? result.errors : [],
    error: result.error || ""
  };
}

async function sendWatchtowerTelegram(text, metadata = {}) {
  const configuredUrls = getWebhookUrls(["DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL"]);
  const urls = configuredUrls.filter(isHttpWebhookUrl);
  const invalidWebhookCount = configuredUrls.length - urls.length;
  const webhookResult = urls.length
    ? await dispatchWebhook({
        tag: "[CREATOR_WATCHTOWER_TELEGRAM]",
        event: "creator_os_error",
        urls,
        payload: {
          notification_type: "creator_os_error",
          telegram_message: text,
          message: text,
          metadata
        }
      }).catch((error) => ({ attempted: urls.length, fulfilled: 0, rejected: urls.length, error: error.message }))
    : { attempted: 0, fulfilled: 0, rejected: 0 };
  const webhook = summarizeWebhookResult(webhookResult, invalidWebhookCount);

  const config = telegramConfig();
  const bot = config.botToken && config.chatId
    ? await sendTelegramMessage({ botToken: config.botToken, chatId: config.chatId, text }).catch((error) => ({
        sent: false,
        status: "Needs attention",
        reason: error.message,
        provider: "bot_api"
      }))
    : {
        sent: false,
        status: "Unavailable",
        reason: "No Creator OS ops Telegram env configured",
        provider: "none"
      };

  return {
    delivered: webhook.fulfilled > 0 || bot.sent === true,
    webhook,
    bot,
    provider: webhook.fulfilled > 0 ? "webhook" : bot.sent ? "bot_api" : "none"
  };
}

async function reportCreatorError(input = {}) {
  const slug = normalizeSlug(input.slug || input.creator_slug || DEFAULT_CREATOR_SLUG);
  const alert = {
    creator_slug: slug,
    creator: safeText(input.creator || "Mina Mosya", 120),
    area: safeText(input.area || "Creator OS", 80),
    action: safeText(input.action || "Unknown", 120),
    error: safeText(input.error || input.message || "Unknown error", 900),
    url: safeText(input.url || "", 300),
    time: safeText(input.time || new Date().toISOString(), 80),
    source: safeText(input.source || "production", 80),
    environment: safeText(input.environment || input.env || creatorOsEnvironment().environment || "production", 80),
    severity: normalizeSeverity(input.severity || input.watchtower_severity || input.level || "error"),
    action_required: truthy(input.action_required || input.actionRequired || input.authenticated_user_action || input.authenticatedUserAction),
    user_initiated: truthy(input.user_initiated || input.userInitiated || input.authenticated_user_action || input.authenticatedUserAction),
    authenticated_user_action: truthy(input.authenticated_user_action || input.authenticatedUserAction),
    suggested_check: safeText(input.suggested_check || input.suggestedCheck || "", 240)
  };
  alert.suggested_check = alert.suggested_check || suggestedCheck(alert);
  alert.fingerprint = fingerprintFor(alert);
  const telegramGate = telegramGateFor(alert);
  alert.telegram_enabled = telegramGate.enabled;
  alert.telegram_gate_reason = telegramGate.reason;

  await writeWatchtowerEvent(watchtowerEventType(WATCHTOWER_EVENT, slug), { ...alert, alert_candidate: true });
  if (!telegramGate.enabled) {
    console.warn("[CREATOR_WATCHTOWER_TELEGRAM_GATE_SUPPRESSED]", alert);
    return { success: true, alert_sent: false, suppressed: true, reason: telegramGate.reason, telegram_enabled: false, fingerprint: alert.fingerprint };
  }
  const rateLimited = await recentAlertExists(alert.fingerprint, slug);
  if (rateLimited) {
    console.warn("[CREATOR_WATCHTOWER_RATE_LIMITED]", alert);
    return { success: true, alert_sent: false, rate_limited: true, telegram_enabled: true, fingerprint: alert.fingerprint, dedupe_window_ms: TELEGRAM_DEDUPE_MIN_MS };
  }
  rememberAlert(alert.fingerprint);

  const text = alertText(alert);
  const telegram = await sendWatchtowerTelegram(text, alert);
  await writeWatchtowerEvent(watchtowerEventType(WATCHTOWER_ALERT, slug), {
    ...alert,
    dedupe_window_ms: TELEGRAM_DEDUPE_MIN_MS,
    telegram_delivered: telegram.delivered,
    telegram_provider: telegram.provider,
    telegram_status: telegram.bot?.status || "",
    telegram_error: telegram.bot?.reason || telegram.webhook?.error || ""
  });
  if (!telegram.delivered) {
    console.error("[CREATOR_WATCHTOWER_ALERT_NOT_DELIVERED]", {
      fingerprint: alert.fingerprint,
      area: alert.area,
      action: alert.action,
      reason: telegram.bot?.reason || telegram.webhook?.error || "not_delivered"
    });
  }
  return {
    success: true,
    alert_sent: telegram.delivered,
    rate_limited: false,
    telegram_enabled: true,
    fingerprint: alert.fingerprint,
    dedupe_window_ms: TELEGRAM_DEDUPE_MIN_MS,
    telegram
  };
}

async function checkCreatorDatabase(slug) {
  try {
    const rows = await supabaseFetch([
      `creators?slug=eq.${encodeURIComponent(slug)}`,
      "select=slug,username,display_name,updated_at,live_status,battle_mode_enabled,pinned_block,poll_enabled,next_live_datetime",
      "limit=1"
    ].join("&"));
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return { status: "failing", source: "database", error: "Creator row missing" };
    return { status: "healthy", source: "database", row };
  } catch (error) {
    return {
      status: "failing",
      source: "database",
      error: error.detail || error.message || "Creator database check failed"
    };
  }
}

async function checkRuntimeTable(slug) {
  try {
    const rows = await supabaseFetch([
      `creator_live_runtime?creator_slug=eq.${encodeURIComponent(slug)}`,
      "select=creator_slug,is_live,confirmed,confidence,source,checked_at,last_event_at,stale,stale_after,error,updated_at",
      "limit=1"
    ].join("&"));
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return { status: "degraded", source: "runtime", error: "No runtime row yet" };
    const checkedAt = Date.parse(row.checked_at || row.updated_at || "");
    const stale = row.stale === true || (Number.isFinite(checkedAt) && Date.now() - checkedAt > 10 * 60 * 1000);
    return { status: stale ? "degraded" : "healthy", source: row.source || "runtime", row, stale };
  } catch (error) {
    return {
      status: "degraded",
      source: "runtime",
      error: error.detail || error.message || "Runtime table check failed"
    };
  }
}

async function checkStorageBucket() {
  const env = creatorOsEnvironment();
  const bucket = creatorMediaBucket();
  if (env.storage === "missing") {
    return {
      status: "failing",
      source: "storage",
      bucket,
      environment: env.storage,
      error: env.write_safety.reason || "Supabase storage is not configured"
    };
  }

  try {
    const { url, serviceRoleKey } = getSupabaseRuntimeConfig("Creator media storage");
    const response = await fetch(url + "/storage/v1/bucket/" + encodeURIComponent(bucket), {
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        Accept: "application/json"
      }
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }
    if (!response.ok) {
      return {
        status: "failing",
        source: "storage",
        bucket,
        environment: env.storage,
        error: data && (data.message || data.error) || response.statusText || "Storage bucket check failed"
      };
    }
    return {
      status: data && data.public === true ? "healthy" : "degraded",
      source: "storage",
      bucket,
      environment: env.storage,
      public: data && data.public === true
    };
  } catch (error) {
    return {
      status: "failing",
      source: "storage",
      bucket,
      environment: env.storage,
      error: error.message || "Storage bucket check failed"
    };
  }
}

async function checkPublicPage(req, slug, creator = {}) {
  try {
    const response = await fetch(publicUrl(req, "/" + slug), {
      headers: { Accept: "text/html" }
    });
    const text = await response.text();
    const displayName = safeText(creator.display_name || creator.username || slug, 120);
    const introKey = "creator_intro_" + slug + "_v1";
    const containsCreator = text.includes(displayName);
    const containsIntro = text.includes(introKey);
    const usesSharedEngine = text.includes("/mosyaamosya/index.html") || text.includes("Creator OS engine");
    const protectedPreviewAuth = text.includes("vercel.com")
      && (text.includes("/login?next=") || text.includes("sso-api") || text.includes("Vercel Authentication"));
    const ok = response.ok && ((containsCreator && containsIntro) || usesSharedEngine || protectedPreviewAuth);
    return {
      status: ok ? "healthy" : "degraded",
      code: response.status,
      checks: {
        loads: response.ok,
        containsCreator,
        containsIntro,
        usesSharedEngine,
        protectedPreviewAuth
      }
    };
  } catch (error) {
    return { status: "degraded", error: error.message || "Public page check failed" };
  }
}

async function lastWatchtowerError(slug = DEFAULT_CREATOR_SLUG) {
  try {
    const rows = await supabaseFetch([
      `analytics_events?event_type=eq.${encodeURIComponent(watchtowerEventType(WATCHTOWER_ALERT, slug))}`,
      "select=metadata,created_at",
      "order=created_at.desc",
      "limit=1"
    ].join("&"));
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;
    return { created_at: row.created_at, ...(row.metadata || {}) };
  } catch {
    return null;
  }
}

function overallStatus(parts = []) {
  if (parts.some((part) => part.status === "failing")) return "failing";
  if (parts.some((part) => part.status === "degraded")) return "degraded";
  return "healthy";
}

async function runCreatorHealth({ req, slug = DEFAULT_CREATOR_SLUG, sendAlertOnFailure = false } = {}) {
  const safeSlug = normalizeSlug(slug);
  const environment = creatorOsEnvironment();
  const [database, runtimeTable, storage, lastError] = await Promise.all([
    checkCreatorDatabase(safeSlug),
    checkRuntimeTable(safeSlug),
    checkStorageBucket(),
    lastWatchtowerError(safeSlug)
  ]);
  const publicPage = await checkPublicPage(req, safeSlug, database.row || {});

  let liveStatus;
  try {
    liveStatus = await creatorLiveStatus.resolveLiveStatus(safeSlug);
  } catch (error) {
    liveStatus = {
      status: "failing",
      error: error.message || "Live status resolver failed"
    };
  }

  const settingsSource = database.status === "healthy" ? "database" : "unavailable";
  const runtimeStatus = liveStatus.error && liveStatus.error !== "The requested user isn't online :(" && liveStatus.error !== "AUTO_RUNTIME_NOT_CONFIGURED"
    ? "degraded"
    : "healthy";
  const settings = database.status === "healthy"
    ? { status: "healthy", source: settingsSource, updated_at: database.row.updated_at }
    : { status: "failing", source: settingsSource, error: database.error };

  const live = {
    status: runtimeStatus,
    source: liveStatus.source || runtimeTable.source || "unknown",
    confidence: liveStatus.confidence || "unknown",
    isLive: liveStatus.isLive === true,
    stale: liveStatus.stale === true,
    checkedAt: liveStatus.checkedAt || runtimeTable.row?.checked_at || null,
    error: liveStatus.error || runtimeTable.error || null
  };

  const parts = [
    settings,
    { status: runtimeStatus },
    { status: database.status },
    { status: storage.status },
    { status: publicPage.status }
  ];
  const overall = overallStatus(parts);
  const result = {
    success: true,
    creator: safeSlug,
    environment: environment.environment,
    database_environment: environment.database,
    storage_environment: environment.storage,
    supabase_project_ref: environment.supabase_project_ref || null,
    bucket: environment.bucket,
    preview_configured: environment.preview_configured,
    labels: {
      environment: environment.environment,
      database: environment.database,
      storage: environment.storage,
      supabase_project_ref: environment.supabase_project_ref || null,
      bucket: environment.bucket
    },
    write_safety: environment.write_safety,
    overall,
    settings,
    runtime: live,
    database,
    storage,
    public_page: publicPage,
    last_error: lastError,
    checked_at: new Date().toISOString()
  };

  if (settings.source !== "database") {
    result.overall = "failing";
    result.database.status = "failing";
    result.database.error = result.database.error || "Creator settings source is not database";
  }

  if (sendAlertOnFailure && result.overall !== "healthy") {
    await reportCreatorError({
      slug: safeSlug,
      area: "Health",
      action: "Run Health Check",
      error: JSON.stringify({
        overall: result.overall,
        settings: result.settings,
        runtime: result.runtime,
        database: { status: result.database.status, error: result.database.error || "" },
        public_page: result.public_page
      }).slice(0, 850),
      url: publicUrl(req, "/" + safeSlug),
      suggested_check: "Open /api/creator-health, then compare settings/live runtime APIs."
    });
  }

  return result;
}

module.exports = {
  reportCreatorError,
  runCreatorHealth,
  telegramGateFor,
  WATCHTOWER_ALERT,
  WATCHTOWER_EVENT
};
