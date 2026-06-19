const crypto = require("crypto");

const { clean, dispatchWebhook, getWebhookUrls, normalizeAccessKey, parseBody, send, supabaseFetch } = require("../lib/ops");
const { loadOperatorRuntime } = require("../lib/operator-runtime");
const { syncOperatorProfile } = require("../lib/operator-sync");
const SUPABASE_AUTH_TIMEOUT_MS = 10_000;
const OPERATOR_NOTIFY_TIMEOUT_MS = 7_000;
const DEFAULT_OPERATOR_SESSION_DAYS = 21;
const OPERATOR_SESSION_COOKIE = "don_operator_session";
const OPERATOR_LOGIN_URL = "https://operator.doneovernight.com";
const OPERATOR_REVIEW_URL = "https://admin.doneovernight.com";
const OPERATOR_WORKFLOW_VERSION = "operator_webhooks_v2";
const OPERATOR_APPLY_WEBHOOK_URL = "https://n8n.doneovernight.com/webhook/operator-apply";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function nullable(value) {
  if (Array.isArray(value)) return value.length ? value : null;
  const cleaned = clean(value);
  return cleaned || null;
}

function cleanInstagramHandle(value) {
  return clean(value)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/g, "")
    .replace(/[^a-z0-9._]/gi, "")
    .slice(0, 40);
}

function buildPublicLinksValue(input = {}) {
  const portfolio = clean(input.portfolio || input.portfolio_url || input.portfolioUrl).slice(0, 420);
  const instagram = cleanInstagramHandle(input.instagram || input.instagram_handle || input.instagramHandle);
  if (instagram) return JSON.stringify({ portfolio, instagram });
  return portfolio;
}

function publicProfileInput(input = {}) {
  return {
    display_name: clean(input.display_name || input.displayName).slice(0, 120),
    bio: clean(input.bio).slice(0, 600),
    avatar_url: clean(input.avatar_url || input.avatarUrl).slice(0, 180000),
    accent_tint: clean(input.accent_tint || input.accentTint).slice(0, 40),
    portfolio: clean(input.portfolio || input.portfolio_url || input.portfolioUrl).slice(0, 420),
    instagram_handle: cleanInstagramHandle(input.instagram || input.instagram_handle || input.instagramHandle)
  };
}

function parsePublicLinks(value) {
  const raw = clean(value);
  if (!raw) return { portfolio: "", instagram: "" };
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return {
        portfolio: clean(parsed.portfolio).slice(0, 420),
        instagram: cleanInstagramHandle(parsed.instagram)
      };
    } catch (error) {
      return { portfolio: raw, instagram: "" };
    }
  }
  return { portfolio: raw, instagram: "" };
}

function profileLinksFromRecord(profile = {}) {
  const parsed = parsePublicLinks(profile.portfolio_url || profile.portfolio);
  return {
    portfolio: clean(profile.portfolio || parsed.portfolio),
    instagram: cleanInstagramHandle(profile.instagram_handle || profile.instagram || parsed.instagram)
  };
}

function missingColumnName(error) {
  const detail = String(error?.detail || error?.message || "");
  return detail.match(/'([^']+)' column/)?.[1]
    || detail.match(/column "([^"]+)"/i)?.[1]
    || detail.match(/Could not find the '([^']+)'/i)?.[1]
    || "";
}

function normalizeOperatorAvailability(value) {
  const normalized = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  const labels = {
    available: "Available",
    busy: "Busy",
    offline: "Offline",
    always_available: "Always Available"
  };
  const key = Object.prototype.hasOwnProperty.call(labels, normalized) ? normalized : "always_available";
  return { value: key, label: labels[key] };
}

function normalizeUsername(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 31);
}

const RESERVED_OPERATOR_HANDLES = new Set(["apply", "login", "admin", "api", "auth", "settings", "help", "support", "system"]);

function normalizeOperatorHandle(value) {
  const handle = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9_-]{1,30}$/.test(handle) || RESERVED_OPERATOR_HANDLES.has(handle)) return "";
  return handle;
}

function legacyUsernameHandle(profile = {}) {
  const username = normalizeOperatorHandle(profile.username);
  if (!username || username === "operator") return "";
  return username;
}

function handleFromEmail(email) {
  return normalizeOperatorHandle(String(email || "").split("@")[0] || "");
}

function canonicalProfileHandle(profile = {}) {
  return normalizeOperatorHandle(profile.handle)
    || normalizeOperatorHandle(profile.handle_normalized)
    || legacyUsernameHandle(profile)
    || handleFromEmail(profile.email);
}

