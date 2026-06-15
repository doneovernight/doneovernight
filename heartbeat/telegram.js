const { fetchWithTimeout } = require("./providers/utils");

async function sendTelegramViaWebhook({ webhookUrls = [], text }) {
  const urls = [...new Set((webhookUrls || []).map((url) => String(url || "").trim()).filter(Boolean))];
  if (!urls.length) {
    return {
      sent: false,
      status: "Unavailable",
      reason: "Missing TELEGRAM_BOT_TOKEN or heartbeat Telegram webhook",
      provider: "none"
    };
  }

  const startedAt = Date.now();
  const payload = {
    event: "heartbeat",
    event_type: "heartbeat_telegram",
    notification_type: "heartbeat",
    type: "heartbeat",
    workflow_version: "heartbeat_v2",
    timestamp: new Date().toISOString(),
    telegram_message: text,
    operator_message: text,
    message: text
  };

  const results = await Promise.allSettled(urls.map(async (url) => {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      const error = new Error(`Telegram webhook HTTP ${response.status}`);
      error.statusCode = response.status;
      error.responseText = responseText.slice(0, 300);
      throw error;
    }

    return {
      status: response.status
    };
  }));

  const fulfilled = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.length - fulfilled;
  const responseTimeMs = Date.now() - startedAt;

  if (!fulfilled) {
    const firstError = results.find((result) => result.status === "rejected")?.reason;
    return {
      sent: false,
      status: "Needs attention",
      reason: firstError?.message || "Telegram webhook failed",
      provider: "webhook",
      attempted: urls.length,
      fulfilled,
      rejected,
      responseTimeMs
    };
  }

  return {
    sent: true,
    status: "Sent",
    provider: "webhook",
    attempted: urls.length,
    fulfilled,
    rejected,
    sentAt: new Date().toISOString(),
    responseTimeMs
  };
}

async function sendTelegramMessage({ botToken, chatId, webhookUrls = [], text }) {
  if (!botToken) {
    return sendTelegramViaWebhook({ webhookUrls, text });
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
      provider: "bot_api",
      responseTimeMs
    };
  }

  return {
    sent: true,
    status: "Sent",
    provider: "bot_api",
    messageId: data.result?.message_id || null,
    sentAt: new Date().toISOString(),
    responseTimeMs
  };
}

module.exports = {
  sendTelegramMessage
};
