function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getConfig(overrides = {}) {
  return {
    generatedAt: overrides.generatedAt || new Date(),
    telegramBotToken: overrides.telegramBotToken || clean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatId: overrides.telegramChatId || clean(process.env.HEARTBEAT_TELEGRAM_CHAT_ID),
    heartbeatApiKey: overrides.heartbeatApiKey || clean(process.env.HEARTBEAT_API_KEY),
    siteUrl: overrides.siteUrl || clean(process.env.HEARTBEAT_SITE_URL) || "https://doneovernight.com",
    askUrl: overrides.askUrl || clean(process.env.HEARTBEAT_ASK_URL) || "https://ask.doneovernight.com",
    startUrl: overrides.startUrl || clean(process.env.HEARTBEAT_START_URL) || "https://start.doneovernight.com",
    portalReviewUrl: overrides.portalReviewUrl || clean(process.env.HEARTBEAT_PORTAL_REVIEW_URL) || "https://portal.doneovernight.com/review",
    adminUrl: overrides.adminUrl || clean(process.env.HEARTBEAT_ADMIN_URL) || "https://admin.doneovernight.com",
    workspaceUrl: overrides.workspaceUrl || clean(process.env.HEARTBEAT_WORKSPACE_URL) || "https://portal.doneovernight.com/workspace",
    taskApiUrl: overrides.taskApiUrl || clean(process.env.HEARTBEAT_TASK_API_URL) || "https://doneovernight.com/api/task-submit",
    repositoryUrl: overrides.repositoryUrl || clean(process.env.HEARTBEAT_REPOSITORY_URL) || "https://github.com/doneovernight/doneovernight",
    supabaseUrl: overrides.supabaseUrl || clean(process.env.SUPABASE_URL).replace(/\/+$/, ""),
    supabaseServiceRoleKey: overrides.supabaseServiceRoleKey || clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vercelEnv: overrides.vercelEnv || clean(process.env.VERCEL_ENV) || clean(process.env.NODE_ENV) || "local",
    vercelUrl: overrides.vercelUrl || clean(process.env.VERCEL_URL),
    vercelCommitSha: overrides.vercelCommitSha || clean(process.env.VERCEL_GIT_COMMIT_SHA),
    vercelCommitMessage: overrides.vercelCommitMessage || clean(process.env.VERCEL_GIT_COMMIT_MESSAGE),
    vercelCommitRef: overrides.vercelCommitRef || clean(process.env.VERCEL_GIT_COMMIT_REF),
    vercelProjectProductionUrl: overrides.vercelProjectProductionUrl || clean(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    vercelDeploymentId: overrides.vercelDeploymentId || clean(process.env.VERCEL_DEPLOYMENT_ID),
    vercelDeploymentCreatedAt: overrides.vercelDeploymentCreatedAt || clean(process.env.VERCEL_DEPLOYMENT_CREATED_AT),
    vercelAnalyticsToken: overrides.vercelAnalyticsToken || clean(process.env.VERCEL_ANALYTICS_TOKEN),
    vercelAnalyticsTeamId:
      overrides.vercelAnalyticsTeamId ||
      clean(process.env.VERCEL_ANALYTICS_TEAM_ID) ||
      clean(process.env.VERCEL_TEAM_ID) ||
      clean(process.env.VERCEL_ORG_ID) ||
      "team_poT2RkL0qD1tRiGKXsAOcBr3",
    vercelAnalyticsProjectId:
      overrides.vercelAnalyticsProjectId ||
      clean(process.env.VERCEL_ANALYTICS_PROJECT_ID) ||
      clean(process.env.VERCEL_PROJECT_ID) ||
      "prj_dj9WlUTfSq6OgVZDCE5uCTEQ9mV5",
    vercelAnalyticsMetric:
      overrides.vercelAnalyticsMetric ||
      clean(process.env.VERCEL_ANALYTICS_METRIC) ||
      "vercel.request.count"
  };
}

module.exports = {
  getConfig
};
