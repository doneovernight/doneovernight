const { clean, dispatchWebhook, getWebhookUrls, supabaseFetch } = require("./ops");
const { sendTelegramMessage } = require("../heartbeat/telegram");

const DISPATCH_TIMEOUT_MS = 8_000;

const CRM_CONTACTS_SQL = `
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  last_source text,
  page_hostname text,
  segment text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  dispatch_subscribed boolean not null default false,
  dispatch_subscribed_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_email_idx on public.crm_contacts (email);
create index if not exists crm_contacts_dispatch_subscribed_idx on public.crm_contacts (dispatch_subscribed);

grant usage on schema public to service_role;
grant select, insert, update on public.crm_contacts to service_role;
`;

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicSupabaseError(error) {
  const detail = `${error?.message || ""} ${error?.detail || ""}`.toLowerCase();
  const permissionDenied =
    error?.statusCode === 401 ||
    error?.statusCode === 403 ||
    detail.includes("permission denied") ||
    detail.includes("row-level security") ||
    detail.includes("rls");
  const migrationRequired =
    !permissionDenied && (
      error?.statusCode === 404 ||
      detail.includes("crm_contacts") ||
      detail.includes("schema cache") ||
      detail.includes("could not find") ||
      detail.includes("does not exist")
    );

  return {
    success: false,
    error: migrationRequired
      ? "Dispatch contact registry is not ready"
      : permissionDenied
        ? "Dispatch contact registry is not writable"
        : "Could not save Dispatch signup",
    code: migrationRequired
      ? "CRM_CONTACTS_MIGRATION_REQUIRED"
      : permissionDenied
        ? "CRM_CONTACTS_PERMISSION_DENIED"
        : "DISPATCH_SUBSCRIBE_FAILED",
    migrationRequired,
    permissionDenied,
    ...(migrationRequired || permissionDenied ? { sql: CRM_CONTACTS_SQL.trim() } : {})
  };
}

function sanitizeDispatchStatus(value) {
  if (Array.isArray(value)) return value.map(sanitizeDispatchStatus);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "urls")
    .map(([key, entry]) => [key, sanitizeDispatchStatus(entry)]));
}

function getDispatchConfirmationUrls() {
  return getWebhookUrls(["DISPATCH_CONFIRMATION_WEBHOOK_URL"]);
}

function getDispatchNotificationUrls() {
  const operatorApplyUrls = new Set(getWebhookUrls([
    "OPERATOR_APPLY_WEBHOOK_URL",
    "OPERATOR_APPLY_EMAIL_WEBHOOK_URL",
    "OPERATOR_APPLY_TELEGRAM_WEBHOOK_URL"
  ]));
  const urls = getWebhookUrls([
    "DISPATCH_NOTIFICATION_WEBHOOK_URL",
    "DISPATCH_OPERATOR_WEBHOOK_URL",
    "DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL",
    "DONEOVERNIGHT_TELEGRAM_WEBHOOK_URL"
  ]);
  const safeUrls = urls.filter((url) => !operatorApplyUrls.has(url));

  if (safeUrls.length !== urls.length) {
    console.warn("[DISPATCH_NOTIFICATION] blocked_operator_apply_webhook", {
      attempted: urls.length,
      allowed: safeUrls.length
    });
  }

  return safeUrls;
}

