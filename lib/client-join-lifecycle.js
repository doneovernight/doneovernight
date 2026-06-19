const { clean, dispatchWebhook, getWebhookUrls, slugify, supabaseFetch } = require("./ops");
const { sendClientWelcomeEmail } = require("./email/client-welcome-email");

const CLIENT_JOIN_TIMEOUT_MS = 8_000;

function rawPayloadOf(record = {}) {
  return record.raw_payload && typeof record.raw_payload === "object" ? record.raw_payload : {};
}

function normalizeSource(value = "") {
  const normalized = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    ask: "ask_intake",
    ask_intake: "ask_intake",
    homepage_intake: "ask_intake",
    homepage_intake_v1: "ask_intake",
    start: "start_intake",
    start_intake: "start_intake",
    client: "client_onboarding",
    client_onboarding: "client_onboarding",
    project_preview: "client_onboarding",
    google: "google_onboarding",
    google_onboarding: "google_onboarding",
    operator_google: "operator_google_signin",
    operator_google_signin: "operator_google_signin",
    operator_referral: "operator_referral",
    operator_onboarding: "operator_referral",
    operator_existing_account: "operator_existing_account",
    portal: "portal_signin",
    portal_signin: "portal_signin",
    payment_activation: "ask_intake",
    workspace_activation: "ask_intake",
    payment_confirmation: "ask_intake",
    direct: "direct"
  };
  return aliases[normalized] || normalized || "direct";
}

function workspaceSlugOf(record = {}, fallback = "") {
  const raw = rawPayloadOf(record);
  return slugify(record.workspace_slug || record.username || record.slug || raw.workspace_slug || fallback);
}

function workspaceUrlFor(slug = "", explicit = "") {
  const url = clean(explicit);
  if (url) return url;
  const normalized = slugify(slug);
  return normalized ? `https://portal.doneovernight.com/@${normalized}` : "";
}

function joinSourceLabel(source = "") {
  return normalizeSource(source).replace(/_/g, " ");
}

function telegramText({ operatorSlug = "", clientName = "", clientEmail = "", workspaceSlug = "", source = "", workspaceUrl = "", donReference = "" } = {}) {
  const client = [clientName || "New client", clientEmail].filter(Boolean).join(" / ");
  const lines = operatorSlug
    ? [
        "🟢 NEW OPERATOR CLIENT JOINED",
        `Operator: @${operatorSlug}`,
        `Client: ${client}`,
        workspaceSlug ? `Workspace: @${workspaceSlug}` : "",
        donReference ? `Task: ${donReference}` : "",
        `Source: ${joinSourceLabel(source)}`,
        workspaceUrl ? `Workspace URL: ${workspaceUrl}` : ""
      ]
    : [
        "🟢 NEW CLIENT JOINED",
        `Client: ${client}`,
        workspaceSlug ? `Workspace: @${workspaceSlug}` : "",
        donReference ? `Task: ${donReference}` : "",
        `Source: ${joinSourceLabel(source)}`,
        workspaceUrl ? `Workspace URL: ${workspaceUrl}` : ""
      ];
  return lines.filter(Boolean).join("\n");
}

