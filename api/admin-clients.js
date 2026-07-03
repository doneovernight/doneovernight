const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const SUPABASE_TIMEOUT_MS = 10_000;
const MINA_CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const crypto = require("node:crypto");
const handleCreatorLiveStatus = require("../lib/creator-live-status");
const CREATOR_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 16_000_000;
const MAX_MEDIA_BYTES = 10_000_000;
const CREATOR_MEDIA_BUCKET = process.env.CREATOR_MEDIA_BUCKET || "creator-media";
const BASE_CREATOR_FIELDS = [
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
];
const AMBIENT_CREATOR_FIELDS = [
  "ambient_mode_enabled",
  "timezone",
  "seasonal_effects_enabled",
  "holiday_effects_enabled"
];
const PHASE_1_4_CREATOR_FIELDS = [
  "next_live_datetime",
  "discord_invite_url",
  "discord_server_id"
];
const PHASE_2_CREATOR_FIELDS = [
  "creator_dna",
  "tiktok_live_username",
  "auto_live_detection_enabled",
  "manual_live_fallback_enabled",
  "battle_mode_enabled",
  "battle_opponent"
];
const CREATOR_FIELDS = BASE_CREATOR_FIELDS.concat(AMBIENT_CREATOR_FIELDS, PHASE_1_4_CREATOR_FIELDS, PHASE_2_CREATOR_FIELDS).join(",");
const BASE_CREATOR_SELECT = BASE_CREATOR_FIELDS.join(",");

const DEFAULT_MINA_SETTINGS = {
  id: MINA_CREATOR_ID,
  display_name: "Mina Mosya",
  username: "mosyaamosya",
  slug: "mosyaamosya",
  bio: "Daily livestreams, community, yapping, and soft chaos from Chicago.",
  location: "Chicago 🇺🇸",
  avatar_url: "/assets/mosyaamosya/profile-v2.jpg",
  banner_url: "",
  hero_video_url: "/assets/mosyaamosya/intro.mp4",
  tiktok_url: "https://www.tiktok.com/@mosyaamosya",
  discord_url: "https://discord.gg/GGE7WsUZR",
  instagram_url: "",
  tiktok_coins_url: "https://www.tiktok.com/coin",
  business_email: "mina@doneovernight.com",
  live_url: "",
  live_status: false,
  live_button_text: "Join Live",
  tiktok_live_username: "mosyaamosya",
  auto_live_detection_enabled: true,
  manual_live_fallback_enabled: true,
  battle_mode_enabled: false,
  battle_opponent: "",
  next_live_datetime: "",
  theme_preset: "mina",
  creator_dna: "streamer",
  subscribe_popup_enabled: false,
  subscribe_popup_title: "",
  subscribe_popup_copy: "",
  music_enabled: false,
  music_url: "",
  music_volume: 0.35,
  music_loop: true,
  welcome_intro_enabled: true,
  background_gradient: "radial-gradient(circle at 18% -10%, rgba(255,211,223,.22), transparent 30rem), radial-gradient(circle at 105% 8%, rgba(139,95,74,.24), transparent 28rem), linear-gradient(155deg, #080504 0%, #160b09 42%, #050403 100%)",
  ambient_mode_enabled: true,
  timezone: "America/Chicago",
  seasonal_effects_enabled: true,
  holiday_effects_enabled: true,
  discord_invite_url: "https://discord.gg/GGE7WsUZR",
  discord_server_id: "",
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

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sessionSecret() {
  return process.env.CREATOR_OS_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.MINA_CREATOR_PASSWORD_HASH ||
    process.env.MINA_CREATOR_PASSWORD ||
    "";
}

function signText(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function createCreatorSession(role = "creator") {
  const payload = {
    sub: "mosyaamosya",
    role,
    exp: Date.now() + CREATOR_SESSION_TTL_MS,
    nonce: crypto.randomBytes(12).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + signText(encoded);
}

function verifyCreatorSession(token) {
  const value = clean(token);
  if (!value || !sessionSecret()) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || !timingSafeEqualText(signature, signText(encoded))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.sub !== "mosyaamosya" || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 120000;
  const digest = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("base64url");
  return "pbkdf2_sha256$" + iterations + "$" + salt + "$" + digest;
}

function verifyPassword(password, storedHash) {
  const hash = clean(storedHash);
  if (!password || !hash) return false;
  const [scheme, iterations, salt, digest] = hash.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterations || !salt || !digest) return false;
  const candidate = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, "sha256").toString("base64url");
  return timingSafeEqualText(candidate, digest);
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
      if (body.length > MAX_JSON_BYTES) {
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

async function fetchCreatorPasswordHashFromTable() {
  const rows = await supabaseFetch("creator_auth?creator_id=eq." + MINA_CREATOR_ID + "&select=password_hash,updated_at&limit=1", {
    context: "Creator auth"
  });
  return Array.isArray(rows) && rows[0] ? clean(rows[0].password_hash) : "";
}

async function fetchCreatorPasswordHashFromBridge() {
  const rows = await supabaseFetch(
    "analytics_events?event_type=eq.creator_auth_mosyaamosya&select=metadata,created_at&order=created_at.desc&limit=1",
    { context: "Creator auth bridge" }
  );
  const metadata = Array.isArray(rows) && rows[0] && rows[0].metadata ? rows[0].metadata : {};
  return clean(metadata.password_hash);
}

async function fetchCreatorPasswordHash() {
  try {
    const hash = await fetchCreatorPasswordHashFromTable();
    if (hash) return hash;
  } catch (error) {}

  try {
    const hash = await fetchCreatorPasswordHashFromBridge();
    if (hash) return hash;
  } catch (error) {}

  return clean(process.env.MINA_CREATOR_PASSWORD_HASH || process.env.CREATOR_OS_MINA_PASSWORD_HASH);
}

async function saveCreatorPasswordHashToTable(passwordHash) {
  await supabaseFetch("creator_auth?on_conflict=creator_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: [{
      creator_id: MINA_CREATOR_ID,
      password_hash: passwordHash,
      updated_at: new Date().toISOString()
    }],
    context: "Creator auth"
  });
}

