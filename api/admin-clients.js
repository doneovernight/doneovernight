const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const SUPABASE_TIMEOUT_MS = 10_000;
const MINA_CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const crypto = require("node:crypto");
const handleCreatorLiveStatus = require("../lib/creator-live-status");
const CREATOR_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 16_000_000;
const MAX_MEDIA_BYTES = 10_000_000;
const CREATOR_MEDIA_BUCKET = process.env.CREATOR_MEDIA_BUCKET || "creator-media";
const AUDIO_UPLOAD_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mpeg3",
  "audio/x-mpeg",
  "audio/x-mpeg-3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/aacp"
]);
const GENERIC_UPLOAD_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
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
  "battle_opponent",
  "battle_result",
  "battle_win_streak",
  "battle_updated_at",
  "battle_undo_snapshot"
];
const PHASE_3_CREATOR_FIELDS = [
  "pinned_block",
  "community_state",
  "quick_announcement",
  "quick_poll",
  "faq_visible",
  "discord_visible",
  "creator_passport_visible"
];
const LINK_BLOCK_CREATOR_FIELDS = [
  "discord_link_visible",
  "discord_link_title",
  "discord_link_subtitle",
  "discord_link_cta_label",
  "tiktok_link_visible",
  "tiktok_link_title",
  "tiktok_link_subtitle",
  "tiktok_link_cta_label",
  "battle_link_visible",
  "battle_link_title",
  "battle_link_subtitle",
  "battle_link_cta_label",
  "business_link_visible",
  "business_link_title",
  "business_link_subtitle",
  "business_link_cta_label",
  "music_link_visible",
  "music_link_title",
  "music_link_subtitle",
  "music_link_cta_label",
  "newsletter_cta_label",
  "newsletter_destination",
  "faq_link_visible",
  "faq_link_title",
  "faq_link_subtitle",
  "faq_link_cta_label",
  "faq_link_url",
  "community_link_visible",
  "community_link_title",
  "community_link_subtitle",
  "community_link_cta_label",
  "community_link_url",
  "share_link_visible",
  "custom_links"
];
const INTRO_AUDIO_CREATOR_FIELDS = [
  "intro_audio_enabled",
  "intro_audio_url",
  "intro_audio_volume",
  "intro_audio_fade_out_duration",
  "intro_audio_stop_after"
];
const CREATOR_FIELDS = BASE_CREATOR_FIELDS.concat(AMBIENT_CREATOR_FIELDS, PHASE_1_4_CREATOR_FIELDS, PHASE_2_CREATOR_FIELDS, PHASE_3_CREATOR_FIELDS, LINK_BLOCK_CREATOR_FIELDS, INTRO_AUDIO_CREATOR_FIELDS).join(",");
const CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY = BASE_CREATOR_FIELDS.concat(
  AMBIENT_CREATOR_FIELDS,
  PHASE_1_4_CREATOR_FIELDS,
  PHASE_2_CREATOR_FIELDS,
  PHASE_3_CREATOR_FIELDS,
  LINK_BLOCK_CREATOR_FIELDS.filter((field) => field !== "share_link_visible"),
  INTRO_AUDIO_CREATOR_FIELDS
).join(",");
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
  battle_result: "",
  battle_win_streak: 0,
  battle_updated_at: "",
  battle_undo_snapshot: "",
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
  intro_audio_enabled: false,
  intro_audio_url: "",
  intro_audio_volume: 0.35,
  intro_audio_fade_out_duration: 2,
  intro_audio_stop_after: 4,
  welcome_intro_enabled: true,
  background_gradient: "radial-gradient(circle at 18% -10%, rgba(255,211,223,.22), transparent 30rem), radial-gradient(circle at 105% 8%, rgba(139,95,74,.24), transparent 28rem), linear-gradient(155deg, #080504 0%, #160b09 42%, #050403 100%)",
  ambient_mode_enabled: true,
  timezone: "America/Chicago",
  seasonal_effects_enabled: true,
  holiday_effects_enabled: true,
  discord_invite_url: "https://discord.gg/GGE7WsUZR",
  discord_server_id: "",
  pinned_block: "",
  community_state: "open",
  quick_announcement: "",
  quick_poll: "",
  faq_visible: true,
  discord_visible: true,
  creator_passport_visible: true,
  discord_link_visible: true,
  discord_link_title: "Discord",
  discord_link_subtitle: "Community",
  discord_link_cta_label: "Join",
  tiktok_link_visible: true,
  tiktok_link_title: "TikTok",
  tiktok_link_subtitle: "@mosyaamosya",
  tiktok_link_cta_label: "Watch",
  battle_link_visible: true,
  battle_link_title: "Prepare for Battle",
  battle_link_subtitle: "Get your TikTok Coins before the battle begins.",
  battle_link_cta_label: "Prepare",
  business_link_visible: true,
  business_link_title: "Business",
  business_link_subtitle: "Booking and collabs",
  business_link_cta_label: "Email",
  music_link_visible: false,
  music_link_title: "Music",
  music_link_subtitle: "Mina's stream soundtrack",
  music_link_cta_label: "Open",
  newsletter_cta_label: "Subscribe to the Mailing List",
  newsletter_destination: "",
  faq_link_visible: false,
  faq_link_title: "FAQ",
  faq_link_subtitle: "Questions and answers",
  faq_link_cta_label: "Open",
  faq_link_url: "",
  community_link_visible: true,
  community_link_title: "Community",
  community_link_subtitle: "Join Mina's Discord for stream updates and community drops.",
  community_link_cta_label: "Join Discord",
  community_link_url: "https://discord.gg/GGE7WsUZR",
  share_link_visible: true,
  custom_links: [],
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

