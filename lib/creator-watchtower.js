const crypto = require("node:crypto");
const { clean, dispatchWebhook, getWebhookUrls, supabaseFetch } = require("./ops");
const { sendTelegramMessage } = require("../heartbeat/telegram");
const creatorLiveStatus = require("./creator-live-status");

const WATCHTOWER_EVENT = "creator_watchtower_event_mosyaamosya";
const WATCHTOWER_ALERT = "creator_watchtower_alert_mosyaamosya";
const WATCHTOWER_VERSION = "severity-model-v1";
const ALERT_WINDOW_MS = 5 * 60 * 1000;
const CRITICAL_ALERT_WINDOW_MS = 60 * 1000;
const SEVERITIES = new Set(["info", "warning", "error", "critical"]);
const memoryAlertCache = new Map();

function normalizeSlug(value = "mosyaamosya") {
  return clean(value || "mosyaamosya").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "mosyaamosya";
}

function safeText(value, limit = 500) {
  return clean(String(value || "")).replace(/[\r\n\t]+/g, " ").slice(0, limit);
}

function publicUrl(req, path = "/mosyaamosya") {
  const host = clean(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "doneovernight.com");
  const protocol = clean(req?.headers?.["x-forwarded-proto"] || "https");
  const targetHost = host.includes("admin.") ? "doneovernight.com" : host;
  return `${protocol}://${targetHost}${path}`;
}

function normalizeSeverity(value, fallback = "error") {
  const severity = safeText(value || "", 40).toLowerCase();
  return SEVERITIES.has(severity) ? severity : fallback;
}

function alertWindowFor(alert = {}) {
  return alert.severity === "critical" ? CRITICAL_ALERT_WINDOW_MS : ALERT_WINDOW_MS;
}

function fingerprintFor(alert = {}) {
  const basis = [
    normalizeSlug(alert.creator_slug || alert.slug),
    normalizeSeverity(alert.severity),
    safeText(alert.area, 80),
    safeText(alert.action, 120),
    safeText(alert.error || alert.message, 240),
    safeText(alert.url, 200)
  ].join("|");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

function alertText(alert = {}) {
  const severity = normalizeSeverity(alert.severity).toUpperCase();
  const creator = safeText(alert.creator || "Mina Mosya", 100);
  const area = safeText(alert.area || "Creator OS", 80);
  const action = safeText(alert.action || "Unknown", 120);
  const error = safeText(alert.error || alert.message || "Unknown error", 700);
  const url = safeText(alert.url || "", 260);
  const time = safeText(alert.time || new Date().toISOString(), 80);
  const source = safeText(alert.source || "production", 80);
  const environment = safeText(alert.environment || source || "production", 80);
  const hint = safeText(alert.suggested_check || suggestedCheck(alert), 220);
  return [
    severity === "CRITICAL" ? "🚨 Creator OS Critical" : "🚨 Creator OS Error",
    "",
    `Severity: ${severity}`,
    `Creator: ${creator}`,
    `Area: ${area}`,
    `Action: ${action}`,
    `Error: ${error}`,
    `URL: ${url || "Unknown"}`,
    `Time: ${time}`,
    `Source: ${source}`,
    `Environment: ${environment}`,
    `Dedupe: ${safeText(alert.dedupe_key || alert.fingerprint || "", 80)}`,
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

function truthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isSuppressedAdminAuthNoise(alert = {}) {
  if (truthy(alert.authenticated_user_action)) return false;
  const area = String(alert.area || "").toLowerCase();
  const action = String(alert.action || "").toLowerCase();
  const error = String(alert.error || alert.message || "").toLowerCase();
  const url = String(alert.url || "").toLowerCase();
  return area === "admin" &&
    action === "fetch 401" &&
    (error.includes("/api/creator-settings") || url.includes("/api/creator-settings"));
}

function classifyWatchtowerSeverity(input = {}) {
  const explicit = normalizeSeverity(input.severity || input.watchtower_severity || input.level || "", "");
  if (explicit) return explicit;

  const area = String(input.area || "").toLowerCase();
  const action = String(input.action || input.action_name || "").toLowerCase();
  const error = String(input.error || input.message || "").toLowerCase();
  const url = String(input.url || "").toLowerCase();
  const source = String(input.source || "").toLowerCase();
  const authenticated = truthy(input.authenticated_user_action || input.authenticatedUserAction);
  const text = [area, action, error, url].join(" ");

  if (isSuppressedAdminAuthNoise({ ...input, action: input.action || input.action_name })) return "info";
  if (!authenticated && area === "admin" && action.includes("fetch 401") && url.includes("/api/creator-settings")) return "info";
  if (!authenticated && (error.includes("creator access denied") || error.includes("wrong password") || action.includes("login"))) return "info";
  if (text.includes("locked admin") || text.includes("pre-login") || text.includes("stale session") || text.includes("expired session") || text.includes("logout")) return "info";
  if (text.includes("cancelled") || text.includes("canceled") || text.includes("aborterror") || text.includes("user cancelled")) return "info";

  if (text.includes("creator os health failing") || (area.includes("health") && text.includes("failing"))) return "critical";
  if (text.includes("public page unavailable") || text.includes("admin unavailable")) return "critical";
  if (source === "production" && (text.includes("production database unavailable") || text.includes("production storage unavailable"))) return "critical";

  if (authenticated) return "error";
  if (text.includes("save settings") || text.includes("savecreator") || text.includes("save failed")) return "error";
  if (text.includes("media upload") || text.includes("upload failed")) return "error";
  if (text.includes("database write") || text.includes("schema mismatch")) return "error";
  if (text.includes("supabase") || text.includes("postgrest") || text.includes("pgrst")) return "error";
  if (text.includes("api 500") || text.includes(" 500") || text.includes("status 500")) return "error";
  if (text.includes("public page render failure")) return "error";

  if (text.includes("slow api") || text.includes("slow response")) return "warning";
  if (text.includes("temporary fetch retry") || text.includes("retry")) return "warning";
  if (text.includes("degraded optional runtime") || text.includes("optional runtime") || (area.includes("runtime") && text.includes("degraded"))) return "warning";
  if (text.includes("media metadata unavailable") || text.includes("metadata unavailable")) return "warning";
  if (text.includes("non-blocking") || text.includes("third-party") || text.includes("third party")) return "warning";

  return "error";
}

async function writeWatchtowerEvent(eventType, metadata = {}) {
  try {
    await supabaseFetch("analytics_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        event_type: eventType,
        source: "creator_os_watchtower",
        route: safeText(metadata.url || "/mosyaamosya", 180),
        metadata
      })
    });
  } catch (error) {
    console.warn("[CREATOR_WATCHTOWER_EVENT_FAILED]", error.message);
  }
}

