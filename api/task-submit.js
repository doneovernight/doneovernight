const { buildTaskPayload, validateTaskInput } = require("../lib/tasks/model");
const { dispatchWebhook, getWebhookUrls } = require("../lib/ops");
const { createTaskId, saveTask, TaskPersistenceError } = require("../lib/tasks/store");
const { sendTaskConfirmationEmailViaResend } = require("../lib/email/task-confirmation");

const WEBHOOK_TIMEOUT_MS = 7_000;
const CLIENT_EMAIL_TIMEOUT_MS = 8_000;

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function notifyOperations(task) {
  const webhookUrl = process.env.TASK_SUBMIT_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      configured: false,
      delivered: false,
      reason: "TASK_SUBMIT_WEBHOOK_URL_NOT_CONFIGURED"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  const preferredLanguage =
    task.preferredLanguage ||
    task.rawPayload?.preferred_language ||
    "en";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event: "task_submitted",
        notification_type: "task_intake",
        id: task.taskId,
        task_id: task.taskId,
        taskId: task.taskId,
        task_reference: task.taskId,
        reference_id: task.taskId,
        operational_id: task.taskId,
        created_at: task.createdAt,
        createdAt: task.createdAt,
        name: task.name,
        clientName: task.name,
        client_name: task.name,
        email: task.email,
        client_email: task.email,
        company: task.company,
        deadline: task.deadline,
        priority: task.priority,
        source: task.source,
        intakeVersion: task.intakeVersion,
        intake_version: task.intakeVersion,
        preferred_language: preferredLanguage,
        lang: preferredLanguage,
        language: preferredLanguage,
        task_summary: task.taskSummary,
        task_description: task.taskSummary,
        taskSummary: task.taskSummary,
        links: task.links,
        files_link: Array.isArray(task.links) ? task.links.join("\n") : "",
        attachments: task.attachments,
        attachment_names: Array.isArray(task.attachments)
          ? task.attachments.map((attachment) => attachment.name).filter(Boolean).join(", ")
          : "",
        queue_state: task.queueState,
        queueState: task.queueState,
        review_window_estimate: task.reviewWindowEstimate,
        confirmation_email_to: task.email,
        confirmation_email_name: task.name,
        confirmation_email_required: true,
        confirmation_email_template: "task_received",
        confirmation_email_subject: "Task received | DONEOVERNIGHT",
        confirmation_email_preview: "Task received. We'll review it and reply shortly.",
        raw_payload: task.rawPayload
      })
    });

    if (!response.ok) {
      throw new Error(`Task submit webhook failed: ${response.status}`);
    }

    return {
      configured: true,
      delivered: true,
      status: response.status
    };
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getClientConfirmationEmailUrls() {
  return getWebhookUrls([
    "TASK_CONFIRMATION_EMAIL_WEBHOOK_URL",
    "TASK_CLIENT_EMAIL_WEBHOOK_URL",
    "TASK_SUBMIT_CONFIRMATION_WEBHOOK_URL"
  ]);
}