function getDispatchTelegramConfig() {
  const configs = [
    {
      provider: "doneovernight_bot_api",
      botToken: clean(process.env.DONEOVERNIGHT_BOT_TOKEN),
      chatId: clean(process.env.DONEOVERNIGHT_CHAT_ID),
      tokenEnv: "DONEOVERNIGHT_BOT_TOKEN",
      chatEnv: "DONEOVERNIGHT_CHAT_ID"
    },
    {
      provider: "doneovernight_shared_bot_api",
      botToken: clean(process.env.TELEGRAM_BOT_TOKEN),
      chatId: clean(process.env.DONEOVERNIGHT_CHAT_ID),
      tokenEnv: "TELEGRAM_BOT_TOKEN",
      chatEnv: "DONEOVERNIGHT_CHAT_ID"
    },
    {
      provider: "ops_bot_api",
      botToken: clean(process.env.OPS_TELEGRAM_BOT_TOKEN),
      chatId: clean(process.env.OPS_TELEGRAM_CHAT_ID),
      tokenEnv: "OPS_TELEGRAM_BOT_TOKEN",
      chatEnv: "OPS_TELEGRAM_CHAT_ID"
    }
  ];

  return configs.find((config) => config.botToken && config.chatId) || {
    provider: "none",
    botToken: "",
    chatId: "",
    reason: "No Dispatch/Ops Telegram bot env configured",
    supportedEnv: configs.map((config) => [config.tokenEnv, config.chatEnv])
  };
}

function getDispatchSource(contact) {
  const hostname = clean(contact.page_hostname).toLowerCase();
  if (hostname) return hostname;
  const segment = clean(contact.segment).toLowerCase();
  if (segment === "ask" || segment === "start") return segment;
  return segment || contact.source || "dispatch";
}

async function sendDispatchConfirmation(contact) {
  const payload = {
    event: "dispatch_confirmation",
    event_type: "dispatch_confirmation_email",
    type: "dispatch_subscribed",
    workflow_version: "dispatch_confirmation_v1",
    timestamp: contact.marketing_consent_at,
    to: contact.email,
    email: contact.email,
    client_email: contact.email,
    source: contact.source,
    page_hostname: contact.page_hostname,
    consent: true,
    marketing_consent_at: contact.marketing_consent_at,
    segment: contact.segment
  };

  const result = await dispatchWebhook({
    tag: "[DISPATCH_CONFIRMATION]",
    event: payload.event,
    urls: getDispatchConfirmationUrls(),
    payload,
    timeoutMs: DISPATCH_TIMEOUT_MS
  });

  const sent = result.fulfilled > 0;
  return {
    configured: result.attempted > 0,
    sent,
    delivered: sent,
    reason: sent ? "sent" : (result.attempted ? "failed" : "not_configured"),
    provider: result.attempted ? "webhook" : "none",
    status: result
  };
}

async function notifyDispatchSignup(contact) {
  const source = getDispatchSource(contact);
  const created = contact.dispatch_subscribed_at || contact.marketing_consent_at || new Date().toISOString();
  const telegramMessage = [
    "🟢 DISPATCH SIGNUP",
    "",
    "Email:",
    contact.email,
    "",
    "Source:",
    source,
    "",
    "Created:",
    created
  ].join("\n");
  const payload = {
    event: "dispatch_signup",
    event_type: "dispatch_notification",
    notification_type: "dispatch_signup",
    type: "dispatch_signup",
    workflow_version: "dispatch_notification_v1",
    timestamp: created,
    email: contact.email,
    client_email: contact.email,
    source,
    original_source: contact.source,
    page_hostname: contact.page_hostname,
    segment: contact.segment,
    created_at: created,
    dispatch_subscribed_at: contact.dispatch_subscribed_at,
    marketing_consent_at: contact.marketing_consent_at,
    telegram_message: telegramMessage,
    message: telegramMessage,
    raw_payload: contact.raw_payload
  };

  const telegramConfig = getDispatchTelegramConfig();
  let telegramResult = null;
  if (telegramConfig.botToken && telegramConfig.chatId) {
    telegramResult = await sendTelegramMessage({
      botToken: telegramConfig.botToken,
      chatId: telegramConfig.chatId,
      text: telegramMessage
    });
    const delivered = telegramResult.sent === true;

    if (delivered) {
      return {
        configured: true,
        delivered: true,
        reason: "delivered",
        provider: "telegram_bot",
        status: {
          webhook: {
            tag: "[DISPATCH_NOTIFICATION]",
            event: payload.event,
            attempted: 0,
            fulfilled: 0,
            rejected: 0
          },
          telegram: {
            ...telegramResult,
            routingProvider: telegramConfig.provider
          }
        }
      };
    }
  }

  const result = await dispatchWebhook({
    tag: "[DISPATCH_NOTIFICATION]",
    event: payload.event,
    urls: getDispatchNotificationUrls(),
    payload,
    timeoutMs: DISPATCH_TIMEOUT_MS
  });

  if (result.fulfilled > 0) {
    return {
      configured: true,
      delivered: true,
      reason: telegramResult?.sent === false ? "delivered_after_bot_fallback" : "delivered",
      provider: "webhook",
      status: {
        webhook: result,
        ...(telegramResult ? {
          telegram: {
            ...telegramResult,
            routingProvider: telegramConfig.provider
          }
        } : {})
      }
    };
  }

  return {
    configured: result.attempted > 0,
    delivered: false,
    reason: result.attempted ? "failed" : telegramConfig.reason || "not_configured",
    provider: "none",
    status: {
      webhook: result,
      telegram: {
        ...(telegramResult || {}),
        sent: false,
        status: telegramResult?.status || "Not configured",
        provider: telegramConfig.provider || "none",
        reason: telegramResult?.reason || telegramConfig.reason || "No Dispatch/Ops Telegram bot env configured"
      }
    }
  };
}

