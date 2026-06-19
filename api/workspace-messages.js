const {
  clean,
  dispatchWebhook,
  getWebhookUrls,
  getWorkspaceSessionFromRequest,
  parseBody,
  send,
  slugify,
  supabaseFetch,
  workspaceSessionMatchesRequest
} = require("../lib/ops");
const { withFreshAttachmentUrls } = require("../lib/attachments");
const { sendTelegramMessage } = require("../heartbeat/telegram");

const OPERATION_UPDATE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

function normalizeOperationLink(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  if (/^(?:www\.|[a-z0-9-]+\.)/i.test(raw)) return `https://${raw.replace(/^\/+/, "")}`;
  return raw;
}

function normalizeOperationLinks(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  return [...new Set(source.map(normalizeOperationLink).filter(Boolean))];
}

async function signOperationUpdateAttachments(attachments = []) {
  return withFreshAttachmentUrls(Array.isArray(attachments) ? attachments : [], {
    expiresIn: OPERATION_UPDATE_SIGNED_URL_TTL_SECONDS
  }).catch(() => Array.isArray(attachments) ? attachments : []);
}

async function signWorkspaceMessageRecord(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const attachments = await signOperationUpdateAttachments(metadata.attachments || metadata.files || []);
  return {
    ...record,
    metadata: {
      ...metadata,
      ...(attachments.length ? { attachments } : {})
    }
  };
}

function isClientOperationUpdate(input = {}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const type = clean(input.message_type || input.messageType || "").toLowerCase();
  return metadata.source === "operation_update" ||
    metadata.update_type === "client_update" ||
    type.includes("client update") ||
    type.includes("client_update");
}

function getOperationUpdateTelegramUrls() {
  return getWebhookUrls(["DONEOVERNIGHT_OPS_TELEGRAM_WEBHOOK_URL"]);
}

function getOperationUpdateTelegramConfig() {
  const botToken = clean(process.env.DONEOVERNIGHT_OPS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  const chatId = clean(process.env.DONEOVERNIGHT_OPS_CHAT_ID || process.env.HEARTBEAT_TELEGRAM_CHAT_ID);
  return {
    botToken,
    chatId,
    tokenEnv: process.env.DONEOVERNIGHT_OPS_BOT_TOKEN ? "DONEOVERNIGHT_OPS_BOT_TOKEN" : process.env.TELEGRAM_BOT_TOKEN ? "TELEGRAM_BOT_TOKEN" : "",
    chatEnv: process.env.DONEOVERNIGHT_OPS_CHAT_ID ? "DONEOVERNIGHT_OPS_CHAT_ID" : process.env.HEARTBEAT_TELEGRAM_CHAT_ID ? "HEARTBEAT_TELEGRAM_CHAT_ID" : ""
  };
}

function buildOperationUpdateTelegramText(record = {}) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const links = normalizeOperationLinks(metadata.links || []);
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  const fileNames = attachments.map((file) => clean(file.name || file.filename || file.title)).filter(Boolean);
  const client = [metadata.client_name, metadata.client_email || record.email].map(clean).filter(Boolean).join(" / ") || "Workspace client";
  return [
    "🟡 NEW INFORMATION ADDED TO TASK",
    "",
    `Task: ${clean(record.task_id || metadata.task_id || metadata.operation) || "Unknown"}`,
    `Workspace: ${record.workspace_slug ? `@${record.workspace_slug}` : metadata.workspace_slug ? `@${metadata.workspace_slug}` : "Unknown"}`,
    `Client: ${client}`,
    "",
    "Message:",
    clean(metadata.client_message) || clean(record.message) || "Client added operation context.",
    links.length ? ["", "Links:", ...links].join("\n") : "",
    clean(metadata.notes) ? ["", "Notes:", clean(metadata.notes)].join("\n") : "",
    fileNames.length ? ["", "Files:", ...fileNames].join("\n") : "",
    "",
    `Timestamp: ${clean(record.created_at || metadata.submitted_at) || new Date().toISOString()}`
  ].filter(Boolean).join("\n");
}

async function notifyOperationUpdate(record = {}) {
  const text = buildOperationUpdateTelegramText(record);
  const webhookUrls = getOperationUpdateTelegramUrls();
  const webhook = webhookUrls.length
    ? await dispatchWebhook({
      tag: "DONEOVERNIGHT_OPERATION_UPDATE_TELEGRAM",
      event: "operation_update",
      urls: webhookUrls,
      payload: {
        event: "operation_update",
        notification_type: "client_operation_update",
        task_id: record.task_id,
        workspace_slug: record.workspace_slug,
        email: record.email,
        message_type: record.message_type,
        metadata: record.metadata,
        telegram_message: text,
        message: text
      }
    }).catch((error) => ({ attempted: webhookUrls.length, fulfilled: 0, rejected: webhookUrls.length, error: error.message }))
    : { attempted: 0, fulfilled: 0, rejected: 0 };

  const config = getOperationUpdateTelegramConfig();
  const bot = config.botToken && config.chatId
    ? await sendTelegramMessage({ botToken: config.botToken, chatId: config.chatId, text }).catch((error) => ({
      sent: false,
      status: "Failed",
      reason: error.message,
      provider: "bot_api"
    }))
    : {
      sent: false,
      status: "Not configured",
      reason: "No operation update Telegram bot env configured",
      provider: "none"
    };

  return {
    sent: bot.sent === true || Number(webhook.fulfilled || 0) > 0,
    webhook: {
      attempted: webhook.attempted || 0,
      fulfilled: webhook.fulfilled || 0,
      rejected: webhook.rejected || 0
    },
    bot: {
      sent: bot.sent === true,
      status: bot.status || "Unknown",
      provider: bot.provider || "none",
      reason: bot.reason || "",
      tokenEnv: config.tokenEnv || "",
      chatEnv: config.chatEnv || ""
    }
  };
}

