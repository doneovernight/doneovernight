const endpoint = process.env.LIVE_STATUS_ENDPOINT || "https://doneovernight.com/api/live-status";
const token = String(process.env.HQ_ACCESS_TOKEN || "").trim();
const environment = String(process.env.VERCEL_ENV || "").trim();

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compact(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && String(value).trim() !== "";
    })
  );
}

async function main() {
  if (environment !== "production") {
    console.log("[live-status] skipped: not a production deployment");
    return;
  }

  if (!token) {
    console.log("[live-status] skipped: HQ_ACCESS_TOKEN unavailable");
    return;
  }

  const now = new Date().toISOString();
  const deploymentUrl = clean(process.env.VERCEL_URL);
  const deploymentId = clean(process.env.VERCEL_DEPLOYMENT_ID) || deploymentUrl;
  const branch = clean(process.env.VERCEL_GIT_COMMIT_REF);
  const commit = clean(process.env.VERCEL_GIT_COMMIT_SHA);
  const message = clean(process.env.VERCEL_GIT_COMMIT_MESSAGE);
  const repo = clean(process.env.VERCEL_GIT_REPO_SLUG);
  const owner = clean(process.env.VERCEL_GIT_REPO_OWNER);

  if (!deploymentId && !commit) {
    console.log("[live-status] skipped: deployment metadata unavailable");
    return;
  }

  const commitLabel = commit ? commit.slice(0, 7) : "";
  const deploymentLabel = deploymentUrl ? `https://${deploymentUrl}` : deploymentId;
  const summary = message || (commitLabel ? `Commit ${commitLabel}` : "Production deployment");

  const payload = compact({
    current_build: summary,
    current_project: "DONEOVERNIGHT Platform",
    latest_deployment: deploymentLabel,
    current_repository: owner && repo ? `${owner}/${repo}` : repo,
    current_branch: branch,
    current_commit: commit,
    heartbeat: `Production deployment recorded ${now}`,
    repository_status: "Production deployment connected",
    last_update: now,
    current_focus: summary,
    progress_percentage: 100,
    current_progress: "Production deployment live",
    recent_activity: [
      deploymentLabel ? `Deployment: ${deploymentLabel}` : "",
      commitLabel ? `Commit: ${commitLabel}` : "",
      branch ? `Branch: ${branch}` : ""
    ].filter(Boolean),
    latest_wins: [
      message || "",
      deploymentId ? `Deployment ID: ${deploymentId}` : ""
    ].filter(Boolean)
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-hq-access-token": token
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.saved !== true) {
      console.log(`[live-status] skipped: endpoint returned ${response.status}`);
      return;
    }
    console.log(`[live-status] updated: ${payload.current_build || payload.latest_deployment}`);
  } catch (error) {
    console.log(`[live-status] skipped: ${error.message || "request failed"}`);
  }
}

main();