async function subscribeToDispatch(input = {}) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        error: "Valid email required",
        code: "INVALID_EMAIL"
      }
    };
  }

  if (input.consent !== true) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        error: "Consent required",
        code: "CONSENT_REQUIRED"
      }
    };
  }

  const now = new Date().toISOString();
  const source = clean(input.source) || "dispatch_popup";
  const pageHostname = clean(input.page_hostname || input.pageHostname);
  const segment = clean(input.segment) || "dispatch";
  const marketingConsentAt = clean(input.marketing_consent_at || input.marketingConsentAt) || now;
  const contact = {
    email,
    source,
    last_source: source,
    page_hostname: pageHostname,
    segment,
    marketing_consent: true,
    marketing_consent_at: marketingConsentAt,
    dispatch_subscribed: true,
    dispatch_subscribed_at: now,
    updated_at: now,
    raw_payload: {
      source,
      page_hostname: pageHostname,
      consent: true,
      marketing_consent_at: marketingConsentAt,
      segment
    }
  };

  let rows;
  try {
    rows = await supabaseFetch("crm_contacts?on_conflict=email", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(contact)
    });
  } catch (error) {
    console.warn("Dispatch subscribe persistence warning", {
      message: error.message,
      statusCode: error.statusCode || null,
      detail: error.detail || null
    });
    return {
      statusCode: error.statusCode === 401 || error.statusCode === 403 ? 503 : 500,
      payload: publicSupabaseError(error)
    };
  }

  let confirmation = {
    configured: false,
    sent: false,
    delivered: false,
    reason: "not_configured",
    provider: "none"
  };

  let dispatchNotification = {
    configured: false,
    delivered: false,
    reason: "not_configured",
    provider: "none"
  };

  try {
    confirmation = await sendDispatchConfirmation(contact);
  } catch (error) {
    console.warn(`Dispatch confirmation warning: ${error.message}`);
    confirmation = {
      configured: true,
      sent: false,
      delivered: false,
      reason: "failed",
      provider: "webhook",
      error: "DISPATCH_CONFIRMATION_FAILED"
    };
  }

  try {
    dispatchNotification = await notifyDispatchSignup(contact);
  } catch (error) {
    console.warn(`Dispatch notification warning: ${error.message}`);
    dispatchNotification = {
      configured: true,
      delivered: false,
      reason: "failed",
      provider: "dispatch_notification",
      error: "DISPATCH_NOTIFICATION_FAILED"
    };
  }

  return {
    statusCode: 200,
    payload: {
      success: true,
      contact: {
        id: Array.isArray(rows) && rows[0] ? rows[0].id || null : null,
        email
      },
      confirmation: sanitizeDispatchStatus(confirmation),
      dispatchNotification: sanitizeDispatchStatus(dispatchNotification)
    }
  };
}

module.exports = {
  CRM_CONTACTS_SQL,
  subscribeToDispatch
};