function isDirectIntroAudioUrl(value) {
  const raw = clean(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw, "https://doneovernight.com");
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      /\.(mp3|m4a|aac)$/i.test(parsed.pathname);
  } catch (error) {
    return false;
  }
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

function normalizeBattleResult(value) {
  const allowed = new Set(["won", "lost", "tie"]);
  const result = clean(value).toLowerCase();
  return allowed.has(result) ? result : "";
}

function normalizePinnedBlock(value) {
  const allowed = new Set(["", "prepare", "faq", "poll", "announcement", "community", "newsletter", "countdown"]);
  const block = clean(value).toLowerCase();
  return allowed.has(block) ? block : "";
}

function normalizeCommunityState(value) {
  const allowed = new Set(["open", "preview", "hidden"]);
  const state = clean(value).toLowerCase();
  return allowed.has(state) ? state : "open";
}

function normalizeCustomLinks(value) {
  let links = value;
  if (typeof links === "string") {
    try {
      links = JSON.parse(links);
    } catch (error) {
      links = [];
    }
  }
  if (!Array.isArray(links)) return [];
  return links.slice(0, 12).map((link, index) => ({
    id: clean(link && link.id) || "custom-" + (index + 1),
    visible: bool(link && link.visible, true),
    title: clean(link && link.title) || "New link",
    subtitle: clean(link && link.subtitle),
    cta_label: clean(link && (link.cta_label || link.cta)) || "Open",
    url: clean(link && (link.url || link.destination))
  }));
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
  if (["audio/mpeg", "audio/mp3", "audio/mpeg3", "audio/x-mpeg", "audio/x-mpeg-3"].includes(mimeType)) return "mp3";
  if (["audio/aac", "audio/aacp"].includes(mimeType)) return "aac";
  if (["audio/mp4", "audio/m4a", "audio/x-m4a"].includes(mimeType)) return named === "aac" ? "aac" : "m4a";
  return named || "bin";
}

function isIntroAudioFile(mimeType, fallbackName = "") {
  const ext = clean(fallbackName).toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  const named = ext ? ext[1] : "";
  const normalized = clean(mimeType).toLowerCase();
  return (AUDIO_UPLOAD_MIME_TYPES.has(normalized) || GENERIC_UPLOAD_MIME_TYPES.has(normalized)) &&
    ["mp3", "m4a", "aac"].includes(named);
}

function normalizeIntroAudioMimeType(mimeType, fallbackName = "") {
  const ext = clean(fallbackName).toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  const named = ext ? ext[1] : "";
  const normalized = clean(mimeType).toLowerCase();
  if (!["mp3", "m4a", "aac"].includes(named)) return "";
  if (normalized && !AUDIO_UPLOAD_MIME_TYPES.has(normalized) && !GENERIC_UPLOAD_MIME_TYPES.has(normalized)) return "";
  if (named === "mp3") return "audio/mpeg";
  if (named === "m4a") return "audio/mp4";
  if (named === "aac") return "audio/aac";
  return "";
}

