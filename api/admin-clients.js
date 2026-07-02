const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const SUPABASE_TIMEOUT_MS = 10_000;
const MINA_CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_FIELDS = [
  "id",
  "display_name",
  "username",
  "slug",
  "bio",
  "location",
  "avatar_url",
  "banner_url",
  "hero_video_url",
  "music_enabled",
  "music_url",
  "music_volume",
  "music_loop",
  "welcome_intro_enabled",
  "background_gradient",
  "redirect_mina_enabled",
  "tiktok_url",
  "discord_url",
  "instagram_url",
  "tiktok_coins_url",
  "business_email",
  "live_url",
  "live_status",
  "live_button_text",
  "theme_preset",
  "subscribe_popup_enabled",
  "subscribe_popup_title",
  "subscribe_popup_copy",
  "updated_at"
].join(",");

const DEFAULT_MINA_SETTINGS = {
  id: MINA_CREATOR_ID,
  display_name: "Mina Mosya",
  username: "mosyaamosya",
  slug: "mosyaamosya",
  bio: "Daily livestreams, community, yapping, and soft chaos from Chicago.",
  location: "Chicago 🇺🇸",
  avatar_url: "/assets/mosyaamosya/profile.jpg",
  banner_url: "",
  hero_video_url: "/assets/mosyaamosya/intro.mp4",
  tiktok_url: "https://www.tiktok.com/@mosyaamosya",
  discord_url: "",
  instagram_url: "",
  tiktok_coins_url: "https://www.tiktok.com/coin",
  business_email: "mina@doneovernight.com",
  live_url: "",
  live_status: false,
  live_button_text: "Join Live",
  theme_preset: "mina",
  subscribe_popup_enabled: false,
  subscribe_popup_title: "",
  subscribe_popup_copy: "",
  music_enabled: false,
  music_url: "",
  music_volume: 0.35,
  music_loop: true,
  welcome_intro_enabled: true,
  background_gradient: "radial-gradient(circle at 18% -10%, rgba(255,211,223,.22), transparent 30rem), radial-gradient(circle at 105% 8%, rgba(139,95,74,.24), transparent 28rem), linear-gradient(155deg, #080504 0%, #160b09 42%, #050403 100%)",
  redirect_mina_enabled: true,
  updated_at: new Date(0).toISOString()
};

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function getQuery(req) {
  const parsed = new URL(req.url || "/", "https://doneovernight.local");
  return {
    ...(req.query || {}),
    ...Object.fromEntries(parsed.searchParams.entries())
  };
}