async function saveCreatorPasswordHashToBridge(passwordHash) {
  await supabaseFetch("analytics_events", {
    method: "POST",
    body: {
      event_type: "creator_auth_mosyaamosya",
      source: "creator_os_admin",
      route: "/mosyaamosya",
      metadata: { password_hash: passwordHash }
    },
    context: "Creator auth bridge"
  });
}

async function saveCreatorPasswordHash(passwordHash) {
  try {
    await saveCreatorPasswordHashToTable(passwordHash);
  } catch (error) {
    await saveCreatorPasswordHashToBridge(passwordHash);
  }
}

async function verifyCreatorPassword(password) {
  const value = clean(password);
  if (!value) return false;
  const storedHash = await fetchCreatorPasswordHash();
  if (storedHash) return verifyPassword(value, storedHash);
  const envPassword = clean(process.env.MINA_CREATOR_PASSWORD || process.env.CREATOR_OS_MINA_PASSWORD);
  return envPassword ? timingSafeEqualText(value, envPassword) : false;
}

async function verifyCreatorAccess(input = {}) {
  const session = verifyCreatorSession(input.creator_session || input.creatorSession);
  if (session) return { authorized: true, role: session.role || "creator" };

  const password = clean(input.creator_password || input.creatorPassword || input.admin_key || input.adminKey);
  if (await verifyCreatorPassword(password)) return { authorized: true, role: "creator" };
  if (await verifyAdminKey(password)) return { authorized: true, role: "master" };
  return { authorized: false, role: "" };
}