function parseDataUrl(value, fallbackMimeType = "") {
  const match = clean(value).match(/^data:([^;,]*);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: clean(match[1] || fallbackMimeType).toLowerCase(),
    buffer: Buffer.from(match[2], "base64")
  };
}

async function uploadCreatorMedia(input = {}) {
  const kind = clean(input.kind);
  const file = input.file || {};
  const parsed = parseDataUrl(file.data || file.dataUrl, file.type);
  if (!parsed) {
    const error = new Error("Paste an asset URL or choose a valid media file.");
    error.statusCode = 400;
    error.code = "INVALID_MEDIA";
    throw error;
  }
  const isImage = parsed.mimeType.startsWith("image/");
  const isVideo = parsed.mimeType.startsWith("video/");
  const isIntroAudio = isIntroAudioFile(parsed.mimeType, file.name);
  const uploadMimeType = kind === "intro-audio" ? normalizeIntroAudioMimeType(parsed.mimeType, file.name) : parsed.mimeType;
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
  if (kind === "intro-audio" && !isIntroAudio) {
    const error = new Error("Intro audio must be an .mp3, .m4a, or .aac file.");
    error.statusCode = 400;
    error.code = "INVALID_MEDIA_TYPE";
    throw error;
  }
  if (kind === "intro-audio" && !uploadMimeType) {
    const error = new Error("Intro audio MIME type does not match .mp3, .m4a, or .aac.");
    error.statusCode = 400;
    error.code = "INVALID_MEDIA_TYPE";
    throw error;
  }
  if (!["profile", "hero", "intro-audio"].includes(kind)) {
    const error = new Error("Unsupported media upload type.");
    error.statusCode = 400;
    error.code = "INVALID_MEDIA_KIND";
    throw error;
  }
  if (parsed.buffer.length > MAX_MEDIA_BYTES) {
    const error = new Error(kind === "intro-audio" ? "Intro audio is too large. Use an .mp3, .m4a, or .aac file under 10 MB." : "Media file is too large. Use a compressed 7-10 second vertical video or paste a hosted asset URL.");
    error.statusCode = 413;
    error.code = "MEDIA_TOO_LARGE";
    throw error;
  }

  const { url, serviceRoleKey } = getSupabaseConfig("Creator media upload");
  const ext = mediaExtension(uploadMimeType, file.name);
  const path = "mosyaamosya/" + kind + "-" + Date.now() + "-" + crypto.randomBytes(5).toString("hex") + "." + ext;
  const response = await fetch(url + "/storage/v1/object/" + CREATOR_MEDIA_BUCKET + "/" + path, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": uploadMimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "true"
    },
    body: parsed.buffer
  });
  const text = await response.text();
  if (!response.ok) {
    let details = text;
    try {
      const json = JSON.parse(text);
      details = json.message || json.error || text;
    } catch (parseError) {}
    const error = new Error("Media upload failed (" + response.status + "): " + (details || response.statusText || "Unknown storage error"));
    error.statusCode = response.status || 503;
    error.code = "MEDIA_UPLOAD_FAILED";
    error.details = text;
    throw error;
  }
  const publicUrl = url + "/storage/v1/object/public/" + CREATOR_MEDIA_BUCKET + "/" + path;
  if (kind === "intro-audio") {
    const verify = await fetch(publicUrl, {
      method: "HEAD",
      headers: { Accept: uploadMimeType }
    });
    const servedType = clean(verify.headers.get("content-type")).toLowerCase();
    if (!verify.ok) {
      const error = new Error("Audio uploaded, but the public URL is not readable (" + verify.status + "). Check the creator-media bucket public policy.");
      error.statusCode = verify.status || 503;
      error.code = "MEDIA_PUBLIC_URL_FAILED";
      throw error;
    }
    if (servedType && !servedType.startsWith("audio/")) {
      const error = new Error("Audio uploaded, but storage is serving it as " + servedType + " instead of audio.");
      error.statusCode = 415;
      error.code = "MEDIA_CONTENT_TYPE_FAILED";
      throw error;
    }
  }
  return {
    kind,
    url: publicUrl,
    contentType: uploadMimeType,
    size: parsed.buffer.length
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
    intro_audio_enabled: bool(row.intro_audio_enabled, false),
    intro_audio_url: clean(row.intro_audio_url),
    intro_audio_volume: Math.max(0, Math.min(1, number(row.intro_audio_volume, DEFAULT_MINA_SETTINGS.intro_audio_volume))),
    intro_audio_fade_out_duration: Math.max(0, Math.min(10, number(row.intro_audio_fade_out_duration, DEFAULT_MINA_SETTINGS.intro_audio_fade_out_duration))),
    intro_audio_stop_after: Math.max(1, Math.min(30, number(row.intro_audio_stop_after, DEFAULT_MINA_SETTINGS.intro_audio_stop_after))),
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
    battle_result: normalizeBattleResult(row.battle_result),
    battle_win_streak: Math.max(0, Math.floor(number(row.battle_win_streak, 0))),
    battle_updated_at: normalizeDateTime(row.battle_updated_at),
    battle_undo_snapshot: clean(row.battle_undo_snapshot),
    pinned_block: normalizePinnedBlock(row.pinned_block),
    community_state: normalizeCommunityState(row.community_state),
    quick_announcement: clean(row.quick_announcement),
    quick_poll: clean(row.quick_poll),
    faq_visible: bool(row.faq_visible, true),
    discord_visible: bool(row.discord_visible, true),
    creator_passport_visible: bool(row.creator_passport_visible, true),
    discord_link_visible: bool(row.discord_link_visible, true),
    discord_link_title: clean(row.discord_link_title) || DEFAULT_MINA_SETTINGS.discord_link_title,
    discord_link_subtitle: clean(row.discord_link_subtitle) || DEFAULT_MINA_SETTINGS.discord_link_subtitle,
    discord_link_cta_label: clean(row.discord_link_cta_label) || DEFAULT_MINA_SETTINGS.discord_link_cta_label,
    tiktok_link_visible: bool(row.tiktok_link_visible, true),
    tiktok_link_title: clean(row.tiktok_link_title) || DEFAULT_MINA_SETTINGS.tiktok_link_title,
    tiktok_link_subtitle: clean(row.tiktok_link_subtitle) || DEFAULT_MINA_SETTINGS.tiktok_link_subtitle,
    tiktok_link_cta_label: clean(row.tiktok_link_cta_label) || DEFAULT_MINA_SETTINGS.tiktok_link_cta_label,
    battle_link_visible: bool(row.battle_link_visible, true),
    battle_link_title: clean(row.battle_link_title) || DEFAULT_MINA_SETTINGS.battle_link_title,
    battle_link_subtitle: clean(row.battle_link_subtitle) || DEFAULT_MINA_SETTINGS.battle_link_subtitle,
    battle_link_cta_label: clean(row.battle_link_cta_label) || DEFAULT_MINA_SETTINGS.battle_link_cta_label,
    business_link_visible: bool(row.business_link_visible, true),
    business_link_title: clean(row.business_link_title) || DEFAULT_MINA_SETTINGS.business_link_title,
    business_link_subtitle: clean(row.business_link_subtitle) || DEFAULT_MINA_SETTINGS.business_link_subtitle,
    business_link_cta_label: clean(row.business_link_cta_label) || DEFAULT_MINA_SETTINGS.business_link_cta_label,
    music_link_visible: bool(row.music_link_visible, false),
    music_link_title: clean(row.music_link_title) || DEFAULT_MINA_SETTINGS.music_link_title,
    music_link_subtitle: clean(row.music_link_subtitle) || DEFAULT_MINA_SETTINGS.music_link_subtitle,
    music_link_cta_label: clean(row.music_link_cta_label) || DEFAULT_MINA_SETTINGS.music_link_cta_label,
    newsletter_cta_label: clean(row.newsletter_cta_label) || DEFAULT_MINA_SETTINGS.newsletter_cta_label,
    newsletter_destination: clean(row.newsletter_destination),
    faq_link_visible: bool(row.faq_link_visible, false),
    faq_link_title: clean(row.faq_link_title) || DEFAULT_MINA_SETTINGS.faq_link_title,
    faq_link_subtitle: clean(row.faq_link_subtitle) || DEFAULT_MINA_SETTINGS.faq_link_subtitle,
    faq_link_cta_label: clean(row.faq_link_cta_label) || DEFAULT_MINA_SETTINGS.faq_link_cta_label,
    faq_link_url: clean(row.faq_link_url),
    community_link_visible: bool(row.community_link_visible, true),
    community_link_title: clean(row.community_link_title) || DEFAULT_MINA_SETTINGS.community_link_title,
    community_link_subtitle: clean(row.community_link_subtitle) || DEFAULT_MINA_SETTINGS.community_link_subtitle,
    community_link_cta_label: clean(row.community_link_cta_label) || DEFAULT_MINA_SETTINGS.community_link_cta_label,
    community_link_url: clean(row.community_link_url) || clean(row.discord_invite_url) || clean(row.discord_url) || DEFAULT_MINA_SETTINGS.community_link_url,
    share_link_visible: bool(row.share_link_visible, true),
    custom_links: normalizeCustomLinks(row.custom_links),
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
    try {
      rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY + "&limit=1", {
        context: "Creator settings"
      });
    } catch (legacyError) {
      rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + BASE_CREATOR_SELECT + "&limit=1", {
        context: "Creator settings"
      });
    }
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
  let tableResult = null;
  try {
    const creator = await fetchCreatorFromTable(slug);
    if (creator) tableResult = { creator, source: "database" };
  } catch (error) {
    // The dedicated creators table may not exist until the SQL file is applied.
  }

  try {
    const creator = await fetchCreatorFromAnalyticsBridge();
    if (creator) {
      const tableTime = tableResult && Date.parse(tableResult.creator.updated_at || "");
      const bridgeTime = Date.parse(creator.updated_at || "");
      if (!tableResult || (Number.isFinite(bridgeTime) && (!Number.isFinite(tableTime) || bridgeTime >= tableTime))) {
        return { creator, source: "analytics_bridge" };
      }
    }
  } catch (error) {
    // If the bridge table is unavailable, fall through to the seeded defaults.
  }

  if (tableResult) return tableResult;
  return { creator: normalizeCreator(DEFAULT_MINA_SETTINGS), source: "seed" };
}

