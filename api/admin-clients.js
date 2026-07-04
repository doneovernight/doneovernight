const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const SUPABASE_TIMEOUT_MS = 10_000;
const MINA_CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const crypto = require("node:crypto");
const handleCreatorLiveStatus = require("../lib/creator-live-status");
const CREATOR_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 16_000_000;
const MAX_MEDIA_BYTES = 10_000_000;
const MAX_INTRO_AUDIO_BYTES = 2_000_000;
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
const CREATOR_CONNECTION_PROVIDERS = new Set(["tiktok"]);
const CREATOR_CONNECTION_STATUSES = new Set(["connected", "not_connected", "needs_attention", "disconnected"]);
const TIKTOK_SESSION_COOKIE_NAMES = ["sessionid", "sessionid_ss", "sid_tt", "sid_guard"];
const TIKTOK_OAUTH_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_OAUTH_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const TIKTOK_OAUTH_COOKIE = "creator_tiktok_oauth_state";
const TIKTOK_OAUTH_SCOPE = "user.info.basic";
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
const POLL_CREATOR_FIELDS = [
  "poll_enabled",
  "poll_question",
  "poll_options"
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
  "faq_items",
  "community_link_visible",
  "community_link_title",
  "community_link_subtitle",
  "community_link_cta_label",
  "community_link_url",
  "share_link_visible",
  "custom_links",
  "public_page_order"
];
const INTRO_AUDIO_CREATOR_FIELDS = [
  "intro_audio_enabled",
  "intro_audio_url",
  "intro_audio_volume",
  "intro_audio_fade_out_duration",
  "intro_audio_stop_after"
];
const CREATOR_FIELDS = BASE_CREATOR_FIELDS.concat(AMBIENT_CREATOR_FIELDS, PHASE_1_4_CREATOR_FIELDS, PHASE_2_CREATOR_FIELDS, PHASE_3_CREATOR_FIELDS, POLL_CREATOR_FIELDS, LINK_BLOCK_CREATOR_FIELDS, INTRO_AUDIO_CREATOR_FIELDS).join(",");
const CREATOR_FIELDS_WITHOUT_PAGE_ORDER = BASE_CREATOR_FIELDS.concat(
  AMBIENT_CREATOR_FIELDS,
  PHASE_1_4_CREATOR_FIELDS,
  PHASE_2_CREATOR_FIELDS,
  PHASE_3_CREATOR_FIELDS,
  POLL_CREATOR_FIELDS,
  LINK_BLOCK_CREATOR_FIELDS.filter((field) => field !== "public_page_order"),
  INTRO_AUDIO_CREATOR_FIELDS
).join(",");
const CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY = BASE_CREATOR_FIELDS.concat(
  AMBIENT_CREATOR_FIELDS,
  PHASE_1_4_CREATOR_FIELDS,
  PHASE_2_CREATOR_FIELDS,
  PHASE_3_CREATOR_FIELDS,
  POLL_CREATOR_FIELDS,
  LINK_BLOCK_CREATOR_FIELDS.filter((field) => field !== "share_link_visible"),
  INTRO_AUDIO_CREATOR_FIELDS
).join(",");
const CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY_OR_FAQ_ITEMS = BASE_CREATOR_FIELDS.concat(
  AMBIENT_CREATOR_FIELDS,
  PHASE_1_4_CREATOR_FIELDS,
  PHASE_2_CREATOR_FIELDS,
  PHASE_3_CREATOR_FIELDS,
  POLL_CREATOR_FIELDS,
  LINK_BLOCK_CREATOR_FIELDS.filter((field) => field !== "share_link_visible" && field !== "faq_items"),
  INTRO_AUDIO_CREATOR_FIELDS
).join(",");
const CREATOR_FIELDS_WITHOUT_POLL = BASE_CREATOR_FIELDS.concat(
  AMBIENT_CREATOR_FIELDS,
  PHASE_1_4_CREATOR_FIELDS,
  PHASE_2_CREATOR_FIELDS,
  PHASE_3_CREATOR_FIELDS,
  LINK_BLOCK_CREATOR_FIELDS.filter((field) => field !== "faq_items"),
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
  poll_enabled: false,
  poll_question: "",
  poll_options: ["Yes", "No"],
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
  faq_link_title: "Frequently Asked on Stream",
  faq_link_subtitle: "Quick answers from Mina's livestreams.",
  faq_link_cta_label: "Read",
  faq_link_url: "",
  faq_items: [],
  community_link_visible: true,
  community_link_title: "Community",
  community_link_subtitle: "Join Mina's Discord for stream updates and community drops.",
  community_link_cta_label: "Join Discord",
  community_link_url: "https://discord.gg/GGE7WsUZR",
  share_link_visible: true,
  custom_links: [],
  public_page_order: [],
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

function readableError(value, fallback = "Unknown error") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || fallback;
  if (typeof value === "object") {
    const parts = [];
    ["message", "error", "details", "hint", "code", "status", "statusCode"].forEach((key) => {
      if (value[key] && typeof value[key] !== "object") parts.push(String(value[key]));
    });
    if (value.error && typeof value.error === "object") parts.push(readableError(value.error, ""));
    if (value.details && typeof value.details === "object") parts.push(readableError(value.details, ""));
    const message = parts.filter(Boolean).join(" ");
    if (message) return message;
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
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

function connectionSecret() {
  return process.env.CREATOR_CONNECTIONS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || sessionSecret();
}

function connectionCipherKey() {
  return crypto.createHash("sha256").update(connectionSecret() || "creator-connections-dev").digest();
}

function encryptConnectionSecret(value) {
  const text = clean(value);
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", connectionCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

function normalizeConnectionProvider(value) {
  const provider = clean(value || "tiktok").toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return CREATOR_CONNECTION_PROVIDERS.has(provider) ? provider : "tiktok";
}

function normalizeConnectionStatus(value, fallback = "not_connected") {
  const status = clean(value || fallback).toLowerCase().replace(/[^a-z_]+/g, "_");
  return CREATOR_CONNECTION_STATUSES.has(status) ? status : fallback;
}

function parseCookieHeader(value = "") {
  return clean(value).split(";").reduce((cookies, part) => {
    const item = part.trim();
    if (!item || !item.includes("=")) return cookies;
    const index = item.indexOf("=");
    const key = decodeURIComponent(item.slice(0, index).trim());
    const cookieValue = item.slice(index + 1).trim();
    if (key && cookieValue) cookies[key] = cookieValue;
    return cookies;
  }, {});
}

function clearCookieHeader(name) {
  return name + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

function tiktokOAuthConfig() {
  const redirectUri = clean(process.env.TIKTOK_REDIRECT_URI) || "https://admin.doneovernight.com/mosyaamosya/tiktok/callback";
  const clientKey = clean(process.env.TIKTOK_CLIENT_KEY);
  const clientSecret = clean(process.env.TIKTOK_CLIENT_SECRET);
  return {
    clientKey,
    clientSecret,
    redirectUri,
    configured: Boolean(clientKey && clientSecret && redirectUri)
  };
}

function signCookiePayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + signText(encoded);
}

function verifySignedCookiePayload(value) {
  const [encoded, signature] = clean(value).split(".");
  if (!encoded || !signature || !timingSafeEqualText(signature, signText(encoded))) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
}

function setTikTokOAuthCookie(res, payload) {
  const signed = signCookiePayload(payload);
  res.setHeader("Set-Cookie", TIKTOK_OAUTH_COOKIE + "=" + signed + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600");
}

function redirectTikTokCallback(res, status, message = "") {
  const params = new URLSearchParams({ tab: "connections", tiktok_connection: status });
  if (message) params.set("message", message);
  res.statusCode = 302;
  res.setHeader("Location", "/mosyaamosya?" + params.toString());
  res.setHeader("Set-Cookie", clearCookieHeader(TIKTOK_OAUTH_COOKIE));
  res.end("");
}

function verifyTikTokOAuthState(req, state) {
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  const payload = verifySignedCookiePayload(cookies[TIKTOK_OAUTH_COOKIE]);
  if (!payload || clean(payload.state) !== clean(state) || Number(payload.exp) < Date.now()) {
    const error = new Error("TikTok connection expired. Try connecting again.");
    error.statusCode = 400;
    error.code = "TIKTOK_OAUTH_STATE_INVALID";
    throw error;
  }
  return payload;
}

function inspectTikTokSessionCookie(value = "") {
  const raw = clean(value);
  if (!raw) return { present: false, valid: false, missing: [] };
  const cookies = raw.includes("=") ? parseCookieHeader(raw) : { sessionid: raw };
  const hasSessionId = TIKTOK_SESSION_COOKIE_NAMES.some((name) => clean(cookies[name]));
  const hasTargetIdc = Boolean(clean(cookies["tt-target-idc"]));
  const missing = [];
  if (!hasSessionId) missing.push("sessionid");
  if (!hasTargetIdc) missing.push("tt-target-idc");
  return {
    present: true,
    valid: missing.length === 0,
    missing,
    cookieNames: Object.keys(cookies).filter((name) => TIKTOK_SESSION_COOKIE_NAMES.includes(name) || name === "tt-target-idc")
  };
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
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      data = text || null;
    }
    if (!response.ok) {
      const detail = readableError(data, response.statusText || "Supabase request failed");
      const error = new Error((options.context || "Supabase request") + " failed (" + response.status + "): " + detail);
      error.statusCode = response.status;
      error.details = data;
      error.code = data && data.code ? data.code : "SUPABASE_REQUEST_FAILED";
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

function normalizePollOptions(value) {
  let options = value;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch (error) {
      options = options.split(/\r?\n|,/);
    }
  }
  if (!Array.isArray(options)) options = [];
  const seen = new Set();
  const cleaned = options
    .map((option) => clean(typeof option === "string" ? option : option && (option.label || option.title || option.value)))
    .filter(Boolean)
    .filter((option) => {
      const key = option.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
  while (cleaned.length < 2) cleaned.push(cleaned.length === 0 ? "Yes" : "No");
  return cleaned;
}

function pollOptionId(label, index) {
  const suffix = Array.from(String(label || "")).reduce((sum, char) => (sum + char.charCodeAt(0) * 17) % 999999, 0).toString(16);
  return "option-" + (index + 1) + "-" + suffix;
}

function stablePollHash(value) {
  let hash = 2166136261;
  Array.from(String(value || "")).forEach((char) => {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return (hash >>> 0).toString(16);
}

function pollKeyFor(creator = {}, question = "", options = []) {
  const keyInput = [creator.id || MINA_CREATOR_ID, question, JSON.stringify(options)].join("|");
  return "poll-" + stablePollHash(keyInput);
}

function pollDefinition(creator = {}) {
  const options = normalizePollOptions(creator.poll_options);
  const question = clean(creator.poll_question || creator.quick_poll);
  const enabled = bool(creator.poll_enabled, false) && question && options.length >= 2;
  return {
    enabled: Boolean(enabled),
    question,
    pollKey: pollKeyFor(creator, question, options),
    options: options.map((label, index) => ({ id: pollOptionId(label, index), label }))
  };
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function visitorHash(req, input = {}, pollKey = "") {
  const visitorId = clean(input.visitor_id || input.visitorId || input.device_id || input.deviceId);
  const forwarded = clean(req.headers["x-forwarded-for"]).split(",")[0] || clean(req.socket && req.socket.remoteAddress);
  const userAgent = clean(req.headers["user-agent"]);
  return hashText([sessionSecret(), pollKey, visitorId || forwarded, userAgent].join("|"));
}

function publicCreatorSlug(creator = {}) {
  return normalizeSlug(creator.slug || creator.username || "mosyaamosya");
}

function creatorEventSlug(creator = {}) {
  return publicCreatorSlug(creator).replace(/[^a-z0-9_]+/g, "_");
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

const DEFAULT_PUBLIC_PAGE_ORDER = [
  "community",
  "discord",
  "tiktok",
  "prepare",
  "business",
  "music",
  "faq",
  "poll",
  "newsletter",
  "announcement",
  "countdown",
  "share"
];

function normalizePublicPageOrder(value, customLinks = []) {
  let order = value;
  if (typeof order === "string") {
    try {
      order = JSON.parse(order);
    } catch (error) {
      order = [];
    }
  }
  const normalizedCustomLinks = normalizeCustomLinks(customLinks);
  const customKeys = normalizedCustomLinks.map((link) => "custom:" + link.id);
  const validPattern = /^(discord|tiktok|prepare|business|music|faq|community|newsletter|announcement|countdown|poll|share|custom:[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)$/;
  const seen = new Set();
  const result = [];
  (Array.isArray(order) ? order : []).forEach((item) => {
    const key = clean(item).slice(0, 80);
    if (!key || seen.has(key) || !validPattern.test(key)) return;
    seen.add(key);
    result.push(key);
  });
  DEFAULT_PUBLIC_PAGE_ORDER.concat(customKeys).forEach((key) => {
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  });
  return result;
}

function normalizeFaqItems(value) {
  let items = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch (error) {
      items = [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.slice(0, 20)
    .map((item, index) => ({
      id: clean(item && item.id) || "faq-" + (index + 1),
      visible: bool(item && item.visible, true),
      question: clean(item && item.question),
      answer: clean(item && item.answer)
    }))
    .filter((item) => item.question || item.answer);
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
    const error = new Error("Intro audio MIME type does not match a supported direct audio file.");
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
  const maxBytes = kind === "intro-audio" ? MAX_INTRO_AUDIO_BYTES : MAX_MEDIA_BYTES;
  if (parsed.buffer.length > maxBytes) {
    const error = new Error(kind === "intro-audio" ? "Prepared intro audio is too large. Upload a clip under 2 MB." : "Media file is too large. Use a compressed 7-10 second vertical video or paste a hosted asset URL.");
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
      details = readableError(json, text);
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
    poll_enabled: bool(row.poll_enabled, false),
    poll_question: clean(row.poll_question || row.quick_poll),
    poll_options: normalizePollOptions(row.poll_options),
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
    faq_items: normalizeFaqItems(row.faq_items),
    community_link_visible: bool(row.community_link_visible, true),
    community_link_title: clean(row.community_link_title) || DEFAULT_MINA_SETTINGS.community_link_title,
    community_link_subtitle: clean(row.community_link_subtitle) || DEFAULT_MINA_SETTINGS.community_link_subtitle,
    community_link_cta_label: clean(row.community_link_cta_label) || DEFAULT_MINA_SETTINGS.community_link_cta_label,
    community_link_url: clean(row.community_link_url) || clean(row.discord_invite_url) || clean(row.discord_url) || DEFAULT_MINA_SETTINGS.community_link_url,
    share_link_visible: bool(row.share_link_visible, true),
    custom_links: normalizeCustomLinks(row.custom_links),
    public_page_order: normalizePublicPageOrder(row.public_page_order, row.custom_links),
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
      rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + CREATOR_FIELDS_WITHOUT_PAGE_ORDER + "&limit=1", {
        context: "Creator settings"
      });
    } catch (pageOrderError) {
      try {
        rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY + "&limit=1", {
          context: "Creator settings"
        });
      } catch (legacyError) {
        try {
          rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY_OR_FAQ_ITEMS + "&limit=1", {
            context: "Creator settings"
          });
        } catch (faqError) {
          try {
            rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + CREATOR_FIELDS_WITHOUT_POLL + "&limit=1", {
              context: "Creator settings"
            });
          } catch (pollError) {
            rows = await supabaseFetch("creators?slug=eq." + safeSlug + "&select=" + BASE_CREATOR_SELECT + "&limit=1", {
              context: "Creator settings"
            });
          }
        }
      }
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
    const error = new Error("Creator Signature is enabled, but no valid direct audio URL is saved.");
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
    poll_enabled: bool(input.poll_enabled, false),
    poll_question: clean(input.poll_question || input.quick_poll),
    poll_options: normalizePollOptions(input.poll_options),
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
    faq_items: normalizeFaqItems(input.faq_items),
    community_link_visible: bool(input.community_link_visible, true),
    community_link_title: clean(input.community_link_title) || DEFAULT_MINA_SETTINGS.community_link_title,
    community_link_subtitle: clean(input.community_link_subtitle) || DEFAULT_MINA_SETTINGS.community_link_subtitle,
    community_link_cta_label: clean(input.community_link_cta_label) || DEFAULT_MINA_SETTINGS.community_link_cta_label,
    community_link_url: clean(input.community_link_url) || clean(input.discord_invite_url) || clean(input.discord_url) || DEFAULT_MINA_SETTINGS.community_link_url,
    share_link_visible: bool(input.share_link_visible, true),
    custom_links: normalizeCustomLinks(input.custom_links),
    public_page_order: normalizePublicPageOrder(input.public_page_order, input.custom_links),
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
    const { public_page_order, ...withoutPageOrderPayload } = payload;
    try {
      rows = await supabaseFetch("creators?on_conflict=id&select=" + CREATOR_FIELDS_WITHOUT_PAGE_ORDER, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: [withoutPageOrderPayload],
        context: "Creator settings"
      });
    } catch (pageOrderError) {
      const { share_link_visible, ...legacyVisibilityPayload } = withoutPageOrderPayload;
      try {
      rows = await supabaseFetch("creators?on_conflict=id&select=" + CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: [legacyVisibilityPayload],
        context: "Creator settings"
      });
      } catch (legacyError) {
        const { faq_items, ...legacyFaqPayload } = legacyVisibilityPayload;
        rows = await supabaseFetch("creators?on_conflict=id&select=" + CREATOR_FIELDS_WITHOUT_TRUE_VISIBILITY_OR_FAQ_ITEMS, {
          method: "POST",
          prefer: "resolution=merge-duplicates,return=representation",
          body: [legacyFaqPayload],
          context: "Creator settings"
        });
      }
    }
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

function runtimeActionEventType(slug = "mosyaamosya") {
  return "creator_runtime_action_" + normalizeSlug(slug).replace(/[^a-z0-9_]+/g, "_");
}

async function saveCreatorRuntimeAction(slug, metadata = {}) {
  await supabaseFetch("analytics_events", {
    method: "POST",
    body: {
      event_type: runtimeActionEventType(slug),
      source: "creator_os_admin",
      route: "/" + normalizeSlug(slug),
      metadata
    },
    context: "Creator runtime action"
  }).catch(() => null);
}

async function setCreatorLiveMode(input = {}) {
  const slug = normalizeSlug(input.slug || "mosyaamosya");
  const currentResult = await fetchCreator(slug).catch(() => ({ creator: normalizeCreator(DEFAULT_MINA_SETTINGS) }));
  const current = currentResult.creator || normalizeCreator(DEFAULT_MINA_SETTINGS);
  const isLive = bool(input.live_status ?? input.enabled, false);
  const username = normalizeUsername(input.tiktok_live_username || current.tiktok_live_username || current.username || "mosyaamosya");
  const now = new Date().toISOString();
  const patch = {
    live_status: isLive,
    live_url: clean(input.live_url) || clean(current.live_url) || "https://www.tiktok.com/@" + username + "/live",
    updated_at: now
  };
  if (!isLive) {
    patch.battle_mode_enabled = false;
    const countdownTime = Date.parse(current.next_live_datetime || "");
    if (Number.isFinite(countdownTime) && countdownTime <= Date.now()) patch.next_live_datetime = "";
  }
  const saved = await saveCreator({ ...current, ...patch });
  await saveCreatorRuntimeAction(slug, {
    action: isLive ? "start_live" : "end_live",
    live_status: isLive,
    live_started_at: isLive ? now : "",
    manual_live_fallback_enabled: current.manual_live_fallback_enabled !== false,
    battle_mode_enabled: isLive ? bool(current.battle_mode_enabled, false) : false,
    live_url: patch.live_url,
    updated_at: now
  });
  return {
    creator: saved.creator,
    source: saved.source
  };
}

async function setCreatorRuntimeState(input = {}) {
  const slug = normalizeSlug(input.slug || "mosyaamosya");
  const currentResult = await fetchCreator(slug).catch(() => ({ creator: normalizeCreator(DEFAULT_MINA_SETTINGS) }));
  const current = currentResult.creator || normalizeCreator(DEFAULT_MINA_SETTINGS);
  const now = new Date().toISOString();
  const patch = {
    manual_live_fallback_enabled: bool(input.manual_live_fallback_enabled, current.manual_live_fallback_enabled),
    live_status: bool(input.live_status, current.live_status),
    live_url: clean(input.live_url) || clean(current.live_url),
    battle_mode_enabled: bool(input.battle_mode_enabled, current.battle_mode_enabled),
    battle_opponent: clean(input.battle_opponent),
    battle_result: normalizeBattleResult(input.battle_result),
    battle_win_streak: Math.max(0, Math.floor(number(input.current_win_streak ?? input.battle_win_streak, current.battle_win_streak))),
    battle_updated_at: normalizeDateTime(input.battle_updated_at) || now,
    battle_undo_snapshot: clean(input.battle_undo_snapshot),
    pinned_block: normalizePinnedBlock(input.pinned_block),
    quick_announcement: clean(input.quick_announcement),
    quick_poll: clean(input.quick_poll),
    poll_enabled: bool(input.poll_enabled, current.poll_enabled),
    poll_question: clean(input.poll_question),
    poll_options: normalizePollOptions(input.poll_options),
    next_live_datetime: normalizeDateTime(input.next_live_datetime),
    updated_at: now
  };
  const username = normalizeUsername(input.tiktok_live_username || current.tiktok_live_username || current.username || "mosyaamosya");
  if (patch.live_status && !patch.live_url) patch.live_url = "https://www.tiktok.com/@" + username + "/live";

  const saved = await saveCreator({ ...current, ...patch });
  await saveCreatorRuntimeAction(slug, {
    action: "set_runtime_state",
    live_status: patch.live_status,
    manual_live_fallback_enabled: patch.manual_live_fallback_enabled,
    battle_mode_enabled: patch.battle_mode_enabled,
    battle_opponent: patch.battle_opponent,
    battle_result: patch.battle_result,
    battle_win_streak: patch.battle_win_streak,
    pinned_block: patch.pinned_block,
    quick_announcement: patch.quick_announcement,
    poll_enabled: patch.poll_enabled,
    poll_question: patch.poll_question,
    next_live_datetime: patch.next_live_datetime,
    updated_at: now
  });
  return {
    creator: saved.creator,
    source: saved.source
  };
}

function connectionStatusLabel(status) {
  if (status === "connected") return "Connected";
  if (status === "needs_attention") return "Connection OK";
  return "Connection Required";
}

function sanitizeConnection(row = {}, runtime = null) {
  const provider = normalizeConnectionProvider(row.provider);
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const hasCredential = Boolean(clean(row.access_token_encrypted) || metadata.has_session_cookie || metadata.oauth_connected);
  const runtimeError = runtime && runtime.error ? clean(runtime.error) : "";
  const status = normalizeConnectionStatus(row.status, hasCredential ? "connected" : "not_connected");
  const runtimeState = runtime
    ? runtime.confidence === "confirmed"
      ? (runtime.is_live ? "Live confirmed" : "Offline confirmed")
      : runtimeError
        ? "Trying to reconnect..."
        : status === "connected"
          ? "Trying to reconnect..."
          : ""
    : status === "connected" ? "Trying to reconnect..." : "";
  const runtimeMessage = status === "connected" && runtimeError
    ? "Runtime temporarily unavailable. Trying to reconnect..."
    : "";
  return {
    provider,
    status,
    status_label: connectionStatusLabel(status),
    username: clean(row.username),
    external_id: clean(row.external_id),
    runtime_enabled: bool(row.runtime_enabled, false),
    live_runtime_status: runtimeState,
    runtime_message: runtimeMessage,
    last_sync_at: clean(row.last_sync_at),
    last_error: clean(row.last_error),
    metadata: {
      credential_kind: clean(metadata.credential_kind),
      has_session_cookie: Boolean(metadata.has_session_cookie),
      oauth_connected: Boolean(metadata.oauth_connected),
      oauth_scopes: clean(metadata.oauth_scopes),
      avatar_url: clean(metadata.avatar_url || metadata.avatar_large_url),
      display_name: clean(metadata.display_name),
      profile_deep_link: clean(metadata.profile_deep_link),
      is_verified: Boolean(metadata.is_verified),
      runtime_requires_private_signing: metadata.runtime_requires_private_signing !== false,
      beta_session_cookie: Boolean(metadata.beta_session_cookie),
      live_runtime_source: runtime ? clean(runtime.source) : "",
      live_runtime_confidence: runtime ? clean(runtime.confidence) : "",
      live_runtime_stale: runtime ? Boolean(runtime.stale) : false,
      runtime_error: runtimeError
    },
    created_at: clean(row.created_at),
    updated_at: clean(row.updated_at)
  };
}

async function fetchCreatorRuntimeSnapshot(slug = "mosyaamosya") {
  const fields = [
    "creator_slug",
    "username",
    "is_live",
    "confirmed",
    "confidence",
    "source",
    "room_id",
    "checked_at",
    "last_event_at",
    "stale",
    "error",
    "updated_at"
  ].join(",");
  const rows = await supabaseFetch(
    "creator_live_runtime?creator_slug=eq." + encodeURIComponent(normalizeSlug(slug)) + "&select=" + fields + "&limit=1",
    { context: "Creator connection runtime" }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function defaultTikTokConnection(runtime = null) {
  return sanitizeConnection({
    creator_slug: "mosyaamosya",
    provider: "tiktok",
    status: "not_connected",
    username: DEFAULT_MINA_SETTINGS.tiktok_live_username,
    runtime_enabled: true,
    metadata: {
      credential_kind: "",
      has_session_cookie: false,
      runtime_requires_private_signing: true
    }
  }, runtime);
}

async function fetchCreatorConnections(input = {}) {
  const slug = normalizeSlug(input.slug || "mosyaamosya");
  const runtime = await fetchCreatorRuntimeSnapshot(slug).catch(() => null);
  let rows = [];
  try {
    rows = await supabaseFetch(
      "creator_connections?creator_slug=eq." + encodeURIComponent(slug) +
        "&select=creator_slug,provider,status,username,external_id,access_token_encrypted,session_reference,runtime_enabled,last_sync_at,last_error,metadata,created_at,updated_at&order=provider.asc",
      { context: "Creator connections" }
    );
  } catch (error) {
    return {
      connections: [defaultTikTokConnection(runtime)],
      runtime,
      warning: error.statusCode === 404 ? "CREATOR_CONNECTIONS_TABLE_NOT_APPLIED" : (error.code || "CREATOR_CONNECTIONS_UNAVAILABLE")
    };
  }
  const validRows = Array.isArray(rows)
    ? rows.filter((row) => row && typeof row === "object")
    : [];
  const sanitized = validRows.map((row) => sanitizeConnection(row, row.provider === "tiktok" ? runtime : null));
  if (!sanitized.some((connection) => connection.provider === "tiktok")) sanitized.unshift(defaultTikTokConnection(runtime));
  return { connections: sanitized, runtime };
}

function connectionPayload(input = {}) {
  const provider = normalizeConnectionProvider(input.provider || "tiktok");
  const username = normalizeUsername(input.username || input.tiktok_username || input.tiktokLiveUsername || DEFAULT_MINA_SETTINGS.tiktok_live_username);
  const sessionCookie = clean(input.session_cookie || input.sessionCookie);
  const sessionInfo = inspectTikTokSessionCookie(sessionCookie);
  if (sessionCookie && !sessionInfo.valid) {
    const error = new Error("TikTok session cookie is missing " + sessionInfo.missing.join(" and ") + ".");
    error.statusCode = 400;
    error.code = "INVALID_TIKTOK_SESSION_COOKIE";
    throw error;
  }
  const now = new Date().toISOString();
  const runtimeEnabled = bool(input.runtime_enabled, true);
  const hasSessionCookie = sessionInfo.valid || bool(input.has_session_cookie, false);
  const status = normalizeConnectionStatus(input.status, username ? "connected" : "not_connected");
  return {
    creator_slug: normalizeSlug(input.slug || "mosyaamosya"),
    provider,
    status,
    username,
    external_id: clean(input.external_id),
    ...(sessionInfo.valid ? { access_token_encrypted: encryptConnectionSecret(sessionCookie) } : {}),
    session_reference: sessionInfo.valid ? "supabase:creator_connections:" + provider + ":" + normalizeSlug(input.slug || "mosyaamosya") : clean(input.session_reference),
    runtime_enabled: runtimeEnabled,
    last_sync_at: now,
    last_error: "",
    metadata: {
      provider_version: "v1",
      credential_kind: sessionInfo.valid ? "tiktok_session_cookie" : "",
      has_session_cookie: hasSessionCookie,
      cookie_names: sessionInfo.cookieNames || [],
      beta_session_cookie: sessionInfo.valid,
      oauth_connected: false,
      oauth_capabilities: ["profile_identity"],
      runtime_requires_private_signing: true,
      runtime_gap: "TikTok OAuth does not provide WebCast LIVE runtime access.",
      updated_by: "creator_admin"
    },
    updated_at: now
  };
}

async function saveCreatorConnection(input = {}) {
  const payload = connectionPayload(input);
  const rows = await supabaseFetch("creator_connections?on_conflict=creator_slug,provider&select=creator_slug,provider,status,username,external_id,access_token_encrypted,session_reference,runtime_enabled,last_sync_at,last_error,metadata,created_at,updated_at", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [payload],
    context: "Creator connection save"
  });
  const runtime = await fetchCreatorRuntimeSnapshot(payload.creator_slug).catch(() => null);
  const row = Array.isArray(rows) && rows[0] ? rows[0] : payload;
  return sanitizeConnection(row, runtime);
}

async function disconnectCreatorConnection(input = {}) {
  const slug = normalizeSlug(input.slug || "mosyaamosya");
  const provider = normalizeConnectionProvider(input.provider || "tiktok");
  const now = new Date().toISOString();
  const payload = {
    creator_slug: slug,
    provider,
    status: "disconnected",
    username: normalizeUsername(input.username || DEFAULT_MINA_SETTINGS.tiktok_live_username),
    external_id: "",
    access_token_encrypted: null,
    session_reference: null,
    runtime_enabled: false,
    last_sync_at: now,
    last_error: "",
    metadata: {
      provider_version: "v1",
      credential_kind: "",
      has_session_cookie: false,
      oauth_connected: false,
      disconnected_at: now
    },
    updated_at: now
  };
  const rows = await supabaseFetch("creator_connections?on_conflict=creator_slug,provider&select=creator_slug,provider,status,username,external_id,access_token_encrypted,session_reference,runtime_enabled,last_sync_at,last_error,metadata,created_at,updated_at", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [payload],
    context: "Creator connection disconnect"
  });
  const row = Array.isArray(rows) && rows[0] ? rows[0] : payload;
  return sanitizeConnection(row, null);
}

function startTikTokOAuth(input = {}, res) {
  const config = tiktokOAuthConfig();
  if (!config.configured) {
    return {
      configured: false,
      message: "TikTok Login is not configured yet."
    };
  }
  const state = crypto.randomBytes(24).toString("base64url");
  const slug = normalizeSlug(input.slug || "mosyaamosya");
  setTikTokOAuthCookie(res, {
    state,
    slug,
    mode: clean(input.action) === "reconnect_tiktok" ? "reconnect" : "connect",
    exp: Date.now() + 10 * 60 * 1000
  });
  const url = new URL(TIKTOK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_key", config.clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_OAUTH_SCOPE);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return {
    configured: true,
    auth_url: url.toString(),
    redirect_uri: config.redirectUri
  };
}

async function exchangeTikTokCode(code, config) {
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri
  });
  const response = await fetch(TIKTOK_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache"
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const message = clean(data.error_description) || clean(data.error) || response.statusText || "TikTok token exchange failed.";
    const error = new Error(message);
    error.statusCode = response.status || 502;
    error.code = clean(data.error) || "TIKTOK_TOKEN_EXCHANGE_FAILED";
    throw error;
  }
  return data;
}

async function fetchTikTokUser(accessToken) {
  const fields = [
    "open_id",
    "union_id",
    "avatar_url",
    "avatar_url_100",
    "avatar_large_url",
    "display_name",
    "bio_description",
    "profile_deep_link",
    "is_verified",
    "username"
  ].join(",");
  const url = TIKTOK_USER_INFO_URL + "?fields=" + encodeURIComponent(fields);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json"
    }
  });
  const data = await response.json().catch(() => ({}));
  const apiError = data && data.error && clean(data.error.code) && clean(data.error.code) !== "ok" ? data.error : null;
  if (!response.ok || apiError) {
    const message = readableError(apiError || data, response.statusText || "TikTok user info failed.");
    const error = new Error(message);
    error.statusCode = response.status || 502;
    error.code = apiError && clean(apiError.code) ? clean(apiError.code) : "TIKTOK_USER_INFO_FAILED";
    throw error;
  }
  return data && data.data && data.data.user ? data.data.user : {};
}

async function saveTikTokOAuthConnection(input = {}) {
  const slug = normalizeSlug(input.slug || "mosyaamosya");
  const token = input.token || {};
  const user = input.user || {};
  const now = new Date().toISOString();
  const expiresIn = Math.max(0, number(token.expires_in, 0));
  const refreshExpiresIn = Math.max(0, number(token.refresh_expires_in, 0));
  const externalId = clean(user.open_id || token.open_id || user.union_id);
  const username = normalizeUsername(user.username || DEFAULT_MINA_SETTINGS.tiktok_live_username);
  const secretPayload = {
    access_token: clean(token.access_token),
    refresh_token: clean(token.refresh_token),
    token_type: clean(token.token_type || "Bearer"),
    scope: clean(token.scope || input.scopes || TIKTOK_OAUTH_SCOPE),
    open_id: clean(token.open_id || user.open_id),
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : "",
    refresh_expires_at: refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : ""
  };
  const payload = {
    creator_slug: slug,
    provider: "tiktok",
    status: "connected",
    username,
    external_id: externalId,
    access_token_encrypted: encryptConnectionSecret(JSON.stringify(secretPayload)),
    session_reference: "supabase:creator_connections:tiktok:" + slug,
    runtime_enabled: true,
    last_sync_at: now,
    last_error: "",
    metadata: {
      provider_version: "v1",
      credential_kind: "tiktok_oauth",
      has_session_cookie: false,
      beta_session_cookie: false,
      oauth_connected: true,
      oauth_scopes: clean(token.scope || input.scopes || TIKTOK_OAUTH_SCOPE),
      avatar_url: clean(user.avatar_url),
      avatar_url_100: clean(user.avatar_url_100),
      avatar_large_url: clean(user.avatar_large_url),
      display_name: clean(user.display_name),
      bio_description: clean(user.bio_description),
      profile_deep_link: clean(user.profile_deep_link),
      is_verified: Boolean(user.is_verified),
      runtime_requires_private_signing: true,
      runtime_gap: "TikTok OAuth identifies the account but does not provide WebCast LIVE runtime access.",
      updated_by: "tiktok_oauth"
    },
    updated_at: now
  };
  const rows = await supabaseFetch("creator_connections?on_conflict=creator_slug,provider&select=creator_slug,provider,status,username,external_id,access_token_encrypted,session_reference,runtime_enabled,last_sync_at,last_error,metadata,created_at,updated_at", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [payload],
    context: "TikTok OAuth connection save"
  });
  const runtime = await fetchCreatorRuntimeSnapshot(slug).catch(() => null);
  const row = Array.isArray(rows) && rows[0] ? rows[0] : payload;
  return sanitizeConnection(row, runtime);
}

async function handleTikTokOAuthCallback(req, res) {
  try {
    const query = getQuery(req);
    if (query.error) {
      const description = clean(query.error_description) || clean(query.error) || "TikTok connection was cancelled.";
      return redirectTikTokCallback(res, "error", description);
    }
    const code = clean(query.code);
    const state = clean(query.state);
    if (!code || !state) {
      return redirectTikTokCallback(res, "error", "TikTok did not return a complete authorization response.");
    }
    const statePayload = verifyTikTokOAuthState(req, state);
    const config = tiktokOAuthConfig();
    if (!config.configured) {
      return redirectTikTokCallback(res, "error", "TikTok Login is not configured yet.");
    }
    const token = await exchangeTikTokCode(code, config);
    const user = await fetchTikTokUser(token.access_token);
    await saveTikTokOAuthConnection({
      slug: statePayload.slug || "mosyaamosya",
      token,
      user,
      scopes: clean(query.scopes)
    });
    return redirectTikTokCallback(res, "connected");
  } catch (error) {
    return redirectTikTokCallback(res, "error", readableError(error, "TikTok connection failed."));
  }
}

async function fetchPollVotes(creator, pollKey) {
  let tableRows = [];
  try {
    const rows = await supabaseFetch(
      "creator_poll_votes?creator_id=eq." + encodeURIComponent(creator.id || MINA_CREATOR_ID) +
        "&poll_key=eq." + encodeURIComponent(pollKey) +
      "&select=option_id,option_label,created_at,voter_hash&order=created_at.desc",
      { context: "Creator poll votes" }
    );
    tableRows = Array.isArray(rows) ? rows : [];
  } catch (error) {
    tableRows = [];
  }
  const bridgeRows = await fetchPollVotesFromBridge(creator, pollKey).catch(() => []);
  const seen = new Set();
  return tableRows.concat(bridgeRows)
    .filter((row) => {
      const key = clean(row.voter_hash) || clean(row.option_id) + "|" + clean(row.created_at);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
}

function pollResultsFromRows(definition, rows = []) {
  const counts = new Map(definition.options.map((option) => [option.id, {
    id: option.id,
    label: option.label,
    votes: 0,
    percentage: 0
  }]));
  rows.forEach((row) => {
    const id = clean(row.option_id);
    if (!counts.has(id)) return;
    counts.get(id).votes += 1;
  });
  const totalVotes = Array.from(counts.values()).reduce((sum, item) => sum + item.votes, 0);
  const options = Array.from(counts.values()).map((item) => ({
    ...item,
    percentage: totalVotes ? Math.round((item.votes / totalVotes) * 100) : 0
  }));
  const latest = rows[0] && rows[0].created_at ? rows[0].created_at : null;
  return { totalVotes, options, latestResponseAt: latest };
}

async function pollStateForCreator(creator) {
  const definition = pollDefinition(creator);
  if (!definition.enabled) {
    return {
      enabled: false,
      question: "",
      pollKey: "",
      totalVotes: 0,
      latestResponseAt: null,
      options: []
    };
  }
  const rows = await fetchPollVotes(creator, definition.pollKey).catch(() => []);
  return {
    enabled: true,
    question: definition.question,
    pollKey: definition.pollKey,
    ...pollResultsFromRows(definition, rows)
  };
}

async function findPollVote(creator, pollKey, voterHash) {
  try {
    const rows = await supabaseFetch(
      "creator_poll_votes?creator_id=eq." + encodeURIComponent(creator.id || MINA_CREATOR_ID) +
        "&poll_key=eq." + encodeURIComponent(pollKey) +
        "&voter_hash=eq." + encodeURIComponent(voterHash) +
        "&select=option_id,option_label,created_at&limit=1",
      { context: "Creator poll vote lookup" }
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    const rows = await fetchPollVotesFromBridge(creator, pollKey).catch(() => []);
    return rows.find((row) => row.voter_hash === voterHash) || null;
  }
}

function pollVoteEventType(creator = {}) {
  return "creator_poll_vote_" + creatorEventSlug(creator);
}

function pollResetEventType(creator = {}) {
  return "creator_poll_reset_" + creatorEventSlug(creator);
}

function newsletterSignupEventType(creator = {}) {
  return "creator_newsletter_signup_" + creatorEventSlug(creator);
}

function creatorAnalyticsEventType(creator = {}) {
  return "creator_analytics_" + creatorEventSlug(creator);
}

async function fetchAnalyticsEvents(eventType, limit = 1000) {
  const rows = await supabaseFetch(
    "analytics_events?event_type=eq." + encodeURIComponent(eventType) +
      "&select=metadata,created_at,session_id,user_agent_hash&order=created_at.desc&limit=" + encodeURIComponent(String(limit)),
    { context: "Creator response bridge" }
  );
  return Array.isArray(rows) ? rows : [];
}

async function saveAnalyticsEvent(eventType, metadata = {}) {
  await supabaseFetch("analytics_events", {
    method: "POST",
    body: {
      event_type: eventType,
      source: "creator_os_response",
      route: "/mosyaamosya",
      metadata
    },
    context: "Creator response bridge"
  });
}

function normalizeAnalyticsEventName(value) {
  const event = clean(value).toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
  const allowed = new Set([
    "page_view",
    "join_live_click",
    "prepare_click",
    "tiktok_click",
    "discord_click",
    "community_click",
    "business_click",
    "music_click",
    "faq_click",
    "faq_open",
    "custom_click",
    "share_open",
    "share_item_click",
    "newsletter_open"
  ]);
  return allowed.has(event) ? event : "";
}

function analyticsVisitorHash(req, input = {}) {
  const visitorId = clean(input.visitor_id || input.visitorId || input.device_id || input.deviceId);
  const forwarded = clean(req.headers["x-forwarded-for"]).split(",")[0] || clean(req.socket && req.socket.remoteAddress);
  const userAgent = clean(req.headers["user-agent"]);
  return hashText([sessionSecret(), "creator_analytics", visitorId || forwarded, userAgent].join("|"));
}

async function trackCreatorAnalyticsEvent(req, input = {}) {
  const result = await fetchCreator(input.slug || "mosyaamosya");
  const creator = result.creator;
  const eventName = normalizeAnalyticsEventName(input.event_name || input.eventName || input.name);
  if (!eventName) {
    const error = new Error("Analytics event is not available.");
    error.statusCode = 400;
    error.code = "INVALID_ANALYTICS_EVENT";
    throw error;
  }
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  await supabaseFetch("analytics_events", {
    method: "POST",
    body: {
      event_type: creatorAnalyticsEventType(creator),
      source: "creator_os_public",
      route: clean(input.route) || "/" + publicCreatorSlug(creator),
      referrer: clean(input.referrer).slice(0, 500),
      session_id: clean(input.session_id || input.sessionId).slice(0, 160),
      user_agent_hash: analyticsVisitorHash(req, input),
      metadata: {
        creator_id: creator.id || MINA_CREATOR_ID,
        creator_slug: publicCreatorSlug(creator),
        event_name: eventName,
        block_key: clean(input.block_key || input.blockKey || metadata.block_key || metadata.blockKey).slice(0, 80),
        block_title: clean(input.block_title || input.blockTitle || metadata.block_title || metadata.blockTitle).slice(0, 160),
        destination: clean(input.destination || metadata.destination).slice(0, 500),
        faq_id: clean(input.faq_id || input.faqId || metadata.faq_id || metadata.faqId).slice(0, 120),
        faq_order: Number.isFinite(Number(input.faq_order || input.faqOrder || metadata.faq_order || metadata.faqOrder))
          ? Number(input.faq_order || input.faqOrder || metadata.faq_order || metadata.faqOrder)
          : null
      }
    },
    context: "Creator analytics event"
  });
  return { tracked: true };
}

function eventNameFromRow(row = {}) {
  const metadata = row.metadata || {};
  return clean(metadata.event_name);
}

function blockTitleFromRow(row = {}) {
  const metadata = row.metadata || {};
  return clean(metadata.block_title) || clean(metadata.block_key) || clean(metadata.event_name) || "Action";
}

function analyticsLabel(eventName, blockTitle = "") {
  const labels = {
    join_live_click: "Join Live",
    prepare_click: "Prepare for Battle",
    tiktok_click: "TikTok",
    discord_click: "Discord",
    community_click: "Community",
    business_click: "Business",
    music_click: "Music",
    faq_click: "FAQ",
    faq_open: "FAQ opened",
    custom_click: blockTitle || "Custom link",
    share_open: "Share",
    share_item_click: "Share item",
    newsletter_open: "Newsletter"
  };
  return labels[eventName] || blockTitle || eventName || "Action";
}

function countEvents(rows = [], name) {
  return rows.filter((row) => eventNameFromRow(row) === name).length;
}

function clickRows(rows = []) {
  return rows.filter((row) => {
    const name = eventNameFromRow(row);
    return name && name !== "page_view";
  });
}

function uniqueVisitors(rows = []) {
  const seen = new Set();
  rows.forEach((row) => {
    const key = clean(row.user_agent_hash) || clean(row.session_id);
    if (key) seen.add(key);
  });
  return seen.size;
}

function topAction(rows = []) {
  const counts = new Map();
  rows.forEach((row) => {
    const name = eventNameFromRow(row);
    if (!name || name === "page_view") return;
    const blockTitle = blockTitleFromRow(row);
    const key = name + "|" + blockTitle;
    const current = counts.get(key) || { eventName: name, title: blockTitle, count: 0 };
    current.count += 1;
    counts.set(key, current);
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0] || null;
}

function latestAt(rows = []) {
  const first = rows.find((row) => row && row.created_at);
  return first ? first.created_at : null;
}

async function loadCreatorAnalytics(input = {}) {
  const result = await fetchCreator(input.slug || "mosyaamosya");
  const creator = result.creator;
  const [events, responses, liveStatus] = await Promise.all([
    fetchAnalyticsEvents(creatorAnalyticsEventType(creator), 1000).catch(() => []),
    loadCreatorResponses(input).catch(() => ({ poll: null, newsletter: [] })),
    handleCreatorLiveStatusForAnalytics(input.slug || "mosyaamosya").catch(() => null)
  ]);
  const now = Date.now();
  const liveWindow = events.filter((row) => {
    const time = Date.parse(row.created_at || "");
    return Number.isFinite(time) && now - time <= 5 * 60 * 1000;
  });
  const views = events.filter((row) => eventNameFromRow(row) === "page_view");
  const clicks = clickRows(events);
  const best = topAction(events);
  const poll = responses.poll || { totalVotes: 0, enabled: false, latestResponseAt: null };
  const newsletter = Array.isArray(responses.newsletter) ? responses.newsletter : [];
  const prepareClicks = countEvents(events, "prepare_click");
  const joinLiveClicks = countEvents(events, "join_live_click");
  const motivational = [];
  if (clicks.length > 0) motivational.push("People are clicking.");
  if (prepareClicks > 0) motivational.push("Your battle CTA is working.");
  if (newsletter.length > 0) motivational.push(newsletter.length + " new fan" + (newsletter.length === 1 ? "" : "s") + " joined your list.");
  return {
    livePulse: {
      visitorsNow: uniqueVisitors(liveWindow),
      joinLiveClicks,
      prepareClicks,
      pollVotes: Number(poll.totalVotes) || 0,
      newsletterSignups: newsletter.length,
      liveStatus: liveStatus ? {
        isLive: Boolean(liveStatus.isLive),
        source: clean(liveStatus.source),
        confidence: clean(liveStatus.confidence),
        stale: Boolean(liveStatus.stale),
        error: clean(liveStatus.error)
      } : null
    },
    whatWorked: {
      topClickedAction: best ? analyticsLabel(best.eventName, best.title) : "No clicks yet",
      topClickedActionCount: best ? best.count : 0,
      totalPageViews: views.length,
      totalClicks: clicks.length,
      bestPerformingBlock: best ? analyticsLabel(best.eventName, best.title) : "Waiting for traffic",
      newEmailsCollected: newsletter.length,
      pollParticipation: Number(poll.totalVotes) || 0,
      latestActivityAt: latestAt(events)
    },
    quickActions: {
      canPinPrepare: Boolean(creator.tiktok_coins_url && creator.battle_link_visible !== false),
      canPinPoll: Boolean(creator.poll_enabled && poll.enabled),
      canShowPollResults: Boolean(poll.enabled),
      canStartCountdown: true,
      canExportEmails: newsletter.length > 0
    },
    motivation: motivational.length ? motivational : ["Waiting for the first signal."],
    refreshedAt: new Date().toISOString()
  };
}

async function handleCreatorLiveStatusForAnalytics(slug) {
  const payload = await handleCreatorLiveStatus.resolveLiveStatusForAdmin?.(slug);
  if (payload) return payload;
  const fields = [
    "creator_slug",
    "username",
    "is_live",
    "confirmed",
    "confidence",
    "source",
    "checked_at",
    "stale",
    "stale_after",
    "error",
    "capabilities"
  ].join(",");
  const rows = await supabaseFetch("creator_live_runtime?creator_slug=eq." + encodeURIComponent(normalizeSlug(slug)) + "&select=" + fields + "&limit=1", {
    context: "Creator analytics live runtime"
  });
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;
  const staleAfter = normalizeDateTime(row.stale_after);
  const stale = bool(row.stale, false) || (staleAfter ? Date.parse(staleAfter) < Date.now() : false);
  return {
    isLive: bool(row.is_live, false) && !stale,
    source: clean(row.source) || "runtime",
    confidence: stale ? "unknown" : clean(row.confidence) || "unknown",
    stale,
    error: clean(row.error)
  };
}

async function fetchPollVotesFromBridge(creator, pollKey) {
  const [voteRows, resetRows] = await Promise.all([
    fetchAnalyticsEvents(pollVoteEventType(creator)),
    fetchAnalyticsEvents(pollResetEventType(creator), 200)
  ]);
  const reset = resetRows.find((row) => row && row.metadata && row.metadata.poll_key === pollKey);
  const resetTime = reset && reset.created_at ? Date.parse(reset.created_at) : 0;
  return voteRows
    .filter((row) => {
      const metadata = row && row.metadata ? row.metadata : {};
      const createdTime = row && row.created_at ? Date.parse(row.created_at) : 0;
      return metadata.poll_key === pollKey && (!resetTime || createdTime > resetTime);
    })
    .map((row) => {
      const metadata = row.metadata || {};
      return {
        option_id: clean(metadata.option_id),
        option_label: clean(metadata.option_label),
        voter_hash: clean(metadata.voter_hash),
        created_at: row.created_at || null
      };
    });
}

async function savePollVoteToBridge(req, creator, definition, selected, voterHash) {
  await saveAnalyticsEvent(pollVoteEventType(creator), {
    creator_id: creator.id || MINA_CREATOR_ID,
    creator_slug: publicCreatorSlug(creator),
    poll_key: definition.pollKey,
    option_id: selected.id,
    option_label: selected.label,
    voter_hash: voterHash,
    user_agent: clean(req.headers["user-agent"])
  });
}

async function submitPollVote(req, input = {}) {
  const result = await fetchCreator(input.slug || "mosyaamosya");
  const creator = result.creator;
  const definition = pollDefinition(creator);
  if (!definition.enabled) {
    const error = new Error("Poll is not available.");
    error.statusCode = 400;
    error.code = "POLL_DISABLED";
    throw error;
  }
  const optionId = clean(input.option_id || input.optionId);
  const optionLabel = clean(input.option_label || input.optionLabel);
  const selected = definition.options.find((option) => option.id === optionId) ||
    definition.options.find((option) => option.label.toLowerCase() === optionLabel.toLowerCase());
  if (!selected) {
    const error = new Error("Choose a valid poll answer.");
    error.statusCode = 400;
    error.code = "INVALID_POLL_OPTION";
    throw error;
  }
  const hash = visitorHash(req, input, definition.pollKey);
  const existing = await findPollVote(creator, definition.pollKey, hash).catch(() => null);
  if (!existing) {
    try {
      await supabaseFetch("creator_poll_votes", {
        method: "POST",
        body: {
          creator_id: creator.id || MINA_CREATOR_ID,
          creator_slug: publicCreatorSlug(creator),
          poll_key: definition.pollKey,
          option_id: selected.id,
          option_label: selected.label,
          voter_hash: hash,
          user_agent: clean(req.headers["user-agent"])
        },
        context: "Creator poll vote"
      });
    } catch (error) {
      if (error.statusCode === 409) {
        // Existing soft-dedupe row; return the aggregate state below.
      } else {
        await savePollVoteToBridge(req, creator, definition, selected, hash);
      }
    }
  }
  const saved = existing || await findPollVote(creator, definition.pollKey, hash).catch(() => null);
  const state = await pollStateForCreator(creator);
  return {
    ...state,
    selectedOptionId: saved && saved.option_id ? saved.option_id : selected.id
  };
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

async function submitNewsletterSignup(req, input = {}) {
  const result = await fetchCreator(input.slug || "mosyaamosya");
  const creator = result.creator;
  if (!bool(creator.subscribe_popup_enabled, true)) {
    const error = new Error("Newsletter is not available.");
    error.statusCode = 400;
    error.code = "NEWSLETTER_DISABLED";
    throw error;
  }
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) {
    const error = new Error("Enter a valid email address.");
    error.statusCode = 400;
    error.code = "INVALID_EMAIL";
    throw error;
  }
  try {
    await supabaseFetch("creator_newsletter_signups", {
      method: "POST",
      body: {
        creator_id: creator.id || MINA_CREATOR_ID,
        creator_slug: publicCreatorSlug(creator),
        email,
        email_hash: hashText(email),
        source_page: clean(input.source_page || input.sourcePage || "/" + publicCreatorSlug(creator)),
        user_agent: clean(req.headers["user-agent"])
      },
      context: "Creator newsletter signup"
    });
  } catch (error) {
    if (error.statusCode === 409) return { subscribed: true };
    await saveNewsletterSignupToBridge(req, creator, email, input);
  }
  return { subscribed: true };
}

async function fetchNewsletterSignups(creator) {
  let tableRows = [];
  try {
    const rows = await supabaseFetch(
      "creator_newsletter_signups?creator_id=eq." + encodeURIComponent(creator.id || MINA_CREATOR_ID) +
        "&select=email,source_page,created_at&order=created_at.desc&limit=200",
      { context: "Creator newsletter signups" }
    );
    tableRows = Array.isArray(rows) ? rows.map((row) => ({
      email: clean(row.email),
      source_page: clean(row.source_page),
      created_at: row.created_at || null
    })) : [];
  } catch (error) {
    tableRows = [];
  }
  const bridgeRows = await fetchNewsletterSignupsFromBridge(creator).catch(() => []);
  const seen = new Set();
  return tableRows.concat(bridgeRows)
    .filter((row) => {
      const key = normalizeEmail(row.email);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))
    .slice(0, 200);
}

async function saveNewsletterSignupToBridge(req, creator, email, input = {}) {
  const existing = await fetchAnalyticsEvents(newsletterSignupEventType(creator)).catch(() => []);
  const emailHash = hashText(email);
  const duplicate = existing.some((row) => {
    const metadata = row && row.metadata ? row.metadata : {};
    return metadata.email_hash === emailHash;
  });
  if (duplicate) return;
  await saveAnalyticsEvent(newsletterSignupEventType(creator), {
    creator_id: creator.id || MINA_CREATOR_ID,
    creator_slug: publicCreatorSlug(creator),
    email,
    email_hash: emailHash,
    source_page: clean(input.source_page || input.sourcePage) || "/" + publicCreatorSlug(creator),
    user_agent: clean(req.headers["user-agent"])
  });
}

async function fetchNewsletterSignupsFromBridge(creator) {
  const rows = await fetchAnalyticsEvents(newsletterSignupEventType(creator), 200);
  const seen = new Set();
  return rows
    .map((row) => {
      const metadata = row && row.metadata ? row.metadata : {};
      return {
        email: clean(metadata.email),
        email_hash: clean(metadata.email_hash),
        source_page: clean(metadata.source_page),
        created_at: row.created_at || null
      };
    })
    .filter((row) => {
      if (!row.email || seen.has(row.email_hash || row.email)) return false;
      seen.add(row.email_hash || row.email);
      return true;
    })
    .map(({ email_hash, ...row }) => row);
}

async function loadCreatorResponses(input = {}) {
  const result = await fetchCreator(input.slug || "mosyaamosya");
  const creator = result.creator;
  const poll = await pollStateForCreator(creator);
  const newsletter = await fetchNewsletterSignups(creator).catch(() => []);
  return { poll, newsletter };
}

async function resetPollResults(input = {}) {
  const result = await fetchCreator(input.slug || "mosyaamosya");
  const creator = result.creator;
  const definition = pollDefinition(creator);
  if (!definition.pollKey) return pollStateForCreator(creator);
  try {
    await supabaseFetch(
      "creator_poll_votes?creator_id=eq." + encodeURIComponent(creator.id || MINA_CREATOR_ID) +
        "&poll_key=eq." + encodeURIComponent(definition.pollKey),
      {
        method: "DELETE",
        prefer: "return=minimal",
        context: "Creator poll reset"
      }
    );
  } catch (error) {
    await saveAnalyticsEvent(pollResetEventType(creator), {
      creator_id: creator.id || MINA_CREATOR_ID,
      creator_slug: publicCreatorSlug(creator),
      poll_key: definition.pollKey
    });
  }
  return pollStateForCreator(creator);
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
  if (input.action === "poll_state") {
    const result = await fetchCreator(input.slug || "mosyaamosya");
    const poll = await pollStateForCreator(result.creator);
    return send(res, 200, { success: true, poll });
  }

  if (input.action === "vote_poll") {
    const poll = await submitPollVote(req, input);
    return send(res, 200, { success: true, poll });
  }

  if (input.action === "newsletter_signup") {
    const newsletter = await submitNewsletterSignup(req, input);
    return send(res, 200, { success: true, newsletter });
  }

  if (input.action === "track_creator_event") {
    const event = await trackCreatorAnalyticsEvent(req, input);
    return send(res, 200, { success: true, event });
  }

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

  if (input.action === "load_connections") {
    const result = await fetchCreatorConnections(input);
    return send(res, 200, { success: true, ...result });
  }

  if (input.action === "connect_tiktok" || input.action === "reconnect_tiktok") {
    const oauth = startTikTokOAuth(input, res);
    return send(res, 200, { success: true, ...oauth });
  }

  if (input.action === "disconnect_tiktok") {
    const connection = await disconnectCreatorConnection({
      ...input.connection,
      slug: input.slug || "mosyaamosya",
      provider: "tiktok"
    });
    return send(res, 200, { success: true, connection });
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

  if (input.action === "load_responses") {
    const responses = await loadCreatorResponses(input);
    return send(res, 200, { success: true, responses });
  }

  if (input.action === "load_creator_analytics") {
    const analytics = await loadCreatorAnalytics(input);
    return send(res, 200, { success: true, analytics });
  }

  if (input.action === "reset_poll_results") {
    const poll = await resetPollResults(input);
    return send(res, 200, { success: true, poll });
  }

  if (input.action === "set_live_mode") {
    const result = await setCreatorLiveMode(input);
    return send(res, 200, { success: true, creator: result.creator, source: result.source });
  }

  if (input.action === "set_runtime_state") {
    const result = await setCreatorRuntimeState(input);
    return send(res, 200, { success: true, creator: result.creator, source: result.source });
  }

  const result = await saveCreator(input.creator || input);
  return send(res, 200, { success: true, creator: result.creator, source: result.source });
}

module.exports = async function handler(req, res) {
  const query = getQuery(req);
  if (query.creator_live_status === "1") {
    return handleCreatorLiveStatus(req, res);
  }

  if (query.creator_tiktok_callback === "1") {
    return handleTikTokOAuthCallback(req, res);
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
