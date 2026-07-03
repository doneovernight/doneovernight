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
  manual_live_fallback_enabled: true,
  battle_mode_enabled: false,
  battle_opponent: "",
  battle_result: "",
  battle_win_streak: 0,
  battle_updated_at: ""
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
    manual_live_fallback_enabled: bool(row.manual_live_fallback_enabled, DEFAULT_MINA_SETTINGS.manual_live_fallback_enabled),
    battle_mode_enabled: bool(row.battle_mode_enabled, false),
    battle_opponent: clean(row.battle_opponent),
    battle_result: normalizeBattleResult(row.battle_result),
    battle_win_streak: Math.max(0, Math.floor(numberOrNull(row.battle_win_streak) ?? 0)),
    battle_updated_at: normalizeDateTime(row.battle_updated_at)
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
    "manual_live_fallback_enabled",
    "battle_mode_enabled",
    "battle_opponent",
    "battle_result",
    "battle_win_streak",
    "battle_updated_at"
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

function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : null;
}

function stringOrNull(value) {
  const next = clean(value);
  return next || null;
}

function normalizeBattleResult(value) {
  const allowed = new Set(["won", "lost", "tie"]);
  const result = clean(value).toLowerCase();
  return allowed.has(result) ? result : "";
}

function normalizeDateTime(value) {
  const input = clean(value);
  if (!input) return "";
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function durationOrNull(value) {
  if (typeof value === "string" && clean(value)) return clean(value);
  const seconds = numberOrNull(value);
  if (seconds === null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return hours + "h " + String(minutes).padStart(2, "0") + "m";
  return minutes + "m";
}

function defaultCapabilities(overrides = {}) {
  return {
    viewerCount: false,
    likeCount: false,
    liveDuration: false,
    roomId: false,
    liveTitle: false,
    battleActive: false,
    battleWinStreak: false,
    battleResult: false,
    gifts: false,
    topGifters: false,
    ...overrides
  };
}

function basePayload({ isLive, username, creator, source, error = null, stale = false, capabilities = {} }) {
  const battleActive = bool(creator.battle_mode_enabled, false);
  return {
    isLive: Boolean(isLive),
    platform: "tiktok",
    username,
    viewerCount: null,
    likeCount: null,
    liveDuration: null,
    roomId: null,
    liveTitle: null,
    battleActive,
    battleOpponent: battleActive ? stringOrNull(creator.battle_opponent) : null,
    battleResult: battleActive ? normalizeBattleResult(creator.battle_result) || null : null,
    battleWinStreak: battleActive && creator.battle_win_streak > 0 ? creator.battle_win_streak : null,
    battleUpdatedAt: battleActive ? stringOrNull(creator.battle_updated_at) : null,
    gifts: null,
    topGifters: null,
    liveUrl: liveUrl(username, creator),
    checkedAt: new Date().toISOString(),
    source,
    stale,
    error,
    capabilities: defaultCapabilities({
      battleActive,
      battleWinStreak: battleActive && creator.battle_win_streak > 0,
      battleResult: battleActive && Boolean(normalizeBattleResult(creator.battle_result)),
      ...capabilities
    })
  };
}

function reliableNumber(...values) {
  for (const value of values) {
    const next = numberOrNull(value);
    if (next !== null) return next;
  }
  return null;
}

function applyMetadata(payload, metadata = {}) {
  const capabilities = { ...payload.capabilities };
  const viewerCount = reliableNumber(metadata.viewerCount, metadata.viewer_count, metadata.user_count, metadata.liveUserCount);
  if (viewerCount !== null && metadata.viewerCountReliable !== false) {
    payload.viewerCount = viewerCount;
    capabilities.viewerCount = true;
  }
  const likeCount = reliableNumber(metadata.likeCount, metadata.like_count, metadata.likes);
  if (likeCount !== null) {
    payload.likeCount = likeCount;
    capabilities.likeCount = true;
  }
  const duration = durationOrNull(metadata.liveDuration || metadata.live_duration || metadata.duration || metadata.durationSeconds || metadata.liveDurationSeconds);
  if (duration) {
    payload.liveDuration = duration;
    capabilities.liveDuration = true;
  }
  const roomId = stringOrNull(metadata.roomId || metadata.room_id);
  if (roomId) {
    payload.roomId = roomId;
    capabilities.roomId = true;
  }
  const liveTitle = stringOrNull(metadata.liveTitle || metadata.live_title || metadata.title);
  if (liveTitle) {
    payload.liveTitle = liveTitle;
    capabilities.liveTitle = true;
  }
  if (typeof metadata.battleActive === "boolean" || typeof metadata.battle_active === "boolean") {
    payload.battleActive = Boolean(metadata.battleActive ?? metadata.battle_active);
    payload.battleOpponent = payload.battleActive ? stringOrNull(metadata.battleOpponent || metadata.battle_opponent || payload.battleOpponent) : null;
    if (!payload.battleActive) {
      payload.battleResult = null;
      payload.battleWinStreak = null;
      payload.battleUpdatedAt = null;
    }
    capabilities.battleActive = true;
  }
  if (Array.isArray(metadata.gifts)) {
    payload.gifts = metadata.gifts;
    capabilities.gifts = true;
  }
  if (Array.isArray(metadata.topGifters || metadata.top_gifters)) {
    payload.topGifters = metadata.topGifters || metadata.top_gifters;
    capabilities.topGifters = true;
  }
  payload.capabilities = defaultCapabilities(capabilities);
  return payload;
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
    const payload = basePayload({
      isLive,
      username,
      creator: { ...creator, live_url: clean(data.liveUrl || data.live_url) || creator.live_url },
      source: "auto"
    });
    return applyMetadata(payload, data);
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
    likeCount: null,
    liveDuration: null,
    roomId: null,
    liveTitle: null,
    battleActive: bool(creator.battle_mode_enabled, false),
    battleOpponent: bool(creator.battle_mode_enabled, false) ? stringOrNull(creator.battle_opponent) : null,
    battleResult: bool(creator.battle_mode_enabled, false) ? normalizeBattleResult(creator.battle_result) || null : null,
    battleWinStreak: bool(creator.battle_mode_enabled, false) && creator.battle_win_streak > 0 ? creator.battle_win_streak : null,
    battleUpdatedAt: bool(creator.battle_mode_enabled, false) ? stringOrNull(creator.battle_updated_at) : null,
    gifts: null,
    topGifters: null,
    liveUrl: liveUrl(username, creator),
    checkedAt: new Date().toISOString(),
    source: reason,
    stale: false,
    error: reason === "manual-fallback" ? null : reason,
    capabilities: defaultCapabilities({
      battleActive: bool(creator.battle_mode_enabled, false),
      battleWinStreak: bool(creator.battle_mode_enabled, false) && creator.battle_win_streak > 0,
      battleResult: bool(creator.battle_mode_enabled, false) && Boolean(normalizeBattleResult(creator.battle_result))
    })
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
      payload = await checkThirdPartyApi(username, creator);
      if (!payload) {
        payload = manualFallback(creator, "manual-fallback");
        payload.error = "AUTO_RUNTIME_NOT_CONFIGURED";
      }
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
