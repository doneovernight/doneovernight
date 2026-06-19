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

function normalizeReferralSlug(value = "") {
  return clean(value)
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function getReferralAttribution(input = {}, now = new Date().toISOString()) {
  const raw = input.raw_payload && typeof input.raw_payload === "object" ? input.raw_payload : {};
  const value = clean(
    input.referral_workspace_slug ||
    input.referred_by_client ||
    input.referral_task_id ||
    input.referred_by_task_id ||
    input.ref ||
    input.referral ||
    raw.referral_workspace_slug ||
    raw.referred_by_client ||
    raw.referral_task_id ||
    raw.referred_by_task_id ||
    raw.ref ||
    raw.referral
  );
  if (!value) return {};
  const taskMatch = value.match(/\bDON-\d{4}-\d{3,8}\b/i);
  const taskId = taskMatch ? taskMatch[0].toUpperCase() : "";
  const workspaceSlug = taskId ? "" : normalizeReferralSlug(value);
  if (!taskId && !workspaceSlug) return {};
  const referralUrl = clean(input.referral_url || raw.referral_url) ||
    (workspaceSlug ? `https://ask.doneovernight.com?ref=${encodeURIComponent(workspaceSlug)}` : `https://ask.doneovernight.com/?ref=${encodeURIComponent(taskId)}`);
  return {
    ...(taskId ? {
      referral_task_id: taskId,
      referred_by_task_id: taskId
    } : {}),
    ...(workspaceSlug ? {
      referral_workspace_slug: workspaceSlug,
      referred_by_client: workspaceSlug
    } : {}),
    referral_source: clean(input.referral_source || raw.referral_source) || (workspaceSlug ? "workspace_referral" : "referral_email"),
    referral_url: referralUrl,
    referral_created_at: clean(input.referral_created_at || raw.referral_created_at) || now,
    referral_submitted_at: clean(input.referral_submitted_at || raw.referral_submitted_at) || now
  };
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
  return getWebhookUrls([
    "DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL"
  ]);
}

function getDispatchTelegramConfig() {
  const config = {
    provider: "doneovernight_ops_bot_api",
    botToken: clean(process.env.DONEOVERNIGHT_OPS_BOT_TOKEN),
    chatId: clean(process.env.DONEOVERNIGHT_OPS_CHAT_ID),
    tokenEnv: "DONEOVERNIGHT_OPS_BOT_TOKEN",
    chatEnv: "DONEOVERNIGHT_OPS_CHAT_ID"
  };

  return config.botToken && config.chatId ? config : {
    provider: "none",
    botToken: "",
    chatId: "",
    reason: "No Dispatch/Ops Telegram bot env configured",
    supportedEnv: [[config.tokenEnv, config.chatEnv]]
  };
}

function dispatchRouteMetadata(overrides = {}) {
  return {
    destinationType: "not_configured",
    chatEnvUsed: null,
    tokenEnvUsed: null,
    webhookEnvUsed: null,
    ...overrides
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
  const telegramConfigured = Boolean(telegramConfig.botToken && telegramConfig.chatId);
  let telegramStatus = {
    sent: false,
    status: "Not configured",
    provider: telegramConfig.provider || "none",
    reason: telegramConfig.reason || "No Dispatch/Ops Telegram bot env configured"
  };

  if (telegramConfigured) {
    const telegram = await sendTelegramMessage({
      botToken: telegramConfig.botToken,
      chatId: telegramConfig.chatId,
      text: telegramMessage
    });
    const delivered = telegram.sent === true;
    telegramStatus = {
      ...telegram,
      routingProvider: telegramConfig.provider
    };

    if (delivered) {
      return {
        configured: true,
        delivered: true,
        reason: "delivered",
        provider: "telegram_bot",
        ...dispatchRouteMetadata({
          destinationType: "ops_bot",
          chatEnvUsed: telegramConfig.chatEnv,
          tokenEnvUsed: telegramConfig.tokenEnv
        }),
        status: {
          webhook: {
            tag: "[DISPATCH_NOTIFICATION]",
            event: payload.event,
            attempted: 0,
            fulfilled: 0,
            rejected: 0
          },
          telegram: telegramStatus
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
      reason: "delivered",
      provider: "webhook",
      ...dispatchRouteMetadata({
        destinationType: "ops_webhook",
        webhookEnvUsed: "DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL"
      }),
      status: {
        webhook: result,
        telegram: telegramStatus
      }
    };
  }

  return {
    configured: telegramConfigured || result.attempted > 0,
    delivered: false,
    reason: result.attempted || telegramConfigured ? "failed" : telegramConfig.reason || "not_configured",
    provider: "none",
    ...dispatchRouteMetadata(result.attempted > 0
      ? {
        destinationType: "ops_webhook",
        webhookEnvUsed: "DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL"
      }
      : {}),
    status: {
      webhook: result,
      telegram: telegramStatus
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
  const referralAttribution = getReferralAttribution(input, now);
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
      segment,
      ...referralAttribution
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
