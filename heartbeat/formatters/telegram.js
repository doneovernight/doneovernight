const { statusLine } = require("../providers/utils");

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    timeZone: "Europe/Amsterdam",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function valueLine(result) {
  if (!result) return "Unavailable";
  if (result.status === "Healthy") return String(result.value ?? 0);
  return statusLine(result);
}

function numericValue(result) {
  const value = Number(result?.value);
  return Number.isFinite(value) ? value : 0;
}

function latestAskLine(latest = {}) {
  if (latest.status !== "Healthy") return statusLine(latest);
  const lines = [
    latest.task_id || latest.value || "Unavailable",
    latest.budget ? `Budget: ${latest.budget}` : "Budget: Not provided",
    `Source: ${latest.source || "Unavailable"}`,
    latest.created_at ? `Created: ${formatDate(latest.created_at)}` : "Created: Unavailable"
  ];
  if (latest.client) lines.splice(1, 0, `Client: ${latest.client}`);
  return lines.join("\n");
}

function latestCompactLine(latest = {}) {
  if (latest.status !== "Healthy") return statusLine(latest);
  const parts = [
    latest.value,
    latest.source ? `Source: ${latest.source}` : "",
    latest.created_at ? formatDate(latest.created_at) : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

function commitLine(deployments = {}) {
  const commit = deployments.latestCommit || {};
  if (commit.sha) {
    return [commit.sha, commit.ref, commit.message].filter(Boolean).join(" · ");
  }
  return "Commit unavailable";
}

function deploymentTimestampLine(deployments = {}) {
  const timestamp = deployments.deploymentTimestamp || {};
  if (timestamp.value) return formatDate(timestamp.value) || timestamp.value;
  return "Unavailable";
}

function telegramLastSendLine(telegram = {}) {
  if (telegram.sentAt) return formatDate(telegram.sentAt) || telegram.sentAt;
  if (telegram.status === "Sending") return telegram.sentAt ? formatDate(telegram.sentAt) : "Current delivery";
  if (telegram.reason) return `Offline · ${telegram.reason}`;
  return "Unavailable";
}

function formatVoiceSummary(summary = {}) {
  const health = summary.health || {};
  const operations = summary.operations || {};
  const asks = operations.asks || {};
  const operators = operations.operators || {};
  const systems = [
    health.supabase,
    health.website,
    health.askWebsite,
    health.portalReview,
    health.adminWebsite,
    health.workspace
  ];
  const unhealthy = systems.filter((item) => item && item.status && item.status !== "Healthy");
  const pendingReview = numericValue(asks.pendingReview);
  const awaitingPayment = numericValue(asks.awaitingPayment);
  const pendingOperators = numericValue(operators.pending);

  return [
    "Hi Don.",
    "",
    unhealthy.length ? "DONEOVERNIGHT needs attention." : "DONEOVERNIGHT is healthy.",
    "",
    summary.recommendation || "No operational bottlenecks detected.",
    "",
    `${pendingReview} ask${pendingReview === 1 ? "" : "s"} awaiting review.`,
    `${awaitingPayment} payment${awaitingPayment === 1 ? "" : "s"} pending.`,
    `${pendingOperators} operator application${pendingOperators === 1 ? "" : "s"} pending.`,
    "",
    "Full report below."
  ].join("\n");
}

function formatHeartbeatTelegram(summary, telegram = summary.telegram || {}) {
  const generated = formatDate(summary.generatedAt) || summary.generatedAt || "Unavailable";
  const operations = summary.operations || {};
  const asks = operations.asks || {};
  const dispatch = operations.dispatch || {};
  const operators = operations.operators || {};
  const latest = operations.latest || {};

  return [
    formatVoiceSummary(summary),
    "",
    "💓 DONEOVERNIGHT HEARTBEAT",
    "",
    "Generated:",
    generated,
    "",
    "SYSTEMS",
    `Supabase: ${statusLine(summary.health?.supabase)}`,
    `Website: ${statusLine(summary.health?.website)}`,
    `Ask: ${statusLine(summary.health?.askWebsite)}`,
    `Portal: ${statusLine(summary.health?.portalReview)}`,
    `Admin: ${statusLine(summary.health?.adminWebsite)}`,
    `Workspace: ${statusLine(summary.health?.workspace)}`,
    "",
    "OPERATIONS",
    `Asks today: ${valueLine(asks.today)}`,
    `Pending review: ${valueLine(asks.pendingReview)}`,
    `Quote needed: ${valueLine(asks.quoteNeeded)}`,
    `Awaiting payment: ${valueLine(asks.awaitingPayment)}`,
    `Delivered: ${valueLine(asks.delivered)}`,
    "",
    `Dispatch signups today: ${valueLine(dispatch.today)}`,
    `Dispatch total: ${valueLine(dispatch.total)}`,
    "",
    `Operators active: ${valueLine(operators.active)}`,
    `Operators pending: ${valueLine(operators.pending)}`,
    `Operators total: ${valueLine(operators.total)}`,
    "",
    "LATEST ACTIVITY",
    "Latest Ask",
    latestAskLine(latest.ask),
    "",
    `Latest Dispatch Signup: ${latestCompactLine(latest.dispatchSignup)}`,
    `Latest Operator Application: ${latestCompactLine(latest.operatorApplication)}`,
    "",
    "DEPLOYMENT",
    `Vercel: ${statusLine(summary.deployments?.vercel)}`,
    `Latest Commit: ${commitLine(summary.deployments)}`,
    `Deployment Status: ${summary.deployments?.deploymentStatus || "Unavailable"}`,
    `Deployment Timestamp: ${deploymentTimestampLine(summary.deployments)}`,
    "",
    "TELEGRAM",
    `Telegram: ${telegram.status === "Sent" ? "Healthy" : telegram.status === "Connected" ? "Healthy" : telegram.status || "Unavailable"}`,
    `Last send: ${telegramLastSendLine(telegram)}`,
    "",
    "FOCUS",
    summary.recommendation || "No operational bottlenecks detected."
  ].join("\n");
}

module.exports = {
  formatHeartbeatTelegram
};
