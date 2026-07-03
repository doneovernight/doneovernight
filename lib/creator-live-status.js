const SUPABASE_TIMEOUT_MS = 10_000;
const LIVE_CACHE_TTL_MS = 45_000;
const MINA_CREATOR_ID = "11111111-1111-4111-8111-111111111111";

let cachedStatus = null;

const DEFAULT_MINA_SETTINGS = {
  id: MINA_CREATOR_ID,
  username: "mosyaamosya",
  slug: "mosyaamosya",
  tiktok_url: "https://www.tiktok.com/@mosyaamosya",
  live_url: "https://www.tiktok.com/@mosyaamosya/live",
  live_status: false,
  tiktok_live_username: "mosyaamosya",
  auto_live_detection_enabled: true,
  manual_live_fallback_enabled: true
};

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=30");
  res.end(JSON.stringify(payload));
}

function getQuery(req) {
  const parsed = new URL(req.url || "/", "https://doneovernight.local");
  return {
    ...(req.query || {}),
    ...Object.fromEntries(parsed.searchParams.entries())
  };
}

function normalizeSlug(value) {
  return clean(value || "mosyaamosya").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "mosyaamosya";
}

function normalizeUsername(value) {
  return clean(value || "mosyaamosya").replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "mosyaamosya";
}

function getSupabaseConfig(context = "Creator live status") {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error(context + " Supabase settings are not configured");
    error.code = "SUPABASE_NOT_CONFIGURED";
    throw error;
  }
  return { url, serviceRoleKey };
}