async function recentAlertExists(fingerprint, windowMs = ALERT_WINDOW_MS) {
  const cachedAt = memoryAlertCache.get(fingerprint);
  if (cachedAt && Date.now() - cachedAt < windowMs) return true;
  try {
    const rows = await supabaseFetch([
      `analytics_events?event_type=eq.${encodeURIComponent(WATCHTOWER_ALERT)}`,
      "select=metadata,created_at",
      "order=created_at.desc",
      "limit=50"
    ].join("&"));
    const cutoff = Date.now() - windowMs;
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
    const cutoff = Date.now() - ALERT_WINDOW_MS;
    for (const [key, value] of memoryAlertCache.entries()) {
      if (value < cutoff) memoryAlertCache.delete(key);
    }
  }
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
  const slug = normalizeSlug(input.slug || input.creator_slug || "mosyaamosya");
  const severity = classifyWatchtowerSeverity(input);
  const source = safeText(input.source || "production", 80);
  const alert = {
    creator_slug: slug,
    slug,
    creator: safeText(input.creator || "Mina Mosya", 120),
    area: safeText(input.area || "Creator OS", 80),
    action: safeText(input.action || "Unknown", 120),
    error: safeText(input.error || input.message || "Unknown error", 900),
    url: safeText(input.url || "", 300),
    time: safeText(input.time || new Date().toISOString(), 80),
    source,
    environment: safeText(input.environment || input.env || source || "production", 80),
    severity,
    auth_state: safeText(input.auth_state || input.authState || "", 80),
    session_present: input.session_present === true || input.session_present === "true",
    authenticated_user_action: truthy(input.authenticated_user_action || input.authenticatedUserAction),
    force_alert: truthy(input.force_alert || input.forceAlert),
    watchtower_version: safeText(input.watchtower_version || input.watchtowerVersion || WATCHTOWER_VERSION, 80),
    suggested_check: safeText(input.suggested_check || input.suggestedCheck || "", 240)
  };
  alert.suggested_check = alert.suggested_check || suggestedCheck(alert);
  alert.dedupe_key = safeText(input.dedupe_key || input.dedupeKey || fingerprintFor(alert), 120);
  alert.fingerprint = alert.dedupe_key;

  await writeWatchtowerEvent(WATCHTOWER_EVENT, { ...alert, alert_candidate: true });
  if (isSuppressedAdminAuthNoise(alert)) {
    console.warn("[CREATOR_WATCHTOWER_AUTH_NOISE_SUPPRESSED]", alert);
    return { success: true, alert_sent: false, suppressed: true, severity: alert.severity, reason: "admin_creator_settings_401_auth_noise", dedupe_key: alert.dedupe_key, fingerprint: alert.fingerprint };
  }
  const shouldTelegram = alert.force_alert || alert.severity === "error" || alert.severity === "critical";
  if (!shouldTelegram) {
    console.warn("[CREATOR_WATCHTOWER_NON_ALERTING_SEVERITY]", alert);
    return { success: true, alert_sent: false, severity: alert.severity, suppressed: true, reason: "severity_below_telegram_threshold", dedupe_key: alert.dedupe_key, fingerprint: alert.fingerprint };
  }
  const dedupeWindowMs = alertWindowFor(alert);
  const rateLimited = await recentAlertExists(alert.fingerprint, dedupeWindowMs);
  if (rateLimited) {
    console.warn("[CREATOR_WATCHTOWER_RATE_LIMITED]", alert);
    return { success: true, alert_sent: false, severity: alert.severity, rate_limited: true, dedupe_key: alert.dedupe_key, fingerprint: alert.fingerprint, dedupe_window_ms: dedupeWindowMs };
  }
  rememberAlert(alert.fingerprint);

  const text = alertText(alert);
  const telegram = await sendWatchtowerTelegram(text, alert);
  await writeWatchtowerEvent(WATCHTOWER_ALERT, {
    ...alert,
    dedupe_window_ms: dedupeWindowMs,
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
    severity: alert.severity,
    rate_limited: false,
    dedupe_key: alert.dedupe_key,
    fingerprint: alert.fingerprint,
    dedupe_window_ms: dedupeWindowMs,
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

async function checkPublicPage(req, slug) {
  try {
    const response = await fetch(publicUrl(req, "/" + slug), {
      headers: { Accept: "text/html" }
    });
    const text = await response.text();
    const ok = response.ok && text.includes("Mina Mosya") && text.includes("creator_intro_mosyaamosya_v1");
    return {
      status: ok ? "healthy" : "degraded",
      code: response.status,
      checks: {
        loads: response.ok,
        containsCreator: text.includes("Mina Mosya"),
        containsIntro: text.includes("creator_intro_mosyaamosya_v1")
      }
    };
  } catch (error) {
    return { status: "degraded", error: error.message || "Public page check failed" };
  }
}

async function lastWatchtowerError() {
  try {
    const rows = await supabaseFetch([
      `analytics_events?event_type=eq.${encodeURIComponent(WATCHTOWER_ALERT)}`,
      "select=metadata,created_at",
      "order=created_at.desc",
      "limit=20"
    ].join("&"));
    const row = (Array.isArray(rows) ? rows : []).find((item) => {
      const severity = normalizeSeverity(item?.metadata?.severity || "error");
      return severity === "error" || severity === "critical";
    }) || (Array.isArray(rows) && rows[0] ? rows[0] : null);
    if (!row) return null;
    return { created_at: row.created_at, ...(row.metadata || {}) };
  } catch {
    return null;
  }
}

async function lastWatchtowerWarning() {
  try {
    const rows = await supabaseFetch([
      `analytics_events?event_type=eq.${encodeURIComponent(WATCHTOWER_EVENT)}`,
      "select=metadata,created_at",
      "order=created_at.desc",
      "limit=50"
    ].join("&"));
    const row = (Array.isArray(rows) ? rows : []).find((item) => {
      const severity = normalizeSeverity(item?.metadata?.severity || "", "");
      return severity === "warning";
    });
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

async function runCreatorHealth({ req, slug = "mosyaamosya", sendAlertOnFailure = false } = {}) {
  const safeSlug = normalizeSlug(slug);
  const [database, runtimeTable, publicPage, lastError, lastWarning] = await Promise.all([
    checkCreatorDatabase(safeSlug),
    checkRuntimeTable(safeSlug),
    checkPublicPage(req, safeSlug),
    lastWatchtowerError(),
    lastWatchtowerWarning()
  ]);

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
    { status: publicPage.status }
  ];
  const overall = overallStatus(parts);
  const result = {
    success: true,
    creator: safeSlug,
    overall,
    settings,
    runtime: live,
    database,
    public_page: publicPage,
    last_error: lastError,
    last_warning: lastWarning,
    watchtower_severity_model: "enabled",
    watchtower_version: WATCHTOWER_VERSION,
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
      severity: "critical",
      suggested_check: "Open /api/creator-health, then compare settings/live runtime APIs."
    });
  }

  return result;
}

module.exports = {
  reportCreatorError,
  runCreatorHealth,
  classifyWatchtowerSeverity,
  normalizeSeverity,
  WATCHTOWER_VERSION,
  WATCHTOWER_ALERT,
  WATCHTOWER_EVENT
};
