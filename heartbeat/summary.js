const { getConfig } = require("./config");
const { formatHeartbeatTelegram } = require("./formatters/telegram");
const { getAnalyticsSummary } = require("./providers/analytics");
const { getDeploymentSummary } = require("./providers/deployments");
const { getHealth } = require("./providers/health");
const { getPerformanceSummary } = require("./providers/performance");
const { getRecommendation } = require("./providers/recommendations");
const { sendTelegramMessage } = require("./telegram");

async function generateHeartbeat(options = {}) {
  const config = getConfig(options.config || {});
  const [health, analytics, performance, deployments] = await Promise.all([
    getHealth(config),
    getAnalyticsSummary(config),
    getPerformanceSummary(config),
    getDeploymentSummary(config)
  ]);

  const summary = {
    generatedAt: config.generatedAt.toISOString(),
    health,
    analytics,
    performance,
    deployments,
    placeholders: {
      traffic: "Prepared",
      leads: "Prepared",
      contacts: "Prepared",
      dispatch: "Prepared",
      recommendations: "Prepared"
    }
  };

  summary.recommendation = await getRecommendation(summary, config);
  summary.telegramMessage = formatHeartbeatTelegram(summary);

  return summary;
}

async function sendHeartbeat(options = {}) {
  const config = getConfig(options.config || {});
  const summary = await generateHeartbeat({ config });
  const telegram = await sendTelegramMessage({
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
    text: summary.telegramMessage
  });

  return {
    summary,
    telegram
  };
}

module.exports = {
  generateHeartbeat,
  sendHeartbeat
};
