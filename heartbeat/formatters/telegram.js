const { statusLine } = require("../providers/utils");

function metricValue(item) {
  if (item === undefined || item === null) return "Unavailable";
  if (typeof item === "number") return String(item);
  if (typeof item === "string") return item;
  if (item.value !== undefined && item.value !== null) return String(item.value);
  return statusLine(item);
}

function formatHeartbeatTelegram(summary) {
  const generated = new Date(summary.generatedAt).toLocaleString("en-GB", {
    timeZone: "Europe/Amsterdam",
    dateStyle: "medium",
    timeStyle: "short"
  });

  return [
    "💓 DONEOVERNIGHT HEARTBEAT",
    "",
    `Generated: ${generated}`,
    "",
    "Status",
    `Supabase: ${statusLine(summary.health.supabase)}`,
    `Vercel: ${statusLine(summary.deployments.vercel)}`,
    `GitHub: ${statusLine(summary.health.github)}`,
    `Website: ${statusLine(summary.health.website)}`,
    `Start: ${statusLine(summary.health.startWebsite)}`,
    `Task API: ${statusLine(summary.health.taskApi)}`,
    "",
    "Traffic",
    `Homepage Visits: ${metricValue(summary.analytics.traffic.homepageVisits)}`,
    `Start Visits: ${metricValue(summary.analytics.traffic.startVisits)}`,
    `Task Visits: ${metricValue(summary.analytics.traffic.taskVisits)}`,
    "",
    "Conversions",
    `START Opened: ${metricValue(summary.analytics.conversions.startOpened)}`,
    `START Closed: ${metricValue(summary.analytics.conversions.startClosed)}`,
    `Task Submitted: ${metricValue(summary.analytics.conversions.taskSubmitted)}`,
    `Dispatch Shown: ${metricValue(summary.analytics.conversions.dispatchShown)}`,
    `Dispatch Intent: ${metricValue(summary.analytics.conversions.dispatchIntent)}`,
    "",
    "Performance",
    `FCP: ${metricValue(summary.performance.fcp)}`,
    `LCP: ${metricValue(summary.performance.lcp)}`,
    `TTFB: ${metricValue(summary.performance.ttfb)}`,
    "",
    "Deployments",
    `Latest Commit: ${summary.deployments.latestCommit.sha || metricValue(summary.deployments.latestCommit)}`,
    `Deployment Status: ${summary.deployments.deploymentStatus}`,
    "",
    "Focus",
    summary.recommendation
  ].join("\n");
}

module.exports = {
  formatHeartbeatTelegram
};