function fallbackMessages({ taskId, slug }) {
  const label = taskId || (slug ? `@${slug}` : "workspace");
  return [
    {
      id: "system-ready",
      message_type: "system_update",
      author_role: "system",
      message: "Private workspace opened.",
      task_id: label,
      created_at: new Date().toISOString()
    }
  ];
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, `https://${req.headers.host || "doneovernight.com"}`);
      const slug = slugify(url.searchParams.get("slug") || "");
      const email = clean(url.searchParams.get("email") || "").toLowerCase();
      const taskId = clean(url.searchParams.get("task_id") || url.searchParams.get("taskId"));
      const session = await getWorkspaceSessionFromRequest(req);
      if (!session || !workspaceSessionMatchesRequest(session, { email, slug })) {
        return send(res, 401, {
          success: false,
          messages: [],
          error: "Private workspace access required",
          code: "WORKSPACE_SESSION_REQUIRED"
        });
      }
      const filters = ["select=*", "order=created_at.desc", "limit=50"];
      if (session.email) filters.unshift(`email=eq.${encodeURIComponent(session.email)}`);
      else if (session.workspace_slug) filters.unshift(`workspace_slug=eq.${encodeURIComponent(session.workspace_slug)}`);
      else if (taskId) filters.unshift(`task_id=eq.${encodeURIComponent(taskId)}`);
      const rows = await supabaseFetch(`workspace_messages?${filters.join("&")}`);
      const messages = await Promise.all((Array.isArray(rows) ? rows : []).map(signWorkspaceMessageRecord));
      return send(res, 200, { success: true, messages });
    }

    if (req.method === "POST") {
      const input = await parseBody(req);
      const session = await getWorkspaceSessionFromRequest(req);
      if (!session || !workspaceSessionMatchesRequest(session, {
        email: clean(input.email).toLowerCase(),
        slug: slugify(input.workspace_slug || input.slug || "")
      })) {
        return send(res, 401, {
          success: false,
          error: "Private workspace access required",
          code: "WORKSPACE_SESSION_REQUIRED"
        });
      }
      const message = clean(input.message);
      if (!message) return send(res, 400, { success: false, error: "Message is required" });
      const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
      const normalizedLinks = normalizeOperationLinks(metadata.links || input.links || []);
      const signedAttachments = await signOperationUpdateAttachments(metadata.attachments || metadata.files || []);
      const payload = {
        workspace_slug: session.workspace_slug,
        task_id: clean(input.task_id || input.taskId),
        email: session.email,
        author_role: "client",
        message_type: clean(input.message_type || input.messageType) || "system_update",
        message,
        metadata: {
          ...metadata,
          ...(normalizedLinks.length ? { links: normalizedLinks } : { links: [] }),
          ...(signedAttachments.length ? {
            attachments: signedAttachments,
            attachment_names: signedAttachments.map((file) => clean(file.name || file.filename || "Attached file")).filter(Boolean)
          } : { attachments: [] })
        }
      };
      const rows = await supabaseFetch("workspace_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      let messageRow = Array.isArray(rows) ? rows[0] : rows;
      let telegram = null;
      if (isClientOperationUpdate(payload)) {
        telegram = await notifyOperationUpdate(messageRow).catch((error) => ({
          sent: false,
          error: error.message || "OPERATION_UPDATE_TELEGRAM_FAILED"
        }));
        const nextMetadata = {
          ...(messageRow.metadata || payload.metadata || {}),
          operation_update_telegram: {
            sent: telegram.sent === true,
            attempted_at: new Date().toISOString(),
            webhook: telegram.webhook || null,
            bot: telegram.bot || null,
            error: telegram.error || ""
          }
        };
        if (messageRow?.id) {
          const updatedRows = await supabaseFetch(`workspace_messages?id=eq.${encodeURIComponent(messageRow.id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ metadata: nextMetadata })
          }).catch(() => null);
          messageRow = Array.isArray(updatedRows) && updatedRows[0]
            ? updatedRows[0]
            : { ...messageRow, metadata: nextMetadata };
        } else {
          messageRow = { ...messageRow, metadata: nextMetadata };
        }
      }
      const signedMessage = await signWorkspaceMessageRecord(messageRow);
      return send(res, 200, { success: true, message: signedMessage, telegram });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  } catch (error) {
    if (req.method === "GET") {
      const url = new URL(req.url, `https://${req.headers.host || "doneovernight.com"}`);
      return send(res, 200, {
        success: true,
        fallback: true,
        messages: fallbackMessages({
          slug: slugify(url.searchParams.get("slug") || ""),
          taskId: clean(url.searchParams.get("task_id") || url.searchParams.get("taskId"))
        })
      });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: "Could not save workspace message",
      code: error.code || "WORKSPACE_MESSAGE_FAILED"
    });
  }
};