function getSupabaseConfig(context = "Admin clients") {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error(context + " are not configured");
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
      if (body.length > 80_000) {
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
    return data && data.success === true;
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseFetch(pathname, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig(options.context || "Supabase");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(url + "/rest/v1/" + pathname, {
      method: options.method || "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.prefer ? { Prefer: options.prefer } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
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

async function fetchClients() {
  return supabaseFetch("portal_requests?select=*&order=created_at.desc", { context: "Admin clients" });
}

function normalizeSlug(value) {
  const slug = clean(value || DEFAULT_MINA_SETTINGS.slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || DEFAULT_MINA_SETTINGS.slug;
}

function normalizeTheme(value) {
  const allowed = new Set(["mina", "rose", "chocolate", "onyx", "ocean", "matcha", "solar", "violet"]);
  const preset = clean(value || DEFAULT_MINA_SETTINGS.theme_preset).toLowerCase();
  return allowed.has(preset) ? preset : DEFAULT_MINA_SETTINGS.theme_preset;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCreator(row = {}) {
  return {
    ...DEFAULT_MINA_SETTINGS,
    ...row,
    id: row.id || MINA_CREATOR_ID,
    display_name: clean(row.display_name) || DEFAULT_MINA_SETTINGS.display_name,
    username: clean(row.username) || DEFAULT_MINA_SETTINGS.username,
    slug: normalizeSlug(row.slug || row.username),
    bio: clean(row.bio) || DEFAULT_MINA_SETTINGS.bio,
    location: clean(row.location),
    avatar_url: clean(row.avatar_url),
    banner_url: clean(row.banner_url),
    hero_video_url: clean(row.hero_video_url) || DEFAULT_MINA_SETTINGS.hero_video_url,
    music_enabled: bool(row.music_enabled, false),
    music_url: clean(row.music_url),
    music_volume: Math.max(0, Math.min(1, number(row.music_volume, DEFAULT_MINA_SETTINGS.music_volume))),
    music_loop: bool(row.music_loop, true),
    welcome_intro_enabled: bool(row.welcome_intro_enabled, true),
    background_gradient: clean(row.background_gradient) || DEFAULT_MINA_SETTINGS.background_gradient,
    redirect_mina_enabled: bool(row.redirect_mina_enabled, true),
    tiktok_url: clean(row.tiktok_url),
    discord_url: clean(row.discord_url),
    instagram_url: clean(row.instagram_url),
    tiktok_coins_url: clean(row.tiktok_coins_url),
    business_email: clean(row.business_email),
    live_url: clean(row.live_url),
    live_status: bool(row.live_status, false),
    live_button_text: clean(row.live_button_text) || DEFAULT_MINA_SETTINGS.live_button_text,
    theme_preset: normalizeTheme(row.theme_preset),
    subscribe_popup_enabled: bool(row.subscribe_popup_enabled, true),
    subscribe_popup_title: clean(row.subscribe_popup_title) || DEFAULT_MINA_SETTINGS.subscribe_popup_title,
    subscribe_popup_copy: clean(row.subscribe_popup_copy) || DEFAULT_MINA_SETTINGS.subscribe_popup_copy
  };
}

async function fetchCreatorFromTable(slug = "mosyaamosya") {
  const safeSlug = encodeURIComponent(normalizeSlug(slug));
  const rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + CREATOR_FIELDS + "&limit=1", {
    context: "Creator settings"
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return normalizeCreator(rows[0]);
}

async function fetchCreatorFromAnalyticsBridge() {
  const rows = await supabaseFetch(
    "analytics_events?event_type=eq.creator_settings_mosyaamosya&select=metadata,created_at&order=created_at.desc&limit=1",
    { context: "Creator analytics bridge" }
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const metadata = rows[0].metadata || {};
  return normalizeCreator(metadata.creator || metadata);
}

async function fetchCreator(slug = "mosyaamosya") {
  try {
    const creator = await fetchCreatorFromTable(slug);
    if (creator) return { creator, source: "database" };
  } catch (error) {
    // The dedicated creators table may not exist until the SQL file is applied.
  }

  try {
    const creator = await fetchCreatorFromAnalyticsBridge();
    if (creator) return { creator, source: "analytics_bridge" };
  } catch (error) {
    // If the bridge table is unavailable, fall through to the seeded defaults.
  }

  return { creator: normalizeCreator(DEFAULT_MINA_SETTINGS), source: "seed" };
}

function creatorPayload(input = {}) {
  return {
    id: MINA_CREATOR_ID,
    display_name: clean(input.display_name) || DEFAULT_MINA_SETTINGS.display_name,
    username: clean(input.username) || DEFAULT_MINA_SETTINGS.username,
    slug: normalizeSlug(input.slug || input.username),
    bio: clean(input.bio),
    location: clean(input.location),
    avatar_url: clean(input.avatar_url),
    banner_url: clean(input.banner_url),
    hero_video_url: clean(input.hero_video_url) || DEFAULT_MINA_SETTINGS.hero_video_url,
    music_enabled: bool(input.music_enabled, false),
    music_url: clean(input.music_url),
    music_volume: Math.max(0, Math.min(1, number(input.music_volume, DEFAULT_MINA_SETTINGS.music_volume))),
    music_loop: bool(input.music_loop, true),
    welcome_intro_enabled: bool(input.welcome_intro_enabled, true),
    background_gradient: clean(input.background_gradient) || DEFAULT_MINA_SETTINGS.background_gradient,
    redirect_mina_enabled: bool(input.redirect_mina_enabled, true),
    tiktok_url: clean(input.tiktok_url),
    discord_url: clean(input.discord_url),
    instagram_url: clean(input.instagram_url),
    tiktok_coins_url: clean(input.tiktok_coins_url),
    business_email: clean(input.business_email),
    live_url: clean(input.live_url),
    live_status: bool(input.live_status, false),
    live_button_text: clean(input.live_button_text) || DEFAULT_MINA_SETTINGS.live_button_text,
    theme_preset: normalizeTheme(input.theme_preset),
    subscribe_popup_enabled: bool(input.subscribe_popup_enabled, true),
    subscribe_popup_title: clean(input.subscribe_popup_title) || DEFAULT_MINA_SETTINGS.subscribe_popup_title,
    subscribe_popup_copy: clean(input.subscribe_popup_copy) || DEFAULT_MINA_SETTINGS.subscribe_popup_copy,
    updated_at: new Date().toISOString()
  };
}

async function saveCreatorToTable(payload) {
  const rows = await supabaseFetch("creators?on_conflict=id&select=" + CREATOR_FIELDS, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [payload],
    context: "Creator settings"
  });
  const row = Array.isArray(rows) && rows[0] ? rows[0] : payload;
  return { creator: normalizeCreator(row), source: "database" };
}

async function saveCreatorToAnalyticsBridge(payload) {
  const rows = await supabaseFetch("analytics_events?select=metadata,created_at", {
    method: "POST",
    prefer: "return=representation",
    body: {
      event_type: "creator_settings_mosyaamosya",
      source: "creator_os_admin",
      route: "/mosyaamosya",
      metadata: { creator: payload }
    },
    context: "Creator analytics bridge"
  });
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  const metadata = row && row.metadata ? row.metadata : { creator: payload };
  return { creator: normalizeCreator(metadata.creator || metadata), source: "analytics_bridge" };
}

async function saveCreator(input = {}) {
  const payload = creatorPayload(input);
  try {
    return await saveCreatorToTable(payload);
  } catch (error) {
    return saveCreatorToAnalyticsBridge(payload);
  }
}

async function handleCreatorSettings(req, res) {
  if (req.method === "GET") {
    try {
      const query = getQuery(req);
      const result = await fetchCreator(clean(query.slug) || "mosyaamosya");
      return send(res, 200, { success: true, creator: result.creator, source: result.source });
    } catch (error) {
      return send(res, 200, {
        success: true,
        creator: normalizeCreator(DEFAULT_MINA_SETTINGS),
        source: "fallback",
        warning: error.code || "CREATOR_SETTINGS_FALLBACK"
      });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  const input = await parseBody(req);
  const adminKey = clean(input.admin_key || input.adminKey);
  const authorized = await verifyAdminKey(adminKey);
  if (!authorized) {
    return send(res, 401, { success: false, error: "Admin access denied" });
  }

  if (input.action === "load") {
    try {
      const result = await fetchCreator(input.slug || "mosyaamosya");
      return send(res, 200, { success: true, creator: result.creator, source: result.source });
    } catch (error) {
      return send(res, 200, {
        success: true,
        creator: normalizeCreator(DEFAULT_MINA_SETTINGS),
        source: "fallback",
        warning: error.code || "CREATOR_SETTINGS_FALLBACK"
      });
    }
  }

  const result = await saveCreator(input.creator || input);
  return send(res, 200, { success: true, creator: result.creator, source: result.source });
}

module.exports = async function handler(req, res) {
  const query = getQuery(req);
  if (query.creator_settings === "1") {
    try {
      return await handleCreatorSettings(req, res);
    } catch (error) {
      if (error.message === "Invalid JSON") {
        return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
      }
      if (error.message === "Payload too large") {
        return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
      }
      return send(res, error.statusCode || 500, {
        success: false,
        error: "Could not save creator settings",
        code: error.code || "CREATOR_SETTINGS_FAILED"
      });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const adminKey = clean(input.admin_key || input.adminKey);
    const authorized = await verifyAdminKey(adminKey);
    if (!authorized) {
      return send(res, 401, { success: false, error: "Admin access denied" });
    }

    const clients = await fetchClients();
    return send(res, 200, { success: true, clients: Array.isArray(clients) ? clients : [] });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }
    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: "Could not load admin clients",
      code: error.code || "ADMIN_CLIENTS_FAILED"
    });
  }
};