async function sendClientJoinTelegram(input = {}) {
  const source = normalizeSource(input.source);
  const operatorSlug = clean(input.operator_slug || input.operatorSlug).replace(/^@+/, "");
  const workspaceSlug = slugify(input.workspace_slug || input.workspaceSlug);
  const workspaceUrl = workspaceUrlFor(workspaceSlug, input.workspace_url || input.workspaceUrl);
  const clientName = clean(input.name || input.client_name) || "New client";
  const clientEmail = clean(input.email || input.client_email).toLowerCase();
  const donReference = clean(input.task_id || input.taskId || input.don_reference).toUpperCase();
  const text = telegramText({
    operatorSlug,
    clientName,
    clientEmail,
    workspaceSlug,
    source,
    workspaceUrl,
    donReference
  });

  const result = await dispatchWebhook({
    tag: "[CLIENT_JOIN_TELEGRAM]",
    event: operatorSlug ? "operator_client_joined" : "client_joined",
    urls: getWebhookUrls(["DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL", "OPERATOR_RUNTIME_TELEGRAM_WEBHOOK_URL"]),
    payload: {
      event: operatorSlug ? "operator_client_joined" : "client_joined",
      notification_type: operatorSlug ? "new_operator_client_joined" : "new_client_joined",
      operator_slug: operatorSlug,
      client_name: clientName,
      client_email: clientEmail,
      workspace_slug: workspaceSlug,
      workspace_url: workspaceUrl,
      task_id: donReference,
      source,
      telegram_message: text,
      text
    },
    timeoutMs: CLIENT_JOIN_TIMEOUT_MS
  });

  return {
    sent: result.fulfilled > 0,
    attempted: result.attempted,
    fulfilled: result.fulfilled,
    provider: result.attempted ? "webhook" : "none",
    status: result.fulfilled > 0 ? "sent_to_provider" : result.attempted > 0 ? "delivery_not_confirmed" : "not_configured",
    error: result.errors?.[0]?.message || ""
  };
}

