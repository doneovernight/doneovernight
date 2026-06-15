const { statusLine } = require("../providers/utils");

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
    `Website: ${statusLine(summary.health.website)}`,
    `Ask: ${statusLine(summary.health.askWebsite)}`,
    `Start: ${statusLine(summary.health.startWebsite)}`,
    `Portal: ${statusLine(summary.health.portalReview)}`,
    `Admin: ${statusLine(summary.health.adminWebsite)}`,
    `Workspace: ${statusLine(summary.health.workspace)}`,
    "",
    "Deployments",
    `Vercel: ${statusLine(summary.deployments.vercel)}`,
    `Latest Commit: ${summary.deployments.latestCommit.sha || "Unavailable"}`,
    `Deployment Status: ${summary.deployments.deploymentStatus}`,
    "",
    "Focus",
    summary.recommendation
  ].join("\n");
}

module.exports = {
  formatHeartbeatTelegram
};