function buildClientConfirmationEmailPayload(task) {
  const name = task.name || "there";
  const subject = "Task received — DONEOVERNIGHT";
  const reference = task.taskId;
  const text = [
    `Hi ${name},`,
    "",
    "Task received.",
    `Reference: ${reference}`,
    "",
    "We will review scope, quote, and timing, then reply with the next step.",
    "",
    "Human-reviewed. AI-assisted. Built for founders, creatives, and operators.",
    "",
    "DONEOVERNIGHT"
  ].join("\n");

  return {
    event: "task_confirmation_email",
    event_type: "client_confirmation_email",
    type: "task_received",
    workflow_version: "task_confirmation_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: task.email,
    email: task.email,
    client_email: task.email,
    name: task.name,
    client_name: task.name,
    subject,
    task_id: reference,
    taskId: reference,
    task_reference: reference,
    reference_id: reference,
    source: task.source,
    intake_version: task.intakeVersion,
    task_summary: task.taskSummary,
    text,
    html: `
      <div style="margin:0;padding:0;background:#050608;color:#f5f1ea;font-family:Inter,Arial,sans-serif">
        <div style="max-width:560px;margin:0 auto;padding:40px 24px">
          <div style="border:1px solid rgba(233,196,138,.22);border-radius:8px;background:rgba(245,241,234,.035);padding:30px 28px">
            <p style="margin:0 0 18px;color:#e9c48a;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">DONEOVERNIGHT</p>
            <h1 style="margin:0 0 18px;color:#f5f1ea;font-size:28px;line-height:1.2;font-weight:400">Task received.</h1>
            <p style="margin:0 0 18px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">Hi ${escapeHtml(name)}, we have received your request and will review scope, quote, and timing before replying with the next step.</p>
            <div style="margin:22px 0;padding:16px 18px;border:1px solid rgba(245,241,234,.12);border-radius:6px;background:rgba(0,0,0,.18)">
              <p style="margin:0;color:rgba(245,241,234,.52);font-size:11px;letter-spacing:.14em;text-transform:uppercase">Reference</p>
              <p style="margin:6px 0 0;color:#f5f1ea;font-size:18px;letter-spacing:.04em">${escapeHtml(reference)}</p>
            </div>
            <p style="margin:0;color:rgba(245,241,234,.58);font-size:13px;line-height:1.6">Human-reviewed. AI-assisted. Built for founders, creatives, and operators.</p>
          </div>
        </div>
      </div>
    `
  };
}

async function sendClientConfirmationEmail(task) {
  const resendResult = await sendTaskConfirmationEmailViaResend(task, {
    timeoutMs: CLIENT_EMAIL_TIMEOUT_MS
  });

  if (resendResult.configured || resendResult.reason !== "not_configured") {
    return resendResult;
  }

  const payload = buildClientConfirmationEmailPayload(task);
  const result = await dispatchWebhook({
    tag: "[TASK_CONFIRMATION_EMAIL]",
    event: payload.event,
    urls: getClientConfirmationEmailUrls(),
    payload,
    timeoutMs: CLIENT_EMAIL_TIMEOUT_MS
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

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const errors = validateTaskInput(input);
    if (errors.length) {
      return send(res, 400, {
        success: false,
        error: "Missing required fields",
        fields: errors
      });
    }

    const now = new Date();
    const taskId = createTaskId(now);
    const task = buildTaskPayload(input, taskId, now);

    // Future operational handoffs: quote generation, payment session generation,
    // portal linking, operator assignment, and realtime client status updates.
    const persistedTask = await saveTask(task);

    let notification = {
      configured: false,
      delivered: false
    };

    try {
      notification = await notifyOperations(task);
    } catch (notificationError) {
      console.warn(`Task notification warning: ${notificationError.message}`);
      notification = {
        configured: true,
        delivered: false,
        error: "TASK_NOTIFICATION_FAILED"
      };
    }

    let clientEmail = {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none"
    };

    try {
      clientEmail = await sendClientConfirmationEmail(task);
    } catch (emailError) {
      console.warn(`Task confirmation email warning: ${emailError.message}`);
      clientEmail = {
        configured: true,
        sent: false,
        delivered: false,
        reason: "failed",
        provider: process.env.RESEND_API_KEY && process.env.TASK_CONFIRMATION_FROM ? "resend" : "none",
        error: "TASK_CONFIRMATION_EMAIL_FAILED"
      };
    }

    return send(res, 200, {
      success: true,
      taskId,
      redirectTo: `/task/submitted?id=${encodeURIComponent(taskId)}`,
      task,
      persistedTask,
      notification,
      clientEmail
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, {
        success: false,
        error: "Invalid JSON",
        code: "INVALID_JSON"
      });
    }

    if (error.message === "Payload too large") {
      return send(res, 413, {
        success: false,
        error: "Payload too large",
        code: "PAYLOAD_TOO_LARGE"
      });
    }

    const statusCode = error instanceof TaskPersistenceError ? error.statusCode : 500;
    const code = error instanceof TaskPersistenceError ? error.code : "TASK_INTAKE_FAILED";
    const diagnostic = error instanceof TaskPersistenceError ? error.diagnostic : null;
    console.warn(`Task intake error: ${code}`);

    return send(res, statusCode, {
      success: false,
      error: "Could not create task intake record",
      code,
      ...(diagnostic ? { diagnostic } : {})
    });
  }
};
