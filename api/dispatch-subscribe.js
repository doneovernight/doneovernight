const { clean, dispatchWebhook, getWebhookUrls, parseBody, send, supabaseFetch } = require("../lib/ops");

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
`;

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getDispatchConfirmationUrls() {
  return getWebhookUrls(["DISPATCH_CONFIRMATION_WEBHOOK_URL"]);
}

function publicSupabaseError(error) {
  const detail = `${error?.message || ""} ${error?.detail || ""}`.toLowerCase();
  const migrationRequired =
    error?.statusCode === 404 ||
    detail.includes("crm_contacts") ||
    detail.includes("schema cache") ||
    detail.includes("could not find") ||
    detail.includes("does not exist");

  return {
    success: false,
    error: migrationRequired
      ? "Dispatch contact registry is not ready"
      : "Could not save Dispatch signup",
    code: migrationRequired ? "CRM_CONTACTS_MIGRATION_REQUIRED" : "DISPATCH_SUBSCRIBE_FAILED",
    migrationRequired,
    ...(migrationRequired ? { sql: CRM_CONTACTS_SQL.trim() } : {})
  };
}

async function sendDispatchConfirmation(contact) {
  const urls = getDispatchConfirmationUrls();
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
    urls,
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return send(res, 400, {
        success: false,
        error: "Valid email required",
        code: "INVALID_EMAIL"
      });
    }

    const now = new Date().toISOString();
    const source = clean(input.source) || "dispatch_popup";
    const pageHostname = clean(input.page_hostname || input.pageHostname);
    const segment = clean(input.segment) || "dispatch";
    const consent = input.consent === true;

    if (!consent) {
      return send(res, 400, {
        success: false,
        error: "Consent required",
        code: "CONSENT_REQUIRED"
      });
    }

    const contact = {
      email,
      source,
      last_source: source,
      page_hostname: pageHostname,
      segment,
      marketing_consent: true,
      marketing_consent_at: clean(input.marketing_consent_at || input.marketingConsentAt) || now,
      dispatch_subscribed: true,
      dispatch_subscribed_at: now,
      updated_at: now,
      raw_payload: {
        source,
        page_hostname: pageHostname,
        consent: true,
        marketing_consent_at: clean(input.marketing_consent_at || input.marketingConsentAt) || now,
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
      console.warn(`Dispatch subscribe persistence warning: ${error.message}`);
      return send(res, error.statusCode === 401 || error.statusCode === 403 ? 503 : 500, publicSupabaseError(error));
    }

    let confirmation = {
      configured: false,
      sent: false,
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

    return send(res, 200, {
      success: true,
      contact: {
        id: Array.isArray(rows) && rows[0] ? rows[0].id || null : null,
        email
      },
      confirmation
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, {
        success: false,
        error: "Invalid JSON",
        code: "INVALID_JSON"
      });
    }

    console.warn(`Dispatch subscribe error: ${error.message}`);
    return send(res, 500, {
      success: false,
      error: "Could not save Dispatch signup",
      code: "DISPATCH_SUBSCRIBE_FAILED"
    });
  }
};
