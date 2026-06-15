const { fetchWithTimeout } = require("./providers/utils");

async function sendTelegramMessage({ botToken, chatId, text }) {
  if (!botToken) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing TELEGRAM_BOT_TOKEN"
    };
  }

  if (!chatId) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing HEARTBEAT_TELEGRAM_CHAT_ID"
    };
  }

  const startedAt = Date.now();
  const response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
  const responseTimeMs = Date.now() - startedAt;

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    return {
      sent: false,
      status: "Needs attention",
      reason: data.description || `Telegram HTTP ${response.status}`,
      responseTimeMs
    };
  }

  return {
    sent: true,
    status: "Sent",
    messageId: data.result?.message_id || null,
    responseTimeMs
  };
}

module.exports = {
  sendTelegramMessage
};