async function patchPortalRequestRawPayload(portalRequest = {}, rawPayload = {}) {
  if (!portalRequest?.id) return { updated: false, reason: "missing_portal_request_id" };
  const rows = await supabaseFetch(`portal_requests?id=eq.${encodeURIComponent(portalRequest.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ raw_payload: rawPayload })
  });
  return {
    updated: true,
    portal_request: Array.isArray(rows) ? rows[0] : rows
  };
}

function sentAt(result = {}) {
  return result.sent || result.delivered ? new Date().toISOString() : "";
}

async function deliverClientJoinLifecycle(input = {}) {
  const portalRequest = input.portalRequest || input.portal_request || {};
  const raw = rawPayloadOf(portalRequest);
  const now = new Date().toISOString();
  const operator = input.operator || {};
  const operatorSlug = clean(input.operator_slug || input.operatorSlug || operator.slug || raw.operator_referral_slug || raw.referring_operator_slug).replace(/^@+/, "");
  const source = normalizeSource(input.source || raw.client_join_source || raw.source || (operatorSlug ? "operator_referral" : portalRequest.source));
  const workspaceSlug = workspaceSlugOf(portalRequest, input.workspace_slug || input.workspaceSlug);
  const explicitWorkspaceUrl = clean(input.workspace_url || input.workspaceUrl || raw.workspace_url);
  const workspaceIsActive = clean(portalRequest.status).toLowerCase() === "active" || Boolean(explicitWorkspaceUrl);
  const workspaceUrl = workspaceUrlFor(workspaceSlug, explicitWorkspaceUrl);
  const emailWorkspaceUrl = workspaceIsActive ? workspaceUrl : "";
  const donReference = clean(input.task_id || input.taskId || input.don_reference || portalRequest.intake_task_id || raw.task_id || raw.reference).toUpperCase();
  const clientEmail = clean(portalRequest.email || input.email || input.client_email).toLowerCase();
  const clientName = clean(portalRequest.name || portalRequest.company || input.name || input.client_name);

  if (!portalRequest?.id || !clientEmail) {
    return {
      skipped: true,
      reason: !portalRequest?.id ? "missing_portal_request" : "missing_client_email",
      welcomeEmail: { sent: false, status: "skipped" },
      telegram: { sent: false, status: "skipped" }
    };
  }

  let welcomeEmail = {
    sent: Boolean(raw.welcome_email_sent_at || raw.welcome_email_sent === true),
    status: raw.welcome_email_status || (raw.welcome_email_sent_at ? "already_sent" : "pending"),
    skipped: Boolean(raw.welcome_email_sent_at || raw.welcome_email_sent === true)
  };
  if (!welcomeEmail.skipped) {
    welcomeEmail = await sendClientWelcomeEmail({
      email: clientEmail,
      name: clientName,
      workspace_slug: workspaceSlug,
      workspace_url: emailWorkspaceUrl,
      workspace_status_label: emailWorkspaceUrl ? "WORKSPACE ACTIVE" : "WORKSPACE PREPARING",
      operator_slug: operatorSlug,
      source,
      task_id: donReference
    }).catch((error) => ({
      sent: false,
      delivered: false,
      provider: "none",
      reason: "request_failed",
      error: error.code || error.message || "CLIENT_WELCOME_EMAIL_FAILED"
    }));
  }

  const telegramAlreadySent = operatorSlug
    ? Boolean(raw.operator_client_join_telegram_sent_at || raw.client_join_telegram_operator_slug === operatorSlug)
    : Boolean(raw.client_join_telegram_sent_at || raw.client_join_telegram_ok === true);
  let telegram = {
    sent: telegramAlreadySent,
    status: raw.client_join_telegram_status || (telegramAlreadySent ? "already_sent" : "pending"),
    skipped: telegramAlreadySent
  };
  if (!telegram.skipped) {
    telegram = await sendClientJoinTelegram({
      email: clientEmail,
      name: clientName,
      workspace_slug: workspaceSlug,
      workspace_url: workspaceUrl,
      operator_slug: operatorSlug,
      source,
      task_id: donReference
    }).catch((error) => ({
      sent: false,
      provider: "none",
      status: "request_failed",
      error: error.code || error.message || "CLIENT_JOIN_TELEGRAM_FAILED"
    }));
  }

  const welcomeSentAt = raw.welcome_email_sent_at || sentAt(welcomeEmail);
  const telegramSentAt = raw.client_join_telegram_sent_at || sentAt(telegram);
  const nextRawPayload = {
    ...raw,
    client_join_source: source,
    client_joined_at: raw.client_joined_at || now,
    workspace_slug: workspaceSlug || raw.workspace_slug,
    workspace_url: workspaceUrl || raw.workspace_url,
    ...(operatorSlug ? {
      referral_source: raw.referral_source || "operator_referral",
      referring_operator_slug: operatorSlug,
      connected_operator_slug: raw.connected_operator_slug || operatorSlug,
      operator_referral_slug: raw.operator_referral_slug || operatorSlug
    } : {}),
    welcome_email_sent: Boolean(welcomeSentAt),
    welcome_email_sent_at: welcomeSentAt || "",
    welcome_email_status: welcomeEmail.reason || welcomeEmail.status || (welcomeEmail.sent ? "sent" : "not_sent"),
    welcome_email_provider: welcomeEmail.provider || raw.welcome_email_provider || "",
    welcome_email_error: welcomeEmail.error || "",
    client_join_telegram_sent_at: telegramSentAt || "",
    client_join_telegram_provider: telegram.provider || raw.client_join_telegram_provider || "",
    client_join_telegram_ok: Boolean(telegramSentAt),
    client_join_telegram_status: telegram.status || (telegram.sent ? "sent_to_provider" : "not_sent"),
    client_join_telegram_error: telegram.error || ""
  };
  if (operatorSlug) {
    nextRawPayload.operator_client_join_telegram_sent_at = raw.operator_client_join_telegram_sent_at || telegramSentAt || "";
    nextRawPayload.client_join_telegram_operator_slug = operatorSlug;
  }

  const patch = await patchPortalRequestRawPayload(portalRequest, nextRawPayload).catch((error) => ({
    updated: false,
    reason: error.code || error.message || "CLIENT_JOIN_METADATA_PATCH_FAILED"
  }));

  return {
    skipped: false,
    source,
    workspaceSlug,
    workspaceUrl,
    operatorSlug,
    welcomeEmail,
    telegram,
    portal_request: patch.portal_request || null,
    metadata_updated: patch.updated === true,
    metadata_warning: patch.updated ? "" : patch.reason
  };
}

module.exports = {
  deliverClientJoinLifecycle,
  normalizeClientJoinSource: normalizeSource,
  sendClientJoinTelegram
};