function operatorHandleUrl(profile = {}) {
  const handle = canonicalProfileHandle(profile);
  return handle ? `/@${encodeURIComponent(handle)}` : "/";
}

function hashOperatorToken(token) {
  return crypto.createHash("sha256").update(clean(token)).digest("hex");
}

function normalizeLoginIdentifier(value) {
  const raw = clean(value);
  const lowered = raw.toLowerCase();
  if (isValidEmail(lowered)) {
    return { raw, email: lowered, handle: "", isEmail: true };
  }
  const handle = normalizeOperatorHandle(raw);
  return { raw, email: "", handle, isEmail: false };
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    if (key) cookies[key] = value;
    return cookies;
  }, {});
}

function setOperatorCookie(res, token, expiresAt) {
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  res.setHeader("Set-Cookie", [
    `${OPERATOR_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; "));
}

function clearOperatorCookie(res) {
  res.setHeader("Set-Cookie", [
    `${OPERATOR_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; "));
}

function sanitizeOperator(profile = {}) {
  const handle = canonicalProfileHandle(profile);
  const publicLinks = profileLinksFromRecord(profile);
  const rawPayload = profile.raw_payload && typeof profile.raw_payload === "object" ? profile.raw_payload : {};
  const availability = normalizeOperatorAvailability(rawPayload.operator_availability || rawPayload.availability_status || rawPayload.availability);
  return {
    id: profile.id || "",
    email: profile.email || "",
    handle,
    username: handle,
    display_name: profile.display_name || profile.full_name || "",
    name: profile.display_name || profile.full_name || "",
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || profile.profile_image || "",
    accent_tint: profile.accent_tint || "",
    portfolio: publicLinks.portfolio,
    instagram: publicLinks.instagram,
    role_type: profile.role_type || profile.role || "",
    skills: profile.skills || profile.specialties || [],
    timezone: profile.timezone || "",
    status: profile.status || "",
    operator_availability: availability.value,
    operator_availability_label: availability.label,
    operator_availability_updated_at: rawPayload.operator_availability_updated_at || null
  };
}

function sanitizeApplicationRecord(record = {}) {
  if (!record) return null;
  return {
    id: record.id || "",
    email: record.email || "",
    name: record.name || "",
    status: record.status || record.approval_state || "",
    source: record.source || "operator_apply",
    signup_method: record.signup_method || "",
    created_at: record.created_at || "",
    updated_at: record.updated_at || ""
  };
}

function sanitizeApplicationSnapshot(record = {}) {
  if (!record) return null;
  return {
    id: record.id || "",
    operator_profile_id: record.operator_profile_id || null,
    email: record.email || "",
    approval_state: record.approval_state || "",
    created_at: record.created_at || "",
    updated_at: record.updated_at || ""
  };
}

function buildApplicationResponse({ operator, profile, applicationRecord, applicationSnapshot, webhookResult, fallback = false, rawPayload = {}, email = "", name = "" } = {}) {
  const safeProfile = sanitizeOperator({
    ...(operator || {}),
    ...(profile || {}),
    email: email || profile?.email || operator?.email,
    display_name: profile?.display_name || rawPayload.display_name || name,
    full_name: profile?.full_name || rawPayload.display_name || name,
    handle_normalized: profile?.handle || profile?.handle_normalized || rawPayload.handle,
    handle: profile?.handle || rawPayload.handle,
    username: profile?.username || rawPayload.handle,
    status: profile?.status || operator?.status || "pending"
  });
  return {
    success: true,
    ...(fallback ? { fallback: true } : {}),
    operator: safeProfile,
    profile: safeProfile,
    application: sanitizeApplicationRecord(applicationRecord),
    applicationSnapshot: sanitizeApplicationSnapshot(applicationSnapshot),
    webhook: webhookResult
  };
}

function isActiveOperator(profile) {
  return clean(profile?.status).toLowerCase() === "active";
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Operator onboarding is not configured");
    error.statusCode = 503;
    error.code = "OPERATOR_ONBOARDING_NOT_CONFIGURED";
    throw error;
  }
  return { url, serviceRoleKey };
}

async function verifySupabaseAccessToken(accessToken) {
  const token = clean(accessToken);
  if (!token) return null;
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error("Google identity could not be verified");
      error.statusCode = 401;
      error.code = "GOOGLE_IDENTITY_INVALID";
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertOperatorProfile(payload) {
  const rows = await supabaseFetch("operator_profiles?on_conflict=email", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function findOperatorByEmail(email) {
  const rows = await supabaseFetch([
    `operator_profiles?email=eq.${encodeURIComponent(clean(email).toLowerCase())}`,
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : null;
}

async function findOperatorByIdentifier(identifier) {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized.email && !normalized.handle) return null;
  if (normalized.isEmail) return findOperatorByEmail(normalized.email);

  const directRows = await supabaseFetch([
    `operator_profiles?handle_normalized=eq.${encodeURIComponent(normalized.handle)}`,
    "select=*",
    "limit=1"
  ].join("&")).catch(() => []);
  if (Array.isArray(directRows) && directRows[0]) return directRows[0];

  const usernameRows = await supabaseFetch([
    `operator_profiles?username=eq.${encodeURIComponent(normalized.handle)}`,
    "select=*",
    "limit=1"
  ].join("&")).catch(() => []);
  if (Array.isArray(usernameRows) && usernameRows[0]) return usernameRows[0];

  const handleRows = await supabaseFetch([
    `operator_profiles?handle=eq.${encodeURIComponent(normalized.handle)}`,
    "select=*",
    "limit=1"
  ].join("&")).catch(() => []);
  if (Array.isArray(handleRows) && handleRows[0]) return handleRows[0];

  return null;
}

async function operatorHandleClaimed(handle, email) {
  const normalized = normalizeOperatorHandle(handle);
  if (!normalized) return false;
  const ownerEmail = clean(email).toLowerCase();
  const paths = [
    `operator_profiles?handle_normalized=eq.${encodeURIComponent(normalized)}&select=email&limit=3`,
    `operator_profiles?handle=eq.${encodeURIComponent(normalized)}&select=email&limit=3`,
    `operator_profiles?username=eq.${encodeURIComponent(normalized)}&select=email&limit=3`
  ];
  for (const path of paths) {
    const rows = await supabaseFetch(path).catch(() => []);
    if ((Array.isArray(rows) ? rows : []).some((row) => clean(row.email).toLowerCase() !== ownerEmail)) {
      return true;
    }
  }
  return false;
}

async function createOperatorSession(res, profile) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DEFAULT_OPERATOR_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseFetch("operator_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      operator_profile_id: profile.id,
      token_hash: hashOperatorToken(rawToken),
      expires_at: expiresAt
    })
  });
  setOperatorCookie(res, rawToken, expiresAt);
  return {
    operator: sanitizeOperator(profile),
    expiresAt
  };
}

async function getOperatorSession(req) {
  const token = parseCookies(req)[OPERATOR_SESSION_COOKIE];
  if (!token) return null;
  const now = new Date().toISOString();
  const rows = await supabaseFetch([
    `operator_sessions?token_hash=eq.${encodeURIComponent(hashOperatorToken(token))}`,
    "revoked_at=is.null",
    `expires_at=gt.${encodeURIComponent(now)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const session = Array.isArray(rows) ? rows[0] : null;
  if (!session?.operator_profile_id) return null;

  const operatorRows = await supabaseFetch([
    `operator_profiles?id=eq.${encodeURIComponent(session.operator_profile_id)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const operator = Array.isArray(operatorRows) ? operatorRows[0] : null;
  if (!isActiveOperator(operator)) return null;

  supabaseFetch(`operator_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: now })
  }).catch(() => {});

  return { session, operator: sanitizeOperator(operator) };
}

async function updateOperatorPublicProfile(req, input) {
  const current = await getOperatorSession(req);
  if (!current?.operator?.id) {
    const error = new Error("Operator login required");
    error.statusCode = 401;
    error.code = "OPERATOR_SESSION_REQUIRED";
    throw error;
  }

  const profileInput = publicProfileInput(input);
  const patch = {
    display_name: profileInput.display_name,
    bio: profileInput.bio,
    avatar_url: profileInput.avatar_url,
    profile_image: profileInput.avatar_url,
    accent_tint: profileInput.accent_tint,
    portfolio: profileInput.portfolio,
    portfolio_url: buildPublicLinksValue(input).slice(0, 500),
    instagram_handle: profileInput.instagram_handle,
    updated_at: new Date().toISOString()
  };

  let activePatch = { ...patch };
  let rows = null;
  const droppedColumns = [];
  const maxAttempts = Object.keys(activePatch).length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      rows = await supabaseFetch(`operator_profiles?id=eq.${encodeURIComponent(current.operator.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(activePatch)
      });
      break;
    } catch (error) {
      const column = missingColumnName(error);
      if (!column || !Object.prototype.hasOwnProperty.call(activePatch, column)) throw error;
      droppedColumns.push(column);
      delete activePatch[column];
    }
  }

  if (!rows) {
    rows = await supabaseFetch(`operator_profiles?id=eq.${encodeURIComponent(current.operator.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        display_name: profileInput.display_name,
        updated_at: patch.updated_at
      })
    });
  }
  const profile = Array.isArray(rows) ? rows[0] : rows;
  const operator = sanitizeOperator({
    ...current.operator,
    ...(profile || {}),
    portfolio: Object.prototype.hasOwnProperty.call(activePatch, "portfolio") ? profileInput.portfolio : current.operator.portfolio,
    instagram_handle: Object.prototype.hasOwnProperty.call(activePatch, "instagram_handle") ? profileInput.instagram_handle : current.operator.instagram
  });
  return {
    operator,
    profile_update: {
      persisted_fields: Object.keys(activePatch).filter((key) => key !== "updated_at"),
      skipped_missing_columns: droppedColumns
    }
  };
}

async function loadOperatorProfileRow(operatorId) {
  const rows = await supabaseFetch([
    `operator_profiles?id=eq.${encodeURIComponent(operatorId)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateOperatorAvailability(req, input) {
  const current = await getOperatorSession(req);
  if (!current?.operator?.id) {
    const error = new Error("Operator login required");
    error.statusCode = 401;
    error.code = "OPERATOR_SESSION_REQUIRED";
    throw error;
  }

  const availability = normalizeOperatorAvailability(input.operator_availability || input.availability || input.status);
  const now = new Date().toISOString();
  const profile = await loadOperatorProfileRow(current.operator.id);
  const rawPayload = profile?.raw_payload && typeof profile.raw_payload === "object" ? profile.raw_payload : {};
  const rows = await supabaseFetch(`operator_profiles?id=eq.${encodeURIComponent(current.operator.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      raw_payload: {
        ...rawPayload,
        operator_availability: availability.value,
        operator_availability_label: availability.label,
        operator_availability_updated_at: now,
        operator_availability_source: "operator_os"
      },
      updated_at: now
    })
  });
  const updatedProfile = Array.isArray(rows) ? rows[0] : rows;
  return {
    operator: sanitizeOperator(updatedProfile || { ...profile, raw_payload: rawPayload }),
    availability,
    updated_at: now
  };
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
      if (!column || !Object.prototype.hasOwnProperty.call(activePayload, column)) throw error;
      droppedColumns.push(column);
      delete activePayload[column];
    }
  }
  const error = new Error("Operator message could not be stored");
  error.statusCode = 500;
  error.code = "OPERATOR_RUNTIME_ACTIVITY_INSERT_FAILED";
  throw error;
}

function operatorSupportWebhookUrls() {
  return getWebhookUrls([
    "OPERATOR_SUPPORT_TELEGRAM_WEBHOOK_URL",
    "OPERATOR_RUNTIME_TELEGRAM_WEBHOOK_URL",
    "DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL"
  ]);
}

async function notifyOperatorSupport({ operator, message, taskReference, messageType, createdAt }) {
  const handle = operator?.handle ? `@${operator.handle}` : "@operator";
  const text = [
    "🟣 OPERATOR SUPPORT REQUEST",
    "",
    `Operator: ${handle}`,
    `Task: ${taskReference || "Not attached"}`,
    `Type: ${messageType || "support"}`,
    "",
    "Message:",
    message || "No message provided.",
    "",
    `Submitted: ${createdAt}`
  ].join("\n");

  const result = await dispatchWebhook({
    tag: "[OPERATOR_SUPPORT_TELEGRAM]",
    event: "operator_support_request",
    urls: operatorSupportWebhookUrls(),
    payload: {
      event: "operator_support_request",
      email_type: "operator_support_request",
      operator_slug: operator?.handle || "",
      operator_handle: operator?.handle || "",
      operator_name: operator?.display_name || operator?.name || "",
      operator_email: operator?.email || "",
      task_reference: taskReference || "",
      task_id: taskReference || "",
      message_type: messageType || "support",
      message,
      telegram_message: text,
      text,
      created_at: createdAt
    },
    timeoutMs: OPERATOR_NOTIFY_TIMEOUT_MS
  });

  return {
    configured: result.attempted > 0,
    delivered: result.fulfilled > 0,
    attempted: result.attempted,
    fulfilled: result.fulfilled
  };
}

async function createOperatorHqMessage(req, input) {
  const current = await getOperatorSession(req);
  if (!current?.operator?.id) {
    const error = new Error("Operator login required");
    error.statusCode = 401;
    error.code = "OPERATOR_SESSION_REQUIRED";
    throw error;
  }

  const message = clean(input.message || input.body || input.note).slice(0, 2000);
  const taskReference = clean(input.task_reference || input.don_reference || input.task_id || input.reference).toUpperCase().slice(0, 80);
  const messageType = clean(input.message_type || input.intent || "support").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) || "support";
  if (!message) {
    const error = new Error("Enter a message for HQ.");
    error.statusCode = 400;
    error.code = "OPERATOR_MESSAGE_REQUIRED";
    throw error;
  }

  const now = new Date().toISOString();
  const title = messageType === "support" || messageType === "operator_support_request"
    ? "Operator support request"
    : "Operator message";
  const rawPayload = {
    operator_slug: current.operator.handle || "",
    operator_email: current.operator.email || "",
    task_reference: taskReference,
    task_id: taskReference,
    sender_role: "operator",
    message_type: messageType,
    unread_for_admin: true,
    sent_at: now
  };
  const insert = await insertOperatorRuntimeActivity({
    operator_profile_id: current.operator.id,
    operator_handle: current.operator.handle || "",
    activity_type: messageType === "support" ? "operator_support_request" : messageType,
    title,
    body: message,
    message,
    detail: message,
    actor_role: "operator",
    sender_role: "operator",
    task_id: taskReference,
    task_reference: taskReference,
    don_reference: taskReference,
    unread_for_admin: true,
    unread_for_operator: false,
    raw_payload: rawPayload,
    created_at: now,
    updated_at: now
  });
  const telegram = (messageType === "support" || messageType === "operator_support_request")
    ? await notifyOperatorSupport({
      operator: current.operator,
      message,
      taskReference,
      messageType,
      createdAt: now
    }).catch((error) => ({
      configured: false,
      delivered: false,
      error: error.message || "OPERATOR_SUPPORT_TELEGRAM_FAILED"
    }))
    : null;

  return {
    message: insert.row,
    persisted_fields: insert.persisted_fields,
    skipped_missing_columns: insert.skipped_missing_columns,
    telegram
  };
}

async function accessOperatorWithKey(res, input) {
  const identifier = input.identifier || input.email || input.username;
  const accessKey = normalizeAccessKey(input.access_key || input.accessKey);
  const normalizedIdentifier = normalizeLoginIdentifier(identifier);
  if (!normalizedIdentifier.email && !normalizedIdentifier.handle) {
    const error = new Error("Operator access not recognized.");
    error.statusCode = 400;
    error.code = "OPERATOR_ACCESS_NOT_RECOGNIZED";
    throw error;
  }
  if (!accessKey) {
    const error = new Error("Invalid access credentials.");
    error.statusCode = 400;
    error.code = "OPERATOR_ACCESS_KEY_REQUIRED";
    throw error;
  }

  const operator = await findOperatorByIdentifier(identifier);
  if (!isActiveOperator(operator)) {
    const error = new Error("Operator access not recognized.");
    error.statusCode = 401;
    error.code = "OPERATOR_ACCESS_NOT_RECOGNIZED";
    throw error;
  }
  if (normalizeAccessKey(operator.access_key) !== accessKey) {
    const error = new Error("Access key mismatch.");
    error.statusCode = 401;
    error.code = "OPERATOR_ACCESS_KEY_MISMATCH";
    throw error;
  }

  return createOperatorSession(res, operator);
}

async function accessOperatorWithGoogle(res, input) {
  const user = await verifySupabaseAccessToken(input.access_token || input.accessToken);
  const email = clean(user?.email).toLowerCase();
  if (!email) {
    const error = new Error("Google account email could not be verified");
    error.statusCode = 401;
    throw error;
  }

  const operator = await findOperatorByEmail(email);
  if (!isActiveOperator(operator)) {
    const error = new Error("No active operator access found for this account.");
    error.statusCode = 404;
    throw error;
  }

  return createOperatorSession(res, operator);
}

async function upsertCanonicalOperatorProfile({ name, email, role, skills, rawPayload, googleUser }) {
  const handle = normalizeOperatorHandle(rawPayload.handle || rawPayload.username || handleFromEmail(email));
  const displayName = clean(rawPayload.display_name || rawPayload.displayName || name);
  const legalName = clean(rawPayload.legal_name || rawPayload.legalName);
  const canonicalPayload = {
    email,
    handle,
    username: handle,
    full_name: displayName,
    display_name: displayName,
    legal_name: legalName || null,
    role_type: role,
    skills,
    location: rawPayload.country,
    birthdate: rawPayload.birthdate || null,
    payout_email: rawPayload.payout_email,
    timezone: rawPayload.timezone,
    tools: splitList(rawPayload.tools),
    availability: rawPayload.availability,
    portfolio_url: rawPayload.portfolio,
    bio: clean(rawPayload.bio),
    notes: rawPayload.notes,
    avatar_url: clean(rawPayload.avatar_url || rawPayload.profile_image),
    profile_image: rawPayload.profile_image,
    accent_tint: clean(rawPayload.accent_tint),
    onboarding_method: rawPayload.signup_method,
    google_account: googleUser ? {
      id: googleUser.id || null,
      email: googleUser.email || email,
      locale: rawPayload.locale || "",
      provider: "google"
    } : {},
    status: "pending",
    updated_at: new Date().toISOString()
  };

  try {
    const profile = await upsertOperatorProfile(canonicalPayload);
    upsertOperatorProfile({
      email,
      display_name: displayName,
      role,
      specialties: skills
    }).catch(() => {});
    return profile;
  } catch (error) {
    const legacyPayload = {
      email,
      display_name: displayName,
      full_name: displayName,
      username: handle,
      role,
      specialties: skills,
      tools: splitList(rawPayload.tools),
      timezone: rawPayload.timezone,
      status: "pending",
      updated_at: new Date().toISOString()
    };
    return upsertOperatorProfile(legacyPayload).catch(() => null);
  }
}

async function createOperatorApplicationSnapshot({ profile, email, rawPayload }) {
  try {
    const rows = await supabaseFetch("operator_applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        operator_profile_id: profile?.id || null,
        email,
        approval_state: "pending",
        submitted_payload: rawPayload
      })
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    return null;
  }
}

async function upsertOperatorApplicationRecord({ name, email, status = "pending", rawPayload }) {
  const existing = await supabaseFetch(`portal_requests?source=eq.operator_apply&email=eq.${encodeURIComponent(email)}&select=*&limit=1`)
    .then((rows) => Array.isArray(rows) ? rows[0] : null)
    .catch(() => null);

  const payload = {
    name,
    email,
    status,
    source: "operator_apply",
    signup_method: rawPayload.signup_method || "operator_apply",
    marketing_consent: false,
    company: Array.isArray(rawPayload.skills) ? rawPayload.skills.join(", ") : "",
    raw_payload: rawPayload,
    updated_at: new Date().toISOString()
  };

  if (existing?.id) {
    const rows = await supabaseFetch(`portal_requests?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  const rows = await supabaseFetch("portal_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...payload,
      created_at: new Date().toISOString()
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function getOperatorNotificationUrls() {
  return getWebhookUrls([
    "OPERATOR_APPLY_WEBHOOK_URL",
    "OPERATOR_APPLY_EMAIL_WEBHOOK_URL",
    "OPERATOR_APPLY_TELEGRAM_WEBHOOK_URL"
  ], [OPERATOR_APPLY_WEBHOOK_URL]);
}

function buildOperatorApplyPayload(application = {}) {
  const createdAt = nullable(application.created_at) || new Date().toISOString();
  const name = nullable(application.name);
  const role = nullable(application.role_type || application.role);
  const location = nullable(application.location || application.country);
  const payload = {
    event: "operator_application_submitted",
    event_type: "operator_apply",
    type: "operator_application",
    workflow_version: OPERATOR_WORKFLOW_VERSION,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    operator_id: nullable(application.operator_id || application.profile_id),
    application_id: nullable(application.application_id || application.application_snapshot_id),
    name,
    display_name: name,
    handle: nullable(application.handle || application.username),
    username: nullable(application.handle || application.username),
    email: nullable(application.email),
    role,
    role_type: role,
    location,
    country: location,
    timezone: nullable(application.timezone),
    portfolio: nullable(application.portfolio || application.portfolio_url),
    login_url: OPERATOR_LOGIN_URL,
    created_at: createdAt,
    approved_at: nullable(application.approved_at),
    review_url: OPERATOR_REVIEW_URL,
    admin_review_url: OPERATOR_REVIEW_URL,
    skills: Array.isArray(application.skills) ? application.skills : splitList(application.skills)
  };

  payload.createdAt = payload.created_at;
  payload.adminReviewUrl = payload.review_url;
  payload.telegram_message = [
    "NEW OPERATOR APPLICATION",
    "",
    `Display: ${payload.display_name || "Unknown"}`,
    `Handle: ${payload.handle ? `@${payload.handle}` : "Not provided"}`,
    `Email: ${payload.email || "Not provided"}`,
    `Role: ${payload.role || "Not specified"}`,
    `Location: ${payload.location || "Not specified"}`,
    `Timezone: ${payload.timezone || "Not specified"}`,
    `Portfolio: ${payload.portfolio || "None"}`,
    "",
    `Submitted: ${payload.created_at}`,
    `Review: ${payload.review_url}`
  ].join("\n");
  return payload;
}

async function notifyOperatorApplication(application) {
  const payload = buildOperatorApplyPayload(application);
  return dispatchWebhook({
    tag: "[OPERATOR_APPLY_WEBHOOK]",
    event: payload.event,
    urls: getOperatorNotificationUrls(),
    payload,
    timeoutMs: OPERATOR_NOTIFY_TIMEOUT_MS
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  let requestedAction = "";
  try {
    const input = await parseBody(req);
    const action = clean(input.action);
    requestedAction = action;

    if (action === "operator_session") {
      const result = await getOperatorSession(req);
      if (!result) {
        return send(res, 401, {
          success: false,
          status: "private",
          error: "Operator login required",
          code: "OPERATOR_SESSION_REQUIRED"
        });
      }
      return send(res, 200, { success: true, operator: result.operator, redirectTo: operatorHandleUrl(result.operator) });
    }

    if (action === "operator_profile_update") {
      const result = await updateOperatorPublicProfile(req, input);
      return send(res, 200, { success: true, ...result });
    }

    if (action === "operator_availability_update") {
      const result = await updateOperatorAvailability(req, input);
      return send(res, 200, { success: true, ...result });
    }

    if (action === "operator_hq_message") {
      const result = await createOperatorHqMessage(req, input);
      return send(res, 200, { success: true, ...result });
    }

    if (action === "operator_runtime") {
      const result = await loadOperatorRuntime(req, input.handle || input.username);
      return send(res, 200, result);
    }

    if (action === "operator_access") {
      const result = await accessOperatorWithKey(res, input);
      return send(res, 200, { success: true, authMethod: "access_key", ...result, redirectTo: operatorHandleUrl(result.operator) });
    }

    if (action === "google_operator_access") {
      const result = await accessOperatorWithGoogle(res, input);
      return send(res, 200, { success: true, authMethod: "google", ...result, redirectTo: operatorHandleUrl(result.operator) });
    }

    if (action === "operator_logout") {
      clearOperatorCookie(res);
      return send(res, 200, { success: true, redirectTo: "/" });
    }

    const googleUser = await verifySupabaseAccessToken(input.google_access_token || input.googleAccessToken);
    const googleMeta = googleUser?.user_metadata || {};
    const name = clean(googleMeta.full_name || googleMeta.name || input.name || input.display_name || input.displayName);
    const email = clean(googleUser?.email || input.email).toLowerCase();
    const role = clean(input.role || input.role_type || input.roleType);
    const country = clean(input.country || input.location);
    const birthdate = clean(input.birthdate || input.birth_date || input.birthDate);
    const payoutEmail = clean(input.payout_email || input.payoutEmail).toLowerCase();
    const skills = splitList(input.skills);
    if (!name || !isValidEmail(email)) {
      return send(res, 400, { success: false, error: "Please enter a valid email address." });
    }
    if (!skills.length || !role || !country || !birthdate || !isValidEmail(payoutEmail)) {
      return send(res, 400, {
        success: false,
        error: "Complete the required operator fields.",
        code: "OPERATOR_REQUIRED_FIELDS"
      });
    }
    const requestedHandle = clean(input.handle || input.username);
    const operatorHandle = normalizeOperatorHandle(requestedHandle);
    if (!requestedHandle) {
      return send(res, 400, {
        success: false,
        error: "Choose your operator handle.",
        code: "OPERATOR_HANDLE_REQUIRED"
      });
    }
    if (!operatorHandle) {
      const reservedHandle = normalizeUsername(requestedHandle);
      return send(res, 400, {
        success: false,
        error: RESERVED_OPERATOR_HANDLES.has(reservedHandle)
          ? "That handle is reserved. Choose another identity."
          : "Choose a valid operator handle.",
        code: RESERVED_OPERATOR_HANDLES.has(reservedHandle) ? "RESERVED_OPERATOR_HANDLE" : "INVALID_OPERATOR_HANDLE"
      });
    }
    if (await operatorHandleClaimed(operatorHandle, email)) {
      return send(res, 409, {
        success: false,
        error: "That operator handle is already claimed.",
        code: "OPERATOR_HANDLE_CLAIMED"
      });
    }

    const payload = {
      name,
      email,
      status: "pending",
      skills,
      updated_at: new Date().toISOString()
    };
    const rawPayload = {
      source: "operator_apply",
      signup_method: googleUser ? "google_operator_apply" : "operator_apply",
      name,
      display_name: clean(input.display_name || input.displayName || name),
      legal_name: clean(input.legal_name || input.legalName),
      email,
      skills,
      handle: operatorHandle,
      username: operatorHandle,
      role,
      tools: clean(input.tools),
      timezone: clean(input.timezone),
      availability: clean(input.availability),
      bio: clean(input.bio),
      portfolio: clean(input.portfolio),
      country,
      birthdate,
      payout_email: payoutEmail,
      avatar_url: clean(input.avatar_url || input.avatarUrl || input.profile_image || input.profileImage || googleMeta.avatar_url || googleMeta.picture),
      profile_image: clean(input.profile_image || input.profileImage || googleMeta.avatar_url || googleMeta.picture),
      accent_tint: clean(input.accent_tint || input.accentTint),
      locale: googleMeta.locale || "",
      google_provider_id: googleUser?.id || null,
      notes: clean(input.notes)
    };

    const profile = await upsertCanonicalOperatorProfile({ name, email, role, skills, rawPayload, googleUser });
    const applicationSnapshot = await createOperatorApplicationSnapshot({ profile, email, rawPayload });
    const applicationRecord = await upsertOperatorApplicationRecord({ name, email, status: "pending", rawPayload }).catch(() => null);

    try {
      const rows = await supabaseFetch("operators?on_conflict=email", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload)
      });
      const operator = Array.isArray(rows) ? rows[0] : rows;
      if (operator?.id && profile?.id) {
        syncOperatorProfile({
          ...operator,
          handle: rawPayload.handle,
          handle_normalized: rawPayload.handle,
          username: rawPayload.handle,
          display_name: rawPayload.display_name,
          full_name: rawPayload.display_name,
          role_type: role,
          skills,
          timezone: rawPayload.timezone,
          status: operator.status || "pending"
        }).catch(() => {});
      }
      const webhookResult = await notifyOperatorApplication({
        operator_id: profile?.id || operator?.id || null,
        application_id: applicationSnapshot?.id || applicationRecord?.id || null,
        name,
        username: rawPayload.handle,
        email,
        role_type: role,
        skills,
        location: country,
        timezone: rawPayload.timezone,
        portfolio: rawPayload.portfolio,
        created_at: applicationRecord?.created_at || new Date().toISOString()
      }).catch((error) => {
        console.error("[WEBHOOK_ERROR]", {
          tag: "[OPERATOR_APPLY_WEBHOOK]",
          event: "operator_application_submitted",
          message: error.message
        });
        return { attempted: 0, fulfilled: 0, rejected: 1, error: error.message };
      });
      return send(res, 200, buildApplicationResponse({
        operator,
        profile,
        applicationRecord,
        applicationSnapshot,
        webhookResult,
        rawPayload,
        email,
        name
      }));
    } catch (error) {
      const webhookResult = await notifyOperatorApplication({
        operator_id: profile?.id || applicationRecord?.id || null,
        application_id: applicationSnapshot?.id || applicationRecord?.id || null,
        name,
        username: rawPayload.handle,
        email,
        role_type: role,
        skills,
        location: country,
        timezone: rawPayload.timezone,
        portfolio: rawPayload.portfolio,
        created_at: applicationRecord?.created_at || new Date().toISOString()
      }).catch((notificationError) => {
        console.error("[WEBHOOK_ERROR]", {
          tag: "[OPERATOR_APPLY_WEBHOOK]",
          event: "operator_application_submitted",
          message: notificationError.message
        });
        return { attempted: 0, fulfilled: 0, rejected: 1, error: notificationError.message };
      });
      return send(res, 200, buildApplicationResponse({
        operator: applicationRecord,
        profile,
        applicationRecord,
        applicationSnapshot,
        webhookResult,
        fallback: true,
        rawPayload,
        email,
        name
      }));
    }
  } catch (error) {
    const isOperatorSessionAction = [
      "operator_runtime",
      "operator_session",
      "operator_profile_update",
      "operator_access",
      "google_operator_access",
      "operator_logout"
    ].includes(requestedAction);
    if (isOperatorSessionAction) {
      const publicError = /^Supabase request failed/i.test(error.message || "")
        ? "Invalid access credentials."
        : error.message;
      return send(res, error.statusCode || 500, {
        success: false,
        error: error.statusCode && error.statusCode < 500 ? publicError : "Could not verify operator access",
        code: error.code || "OPERATOR_ACCESS_FAILED"
      });
    }
    const publicError = error.statusCode && error.statusCode < 500
      ? error.message
      : "Could not submit operator application";
    return send(res, error.statusCode || 500, {
      success: false,
      error: publicError,
      code: error.code || "OPERATOR_APPLY_FAILED"
    });
  }
};