function normalizeSlug(value) {
  const slug = clean(value || DEFAULT_MINA_SETTINGS.slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || DEFAULT_MINA_SETTINGS.slug;
}

function normalizeUsername(value) {
  const username = clean(value || DEFAULT_MINA_SETTINGS.username)
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  return username || DEFAULT_MINA_SETTINGS.username;
}

function normalizeTheme(value) {
  const allowed = new Set(["mina", "rose", "chocolate", "onyx", "ocean", "matcha", "solar", "violet", "neon", "founder"]);
  const preset = clean(value || DEFAULT_MINA_SETTINGS.theme_preset).toLowerCase();
  return allowed.has(preset) ? preset : DEFAULT_MINA_SETTINGS.theme_preset;
}

function normalizeCreatorDna(value) {
  const allowed = new Set(["artist", "streamer", "influencer", "founder", "musician", "podcaster", "gamer", "realtor", "coach", "restaurant", "business"]);
  const dna = clean(value || DEFAULT_MINA_SETTINGS.creator_dna).toLowerCase();
  return allowed.has(dna) ? dna : DEFAULT_MINA_SETTINGS.creator_dna;
}

function normalizeDateTime(value) {
  const input = clean(value);
  if (!input) return "";
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mediaExtension(mimeType, fallbackName = "") {
  const fromName = clean(fallbackName).toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  const named = fromName ? fromName[1] : "";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return named || "bin";
}

function parseDataUrl(value) {
  const match = clean(value).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

async function uploadCreatorMedia(input = {}) {
  const kind = clean(input.kind);
  const file = input.file || {};
  const parsed = parseDataUrl(file.data || file.dataUrl);
  if (!parsed) {
    const error = new Error("Paste an asset URL or choose a valid media file.");
    error.statusCode = 400;
    error.code = "INVALID_MEDIA";
    throw error;
  }
  const isImage = parsed.mimeType.startsWith("image/");
  const isVideo = parsed.mimeType.startsWith("video/");
  if (kind === "profile" && !isImage) {
    const error = new Error("Profile media must be an image file.");
    error.statusCode = 400;
    error.code = "INVALID_MEDIA_TYPE";
    throw error;
  }
  if (kind === "hero" && !isVideo) {
    const error = new Error("Hero media must be a vertical video file.");
    error.statusCode = 400;
    error.code = "INVALID_MEDIA_TYPE";
    throw error;
  }
  if (parsed.buffer.length > MAX_MEDIA_BYTES) {
    const error = new Error("Media file is too large. Use a compressed 7-10 second vertical video or paste a hosted asset URL.");
    error.statusCode = 413;
    error.code = "MEDIA_TOO_LARGE";
    throw error;
  }

  const { url, serviceRoleKey } = getSupabaseConfig("Creator media upload");
  const ext = mediaExtension(parsed.mimeType, file.name);
  const path = "mosyaamosya/" + kind + "-" + Date.now() + "-" + crypto.randomBytes(5).toString("hex") + "." + ext;
  const response = await fetch(url + "/storage/v1/object/" + CREATOR_MEDIA_BUCKET + "/" + path, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": parsed.mimeType,
      "x-upsert": "true"
    },
    body: parsed.buffer
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error("Media upload is not configured. Paste an asset URL instead.");
    error.statusCode = response.status || 503;
    error.code = "MEDIA_UPLOAD_FAILED";
    error.details = text;
    throw error;
  }
  return {
    kind,
    url: url + "/storage/v1/object/public/" + CREATOR_MEDIA_BUCKET + "/" + path
  };
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
    ambient_mode_enabled: bool(row.ambient_mode_enabled, true),
    timezone: clean(row.timezone) || DEFAULT_MINA_SETTINGS.timezone,
    seasonal_effects_enabled: bool(row.seasonal_effects_enabled, true),
    holiday_effects_enabled: bool(row.holiday_effects_enabled, true),
    redirect_mina_enabled: bool(row.redirect_mina_enabled, true),
    tiktok_url: clean(row.tiktok_url),
    discord_url: clean(row.discord_url) || DEFAULT_MINA_SETTINGS.discord_url,
    instagram_url: clean(row.instagram_url),
    tiktok_coins_url: clean(row.tiktok_coins_url),
    business_email: clean(row.business_email),
    live_url: clean(row.live_url),
    live_status: bool(row.live_status, false),
    live_button_text: clean(row.live_button_text) || DEFAULT_MINA_SETTINGS.live_button_text,
    tiktok_live_username: normalizeUsername(row.tiktok_live_username || row.username || DEFAULT_MINA_SETTINGS.tiktok_live_username),
    auto_live_detection_enabled: bool(row.auto_live_detection_enabled, true),
    manual_live_fallback_enabled: bool(row.manual_live_fallback_enabled, DEFAULT_MINA_SETTINGS.manual_live_fallback_enabled),
    battle_mode_enabled: bool(row.battle_mode_enabled, false),
    battle_opponent: clean(row.battle_opponent),
    next_live_datetime: normalizeDateTime(row.next_live_datetime),
    theme_preset: normalizeTheme(row.theme_preset),
    creator_dna: normalizeCreatorDna(row.creator_dna),
    subscribe_popup_enabled: bool(row.subscribe_popup_enabled, true),
    subscribe_popup_title: clean(row.subscribe_popup_title) || DEFAULT_MINA_SETTINGS.subscribe_popup_title,
    subscribe_popup_copy: clean(row.subscribe_popup_copy) || DEFAULT_MINA_SETTINGS.subscribe_popup_copy,
    discord_invite_url: clean(row.discord_invite_url) || clean(row.discord_url) || DEFAULT_MINA_SETTINGS.discord_invite_url,
    discord_server_id: clean(row.discord_server_id)
  };
}

async function fetchCreatorFromTable(slug = "mosyaamosya") {
  const safeSlug = encodeURIComponent(normalizeSlug(slug));
  let rows;
  try {
    rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + CREATOR_FIELDS + "&limit=1", {
      context: "Creator settings"
    });
  } catch (error) {
    rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + BASE_CREATOR_SELECT + "&limit=1", {
      context: "Creator settings"
    });
  }
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
    ambient_mode_enabled: bool(input.ambient_mode_enabled, true),
    timezone: clean(input.timezone) || DEFAULT_MINA_SETTINGS.timezone,
    seasonal_effects_enabled: bool(input.seasonal_effects_enabled, true),
    holiday_effects_enabled: bool(input.holiday_effects_enabled, true),
    redirect_mina_enabled: bool(input.redirect_mina_enabled, true),
    tiktok_url: clean(input.tiktok_url),
    discord_url: clean(input.discord_url) || DEFAULT_MINA_SETTINGS.discord_url,
    instagram_url: clean(input.instagram_url),
    tiktok_coins_url: clean(input.tiktok_coins_url),
    business_email: clean(input.business_email),
    live_url: clean(input.live_url),
    live_status: bool(input.live_status, false),
    live_button_text: clean(input.live_button_text) || DEFAULT_MINA_SETTINGS.live_button_text,
    tiktok_live_username: normalizeUsername(input.tiktok_live_username || input.username || DEFAULT_MINA_SETTINGS.tiktok_live_username),
    auto_live_detection_enabled: bool(input.auto_live_detection_enabled, true),
    manual_live_fallback_enabled: bool(input.manual_live_fallback_enabled, DEFAULT_MINA_SETTINGS.manual_live_fallback_enabled),
    battle_mode_enabled: bool(input.battle_mode_enabled, false),
    battle_opponent: clean(input.battle_opponent),
    next_live_datetime: normalizeDateTime(input.next_live_datetime),
    theme_preset: normalizeTheme(input.theme_preset),
    creator_dna: normalizeCreatorDna(input.creator_dna),
    subscribe_popup_enabled: bool(input.subscribe_popup_enabled, true),
    subscribe_popup_title: clean(input.subscribe_popup_title) || DEFAULT_MINA_SETTINGS.subscribe_popup_title,
    subscribe_popup_copy: clean(input.subscribe_popup_copy) || DEFAULT_MINA_SETTINGS.subscribe_popup_copy,
    discord_invite_url: clean(input.discord_invite_url) || clean(input.discord_url) || DEFAULT_MINA_SETTINGS.discord_invite_url,
    discord_server_id: clean(input.discord_server_id),
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
  if (input.action === "login") {
    const credential = clean(input.creator_password || input.creatorPassword || input.admin_key || input.adminKey);
    const creatorOk = await verifyCreatorPassword(credential);
    const masterOk = creatorOk ? false : await verifyAdminKey(credential);
    if (!creatorOk && !masterOk) {
      return send(res, 401, { success: false, error: "Creator access denied" });
    }
    const result = await fetchCreator(input.slug || "mosyaamosya").catch(() => ({
      creator: normalizeCreator(DEFAULT_MINA_SETTINGS),
      source: "fallback"
    }));
    return send(res, 200, {
      success: true,
      creator: result.creator,
      source: result.source,
      role: masterOk ? "master" : "creator",
      creator_session: createCreatorSession(masterOk ? "master" : "creator")
    });
  }

  const access = await verifyCreatorAccess(input);
  if (!access.authorized) {
    return send(res, 401, { success: false, error: "Creator access denied" });
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

  if (input.action === "change_password") {
    const currentPassword = clean(input.current_password || input.currentPassword);
    const newPassword = clean(input.new_password || input.newPassword);
    const confirmPassword = clean(input.confirm_password || input.confirmPassword);
    if (newPassword.length < 10) {
      return send(res, 400, { success: false, error: "New password must be at least 10 characters." });
    }
    if (newPassword !== confirmPassword) {
      return send(res, 400, { success: false, error: "New passwords do not match." });
    }
    if (access.role !== "master" && !(await verifyCreatorPassword(currentPassword))) {
      return send(res, 401, { success: false, error: "Current password is incorrect." });
    }
    await saveCreatorPasswordHash(hashPassword(newPassword));
    return send(res, 200, {
      success: true,
      message: "Creator password updated.",
      creator_session: createCreatorSession("creator")
    });
  }

  if (input.action === "upload_media") {
    const media = await uploadCreatorMedia(input);
    return send(res, 200, { success: true, media });
  }

  const result = await saveCreator(input.creator || input);
  return send(res, 200, { success: true, creator: result.creator, source: result.source });
}

module.exports = async function handler(req, res) {
  const query = getQuery(req);
  if (query.creator_live_status === "1") {
    return handleCreatorLiveStatus(req, res);
  }

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
        error: error.message || "Could not save creator settings",
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
