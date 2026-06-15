const { getConfig } = require("./config");
const { formatHeartbeatTelegram } = require("./formatters/telegram");
const { getAnalyticsSummary } = require("./providers/analytics");
const { getCaseStudySummary } = require("./providers/case-studies");
const { getContactSummary } = require("./providers/contacts");
const { getDeploymentSummary } = require("./providers/deployments");
const { getDispatchSummary } = require("./providers/dispatch");
const { getHealth } = require("./providers/health");
const { getPerformanceSummary } = require("./providers/performance");
const { getRecommendation } = require("./providers/recommendations");
const { getSearchConsoleSummary } = require("./providers/search-console");
const { sendTelegramMessage } = require("./telegram");

async function generateHeartbeat(options = {}) {
  const config = getConfig(options.config || {});
  const [health, analytics, performance, deployments, searchConsole, caseStudies, dispatch, contacts] = await Promise.all([
    getHealth(config),
    getAnalyticsSummary(config),
    getPerformanceSummary(config),
    getDeploymentSummary(config),
    getSearchConsoleSummary(config),
    getCaseStudySummary(config),
    getDispatchSummary(config),
    getContactSummary(config)
  ]);

  const summary = {
    generatedAt: config.generatedAt.toISOString(),
    health,
    analytics,
    performance,
    deployments,
    searchConsole,
    caseStudies,
    dispatch,
    contacts,
    placeholders: {
      traffic: "Not connected",
      leads: "Not connected",
      contacts: "Not connected",
      dispatch: "Not connected",
      searchConsole: "Not connected",
      caseStudies: "Not connected",
      recommendations: "Not connected"
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