function creatorPayload(input = {}) {
  const introAudioEnabled = bool(input.intro_audio_enabled, false);
  const introAudioUrl = clean(input.intro_audio_url);
  if (introAudioEnabled && !isDirectIntroAudioUrl(introAudioUrl)) {
    const error = new Error("Intro audio is enabled, but no valid direct .mp3, .m4a, or .aac URL is saved.");
    error.statusCode = 400;
    error.code = "INVALID_INTRO_AUDIO_URL";
    throw error;
  }
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
    intro_audio_enabled: introAudioEnabled,
    intro_audio_url: introAudioUrl,
    intro_audio_volume: Math.max(0, Math.min(1, number(input.intro_audio_volume, DEFAULT_MINA_SETTINGS.intro_audio_volume))),
    intro_audio_fade_out_duration: Math.max(0, Math.min(10, number(input.intro_audio_fade_out_duration, DEFAULT_MINA_SETTINGS.intro_audio_fade_out_duration))),
    intro_audio_stop_after: Math.max(1, Math.min(30, number(input.intro_audio_stop_after, DEFAULT_MINA_SETTINGS.intro_audio_stop_after))),
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
    battle_result: normalizeBattleResult(input.battle_result),
    battle_win_streak: Math.max(0, Math.floor(number(input.battle_win_streak, 0))),
    battle_updated_at: normalizeDateTime(input.battle_updated_at),
    battle_undo_snapshot: clean(input.battle_undo_snapshot),
    pinned_block: normalizePinnedBlock(input.pinned_block),
    community_state: normalizeCommunityState(input.community_state),
    quick_announcement: clean(input.quick_announcement),
    quick_poll: clean(input.quick_poll),
    faq_visible: bool(input.faq_visible, true),
    discord_visible: bool(input.discord_visible, true),
    creator_passport_visible: bool(input.creator_passport_visible, true),
    discord_link_visible: bool(input.discord_link_visible, true),
    discord_link_title: clean(input.discord_link_title) || DEFAULT_MINA_SETTINGS.discord_link_title,
    discord_link_subtitle: clean(input.discord_link_subtitle) || DEFAULT_MINA_SETTINGS.discord_link_subtitle,
    discord_link_cta_label: clean(input.discord_link_cta_label) || DEFAULT_MINA_SETTINGS.discord_link_cta_label,
    tiktok_link_visible: bool(input.tiktok_link_visible, true),
    tiktok_link_title: clean(input.tiktok_link_title) || DEFAULT_MINA_SETTINGS.tiktok_link_title,
    tiktok_link_subtitle: clean(input.tiktok_link_subtitle) || DEFAULT_MINA_SETTINGS.tiktok_link_subtitle,
    tiktok_link_cta_label: clean(input.tiktok_link_cta_label) || DEFAULT_MINA_SETTINGS.tiktok_link_cta_label,
    battle_link_visible: bool(input.battle_link_visible, true),
    battle_link_title: clean(input.battle_link_title) || DEFAULT_MINA_SETTINGS.battle_link_title,
    battle_link_subtitle: clean(input.battle_link_subtitle) || DEFAULT_MINA_SETTINGS.battle_link_subtitle,
    battle_link_cta_label: clean(input.battle_link_cta_label) || DEFAULT_MINA_SETTINGS.battle_link_cta_label,
    business_link_visible: bool(input.business_link_visible, true),
    business_link_title: clean(input.business_link_title) || DEFAULT_MINA_SETTINGS.business_link_title,
    business_link_subtitle: clean(input.business_link_subtitle) || DEFAULT_MINA_SETTINGS.business_link_subtitle,
    business_link_cta_label: clean(input.business_link_cta_label) || DEFAULT_MINA_SETTINGS.business_link_cta_label,
    music_link_visible: bool(input.music_link_visible, false),
    music_link_title: clean(input.music_link_title) || DEFAULT_MINA_SETTINGS.music_link_title,
    music_link_subtitle: clean(input.music_link_subtitle) || DEFAULT_MINA_SETTINGS.music_link_subtitle,
    music_link_cta_label: clean(input.music_link_cta_label) || DEFAULT_MINA_SETTINGS.music_link_cta_label,
    newsletter_cta_label: clean(input.newsletter_cta_label) || DEFAULT_MINA_SETTINGS.newsletter_cta_label,
    newsletter_destination: clean(input.newsletter_destination),
    faq_link_visible: bool(input.faq_link_visible, false),
    faq_link_title: clean(input.faq_link_title) || DEFAULT_MINA_SETTINGS.faq_link_title,
    faq_link_subtitle: clean(input.faq_link_subtitle) || DEFAULT_MINA_SETTINGS.faq_link_subtitle,
    faq_link_cta_label: clean(input.faq_link_cta_label) || DEFAULT_MINA_SETTINGS.faq_link_cta_label,
    faq_link_url: clean(input.faq_link_url),
    community_link_visible: bool(input.community_link_visible, true),
    community_link_title: clean(input.community_link_title) || DEFAULT_MINA_SETTINGS.community_link_title,
    community_link_subtitle: clean(input.community_link_subtitle) || DEFAULT_MINA_SETTINGS.community_link_subtitle,
    community_link_cta_label: clean(input.community_link_cta_label) || DEFAULT_MINA_SETTINGS.community_link_cta_label,
    community_link_url: clean(input.community_link_url) || clean(input.discord_invite_url) || clean(input.discord_url) || DEFAULT_MINA_SETTINGS.community_link_url,
    share_link_visible: bool(input.share_link_visible, true),
    custom_links: normalizeCustomLinks(input.custom_links),
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
  let rows;
  try {
    rows = await supabaseFetch("creators?on_conflict=id&select=" + CREATOR_FIELDS, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [payload],
      context: "Creator settings"
    });
  } catch (error) {
    const { share_link_visible, ...legacyPayload } = payload;
    rows = await supabaseFetch("creators?on_conflict=id&select=" + CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [legacyPayload],
      context: "Creator settings"
    });
    await saveCreatorToAnalyticsBridge(payload).catch(() => null);
  }
  const row = Array.isArray(rows) && rows[0] ? rows[0] : payload;
  return { creator: normalizeCreator({ ...payload, ...row }), source: "database" };
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
