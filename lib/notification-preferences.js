const { clean, dispatchWebhook, supabaseFetch } = require("./ops");

const NOTIFICATION_TIMEOUT_MS = 8_000;

const CRM_NOTIFICATION_PREFERENCE_SQL = `
alter table public.crm_contacts
add column if not exists phone_number text,
add column if not exists preferred_notification_channel text;
`;

function normalizeChannel(value) {
  const channel = clean(value).toLowerCase();
  return ["email", "whatsapp", "sms"].includes(channel) ? channel : "";
}

function normalizePhone(value) {
  return clean(value).replace(/[^\d+().\-\s]/g, "").slice(0, 40);
}

function isValidPhone(value) {
  return /[0-9]{6,}/.test(String(value || "").replace(/\D/g, ""));
}

function isMissingOptionalColumn(error, column) {
  const detail = `${error?.message || ""} ${error?.detail || ""}`.toLowerCase();
  return detail.includes(column.toLowerCase()) &&
    (detail.includes("schema cache") || detail.includes("column") || detail.includes("could not find"));
}

async function notifyOperations(payload) {
  const webhookUrl = clean(process.env.TASK_SUBMIT_WEBHOOK_URL);
  if (!webhookUrl) {
    return {
      configured: false,
      delivered: false,
      reason: "TASK_SUBMIT_WEBHOOK_URL_NOT_CONFIGURED"
    };
  }

  const result = await dispatchWebhook({
    tag: "[NOTIFICATION_PREFERENCE]",
    event: payload.event,
    urls: [webhookUrl],
    payload,
    timeoutMs: NOTIFICATION_TIMEOUT_MS
  });

  const delivered = result.fulfilled > 0;
  return {
    configured: result.attempted > 0,
    delivered,
    reason: delivered ? "delivered" : "failed",
    status: result
  };
}

async function persistPreference({ email, phoneNumber, preferredChannel, taskId, reviewState, submittedAt }) {
  const normalizedEmail = clean(email).toLowerCase();
  if (!normalizedEmail) {
    return {
      attempted: false,
      saved: false,
      reason: "email_not_available"
    };
  }

  const row = {
    email: normalizedEmail,
    source: "review_notification_preferences",
    last_source: "review_notification_preferences",
    phone_number: phoneNumber,
    preferred_notification_channel: preferredChannel,
    updated_at: submittedAt,
    raw_payload: {
      task_id: taskId,
      preferred_channel: preferredChannel,
      phone_number: phoneNumber,
      page: "review",
      source: "review_notification_preferences",
      review_state: reviewState,
      submitted_at: submittedAt
    }
  };

  try {
    await supabaseFetch("crm_contacts?on_conflict=email", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(row)
    });
    return {
      attempted: true,
      saved: true,
      provider: "crm_contacts"
    };
  } catch (error) {
    if (isMissingOptionalColumn(error, "phone_number") || isMissingOptionalColumn(error, "preferred_notification_channel")) {
      const fallbackRow = {
        email: normalizedEmail,
        source: "review_notification_preferences",
        last_source: "review_notification_preferences",
        updated_at: submittedAt,
        raw_payload: {
          ...row.raw_payload,
          phone_channel_columns_missing: true
        }
      };

      try {
        await supabaseFetch("crm_contacts?on_conflict=email", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          body: JSON.stringify(fallbackRow)
        });
        return {
          attempted: true,
          saved: true,
          provider: "crm_contacts.raw_payload",
          migrationRequired: true,
          sql: CRM_NOTIFICATION_PREFERENCE_SQL.trim()
        };
      } catch (fallbackError) {
        console.warn(`Notification preference raw payload persistence warning: ${fallbackError.message}`);
      }

      return {
        attempted: true,
        saved: false,
        reason: "crm_contacts_columns_missing",
        migrationRequired: true,
        sql: CRM_NOTIFICATION_PREFERENCE_SQL.trim()
      };
    }

    console.warn(`Notification preference persistence warning: ${error.message}`);
    return {
      attempted: true,
      saved: false,
      reason: "storage_unavailable"
    };
  }
}

async function handleNotificationPreference(input = {}) {
  const preferredChannel = normalizeChannel(input.preferred_channel || input.preferredChannel);
  const taskId = clean(input.task_id || input.taskId).slice(0, 80);
  const reviewState = clean(input.review_state || input.reviewState || input.state).slice(0, 80);
  const phoneNumber = normalizePhone(input.phone_number || input.phoneNumber);
  const submittedAt = clean(input.submitted_at || input.submittedAt) || new Date().toISOString();
  const email = clean(input.email || input.client_email || input.clientEmail).toLowerCase();

  if (!taskId) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        error: "task_id required",
        code: "TASK_ID_REQUIRED"
      }
    };
  }

  if (!preferredChannel) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        error: "preferred_channel required",
        code: "PREFERRED_CHANNEL_REQUIRED"
      }
    };
  }

  if (["whatsapp", "sms"].includes(preferredChannel) && !isValidPhone(phoneNumber)) {
    return {
      statusCode: 400,
      payload: {
        success: false,
        error: "Valid phone number required",
        code: "PHONE_NUMBER_REQUIRED"
      }
    };
  }

  const payload = {
    event: "notification_preference_requested",
    notification_type: "notification_preference",
    message: "Notification preference requested",
    task_id: taskId,
    taskId,
    preferred_channel: preferredChannel,
    phone_number: phoneNumber,
    page: "review",
    source: "review_notification_preferences",
    review_state: reviewState,
    submitted_at: submittedAt,
    timestamp: submittedAt
  };

  const storage = await persistPreference({
    email,
    phoneNumber,
    preferredChannel,
    taskId,
    reviewState,
    submittedAt
  });

  let notification;
  try {
    notification = await notifyOperations(payload);
  } catch (error) {
    console.warn(`Notification preference webhook warning: ${error.message}`);
    notification = {
      configured: true,
      delivered: false,
      reason: "failed",
      error: "NOTIFICATION_PREFERENCE_WEBHOOK_FAILED"
    };
  }

  return {
    statusCode: 200,
    payload: {
      success: true,
      preference: {
        task_id: taskId,
        preferred_channel: preferredChannel,
        phone_number: phoneNumber,
        submitted_at: submittedAt
      },
      notification,
      storage
    }
  };
}

module.exports = {
  CRM_NOTIFICATION_PREFERENCE_SQL,
  handleNotificationPreference
};
