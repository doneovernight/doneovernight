const { fetchWithTimeout } = require("./providers/utils");

async function telegramRequest(botToken, method, payload = {}) {
  if (!botToken) return { ok: false, status: "Unavailable", reason: "Missing TELEGRAM_BOT_TOKEN", provider: "bot_api" };
  const startedAt = Date.now();
  const response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const responseTimeMs = Date.now() - startedAt;
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) return { ok: false, status: "Needs attention", reason: data.description || `Telegram HTTP ${response.status}`, provider: "bot_api", responseTimeMs };
  return { ok: true, status: "Sent", provider: "bot_api", result: data.result || null, responseTimeMs };
}

async function sendTelegramMessage({ botToken, chatId, text, replyMarkup = null }) {
  if (!botToken) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing TELEGRAM_BOT_TOKEN",
      provider: "bot_api"
    };
  }

  if (!chatId) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing HEARTBEAT_TELEGRAM_CHAT_ID"
    };
  }

  const result = await telegramRequest(botToken, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  if (!result.ok) {
    return {
      sent: false,
      status: result.status,
      reason: result.reason,
      provider: result.provider,
      responseTimeMs: result.responseTimeMs
    };
  }

  return {
    sent: true,
    status: "Sent",
    provider: "bot_api",
    messageId: result.result?.message_id || null,
    sentAt: new Date().toISOString(),
    responseTimeMs: result.responseTimeMs
  };
}

async function editTelegramMessage({ botToken, chatId, messageId, text, replyMarkup = null }) {
  const result = await telegramRequest(botToken, "editMessageText", { chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  return { edited: result.ok, status: result.status, reason: result.reason || null, provider: result.provider, responseTimeMs: result.responseTimeMs };
}

async function answerTelegramCallbackQuery({ botToken, callbackQueryId, text = "" }) {
  const result = await telegramRequest(botToken, "answerCallbackQuery", { callback_query_id: callbackQueryId, text: String(text).slice(0, 180), show_alert: false });
  return { answered: result.ok, status: result.status, reason: result.reason || null };
}

module.exports = {
  sendTelegramMessage,
  editTelegramMessage,
  answerTelegramCallbackQuery
};
