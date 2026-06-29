const { parseBody } = require("../lib/ops");
const { sendJourneyConfirmationEmail, isValidEmail } = require("../lib/email/journey-confirmation-email");

const SUPABASE_TIMEOUT_MS = 8_000;
const TABLE = "journey_confirmations";

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value = "") {
  return clean(value).toLowerCase();
}

function normalizeList(value = []) {
  return (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean);
}

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function supabaseConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    configured: Boolean(url && serviceRoleKey),
    url,
    serviceRoleKey
  };
}

function publicResult(emailResult = {}, storageResult = {}) {
  return {
    ok: emailResult.delivered === true,
    status: emailResult.delivered ? "sent" : emailResult.reason === "not_configured" ? "pending" : "failed",
    provider: emailResult.provider || "none",
    configured: emailResult.configured === true,
    delivered: emailResult.delivered === true,
    messageId: emailResult.messageId || null,
    reason: emailResult.reason || "",
    missing: emailResult.missing || [],
    storage: {
      configured: storageResult.configured === true,
      saved: storageResult.saved === true,
      status: storageResult.status || "not_attempted",
      reason: storageResult.reason || ""
    }
  };
}

function buildRecord(input = {}, emailResult = {}) {
  const delivered = emailResult.delivered === true;
  const failed = emailResult.reason && emailResult.reason !== "not_configured" && !delivered;
  return {
    email: normalizeEmail(input.email),
    social_handle: clean(input.social_handle || input.socialHandle),
    journey_id: clean(input.journey_id || input.journeyId),
    chosen_path: clean(input.chosen_path || input.chosenPath),
    chosen_interests: normalizeList(input.chosen_interests || input.chosenInterests),
    result: clean(input.result),
    source: clean(input.source) || "how_it_works",
    created_at: clean(input.created_at || input.createdAt) || new Date().toISOString(),
    status: delivered ? "sent" : failed ? "failed" : "pending",
    provider: emailResult.provider || "none",
    message_id: emailResult.messageId || null,
    error: delivered ? "" : clean(emailResult.error || emailResult.reason),
    raw_payload: {
      browser_language: clean(input.browser_language || input.browserLanguage),
      completion: input.completion ?? null,
      utm: input.utm || {},
      email_configured: emailResult.configured === true,
      email_missing: emailResult.missing || []
    }
  };
}

async function saveJourneyConfirmation(input = {}, emailResult = {}) {
  const config = supabaseConfig();
  if (!config.configured) {
    return { configured: false, saved: false, status: "not_configured", reason: "supabase_not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  const record = buildRecord(input, emailResult);

  try {
    const response = await fetch(`${config.url}/rest/v1/${TABLE}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        configured: true,
        saved: false,
        status: "failed",
        reason: text.includes(TABLE) || text.toLowerCase().includes("schema cache")
          ? "table_not_ready"
          : `supabase_${response.status}`
      };
    }

    return { configured: true, saved: true, status: "saved", reason: "" };
  } catch (error) {
    return {
      configured: true,
      saved: false,
      status: "failed",
      reason: error.name === "AbortError" ? "supabase_timeout" : "supabase_request_failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    send(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  let input;
  try {
    input = await parseBody(req);
  } catch (error) {
    send(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    send(res, 400, { ok: false, error: "invalid_email" });
    return;
  }

  const emailResult = await sendJourneyConfirmationEmail({ ...input, email });
  const storageResult = await saveJourneyConfirmation({ ...input, email }, emailResult);
  const statusCode = emailResult.delivered ? 200 : emailResult.reason === "not_configured" ? 202 : 502;

  send(res, statusCode, publicResult(emailResult, storageResult));
};
