const { healthy, unavailable } = require("./utils");

function shortSha(value) {
  return value ? value.slice(0, 7) : "";
}

async function getDeploymentSummary(config) {
  const deploymentUrl = config.vercelUrl ? `https://${config.vercelUrl}` : config.vercelProjectProductionUrl || config.siteUrl;

  return {
    vercel: healthy("Vercel", {
      environment: config.vercelEnv,
      deploymentUrl
    }),
    latestCommit: config.vercelCommitSha
      ? {
          status: "Available",
          sha: shortSha(config.vercelCommitSha),
          ref: config.vercelCommitRef || "unknown",
          message: config.vercelCommitMessage || "Unavailable"
        }
      : unavailable("Latest Commit", "VERCEL_GIT_COMMIT_SHA not available outside Vercel"),
    deploymentStatus: config.vercelUrl || config.vercelProjectProductionUrl
      ? "Running"
      : "Unavailable"
  };
}

module.exports = {
  getDeploymentSummary
};