async function supabaseFetch(pathname, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig(options.context);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(url + "/rest/v1/" + pathname, {
      method: options.method || "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error("Supabase request failed: " + response.status);
      error.statusCode = response.status;
      error.details = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCreator(row = {}) {
  return {
    ...DEFAULT_MINA_SETTINGS,
    ...row,
    username: normalizeUsername(row.username || DEFAULT_MINA_SETTINGS.username),
    slug: normalizeSlug(row.slug || DEFAULT_MINA_SETTINGS.slug),
    tiktok_url: clean(row.tiktok_url) || DEFAULT_MINA_SETTINGS.tiktok_url,
    live_url: clean(row.live_url) || DEFAULT_MINA_SETTINGS.live_url,
    live_status: bool(row.live_status, DEFAULT_MINA_SETTINGS.live_status),
    tiktok_live_username: normalizeUsername(row.tiktok_live_username || row.username || DEFAULT_MINA_SETTINGS.tiktok_live_username),
    auto_live_detection_enabled: bool(row.auto_live_detection_enabled, true),
    manual_live_fallback_enabled: bool(row.manual_live_fallback_enabled, DEFAULT_MINA_SETTINGS.manual_live_fallback_enabled)
  };
}

async function fetchCreatorFromTable(slug) {
  const fields = [
    "id",
    "username",
    "slug",
    "tiktok_url",
    "live_url",
    "live_status",
    "tiktok_live_username",
    "auto_live_detection_enabled",
    "manual_live_fallback_enabled"
  ].join(",");
  const rows = await supabaseFetch("creators?slug=eq." + encodeURIComponent(slug) + "&select=" + fields + "&limit=1", {
    context: "Creator live status"
  });
  return Array.isArray(rows) && rows[0] ? normalizeCreator(rows[0]) : null;
}

async function fetchCreatorFromAnalyticsBridge() {
  const rows = await supabaseFetch(
    "analytics_events?event_type=eq.creator_settings_mosyaamosya&select=metadata,created_at&order=created_at.desc&limit=1",
    { context: "Creator live status bridge" }
  );
  const metadata = Array.isArray(rows) && rows[0] && rows[0].metadata ? rows[0].metadata : {};
  return metadata.creator || metadata ? normalizeCreator(metadata.creator || metadata) : null;
}

async function fetchCreator(slug) {
  try {
    const creator = await fetchCreatorFromTable(slug);
    if (creator) return creator;
  } catch (error) {}

  try {
    const creator = await fetchCreatorFromAnalyticsBridge();
    if (creator) return creator;
  } catch (error) {}

  return normalizeCreator(DEFAULT_MINA_SETTINGS);
}

function liveUrl(username, creator) {
  return clean(creator.live_url) || "https://www.tiktok.com/@" + username + "/live";
}

function parseViewerCount(text) {
  const patterns = [
    /"viewer_count"\s*:\s*(\d+)/i,
    /"viewerCount"\s*:\s*(\d+)/i,
    /"user_count"\s*:\s*(\d+)/i,
    /"liveUserCount"\s*:\s*(\d+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

async function checkThirdPartyApi(username, creator) {
  const template = clean(process.env.TIKTOK_LIVE_STATUS_API_URL);
  if (!template) return null;
  const apiKey = clean(process.env.TIKTOK_LIVE_STATUS_API_KEY);
  const url = template.replace("{username}", encodeURIComponent(username));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: "Bearer " + apiKey, "x-api-key": apiKey } : {})
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Live status API failed: " + response.status);
    const data = await response.json();
    const isLive = Boolean(data.isLive ?? data.live ?? data.is_live);
    return {
      isLive,
      platform: "tiktok",
      username,
      viewerCount: Number.isFinite(Number(data.viewerCount ?? data.viewer_count)) ? Number(data.viewerCount ?? data.viewer_count) : null,
      liveUrl: clean(data.liveUrl || data.live_url) || liveUrl(username, creator),
      checkedAt: new Date().toISOString(),
      source: "third-party-api",
      stale: false
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTikTokLivePage(username, creator) {
  const url = "https://www.tiktok.com/@" + encodeURIComponent(username) + "/live";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text();
    const lower = text.toLowerCase();
    if (!response.ok || lower.includes("captcha") || lower.includes("verify to continue")) {
      const error = new Error("TikTok live page unavailable");
      error.code = "TIKTOK_BLOCKED";
      throw error;
    }

    const hasRoomId = /"room(?:id|Id)"\s*:\s*"?\d{6,}"?/i.test(text) || /"room_id"\s*:\s*"?\d{6,}"?/i.test(text);
    const hasLiveSignal = /"isLive"\s*:\s*true/i.test(text) ||
      /"status"\s*:\s*2/.test(text) ||
      /"LiveRoom"/i.test(text) ||
      /LIVE NOW/i.test(text);
    const offlineSignal = lower.includes("couldn't find this live") ||
      lower.includes("live isn't available") ||
      lower.includes("user is not live");
    const isLive = !offlineSignal && (hasRoomId || hasLiveSignal);

    return {
      isLive,
      platform: "tiktok",
      username,
      viewerCount: isLive ? parseViewerCount(text) : null,
      liveUrl: liveUrl(username, creator),
      checkedAt: new Date().toISOString(),
      source: "tiktok-web",
      stale: false
    };
  } finally {
    clearTimeout(timeout);
  }
}

function manualFallback(creator, reason = "manual-fallback") {
  const username = normalizeUsername(creator.tiktok_live_username || creator.username);
  const isLive = bool(creator.manual_live_fallback_enabled, false) || bool(creator.live_status, false);
  return {
    isLive,
    platform: "tiktok",
    username,
    viewerCount: null,
    liveUrl: liveUrl(username, creator),
    checkedAt: new Date().toISOString(),
    source: reason,
    stale: false
  };
}

async function resolveLiveStatus(slug) {
  const cacheKey = slug;
  if (cachedStatus && cachedStatus.key === cacheKey && Date.now() - cachedStatus.time < LIVE_CACHE_TTL_MS) {
    return { ...cachedStatus.payload, stale: false };
  }

  const creator = await fetchCreator(slug);
  const username = normalizeUsername(creator.tiktok_live_username || creator.username);

  let payload;
  if (creator.auto_live_detection_enabled !== false) {
    try {
      payload = await checkThirdPartyApi(username, creator) || await checkTikTokLivePage(username, creator);
    } catch (error) {
      payload = manualFallback(creator, "manual-fallback");
      payload.error = error.code || error.message || "AUTO_LIVE_CHECK_FAILED";
    }
  } else {
    payload = manualFallback(creator, "manual-fallback");
  }

  cachedStatus = { key: cacheKey, time: Date.now(), payload };
  return payload;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  const query = getQuery(req);
  const slug = normalizeSlug(query.slug || "mosyaamosya");
  try {
    const payload = await resolveLiveStatus(slug);
    return send(res, 200, payload);
  } catch (error) {
    const creator = normalizeCreator(DEFAULT_MINA_SETTINGS);
    const payload = manualFallback(creator, "manual-fallback");
    payload.error = error.code || error.message || "LIVE_STATUS_FALLBACK";
    return send(res, 200, payload);
  }
};
