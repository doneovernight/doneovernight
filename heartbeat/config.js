const DEFAULT_CHAT_ID = "8615489344";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getConfig(overrides = {}) {
  return {
    generatedAt: overrides.generatedAt || new Date(),
    telegramBotToken: overrides.telegramBotToken || clean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatId: overrides.telegramChatId || clean(process.env.HEARTBEAT_TELEGRAM_CHAT_ID) || DEFAULT_CHAT_ID,
    heartbeatApiKey: overrides.heartbeatApiKey || clean(process.env.HEARTBEAT_API_KEY),
    siteUrl: overrides.siteUrl || clean(process.env.HEARTBEAT_SITE_URL) || "https://doneovernight.com",
    startUrl: overrides.startUrl || clean(process.env.HEARTBEAT_START_URL) || "https://start.doneovernight.com",
    taskApiUrl: overrides.taskApiUrl || clean(process.env.HEARTBEAT_TASK_API_URL) || "https://doneovernight.com/api/task-submit",
    repositoryUrl: overrides.repositoryUrl || clean(process.env.HEARTBEAT_REPOSITORY_URL) || "https://github.com/doneovernight/doneovernight",
    supabaseUrl: overrides.supabaseUrl || clean(process.env.SUPABASE_URL).replace(/\/+$/, ""),
    supabaseServiceRoleKey: overrides.supabaseServiceRoleKey || clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vercelEnv: overrides.vercelEnv || clean(process.env.VERCEL_ENV) || clean(process.env.NODE_ENV) || "local",
    vercelUrl: overrides.vercelUrl || clean(process.env.VERCEL_URL),
    vercelCommitSha: overrides.vercelCommitSha || clean(process.env.VERCEL_GIT_COMMIT_SHA),
    vercelCommitMessage: overrides.vercelCommitMessage || clean(process.env.VERCEL_GIT_COMMIT_MESSAGE),
    vercelCommitRef: overrides.vercelCommitRef || clean(process.env.VERCEL_GIT_COMMIT_REF),
    vercelProjectProductionUrl: overrides.vercelProjectProductionUrl || clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  };
}

module.exports = {
  getConfig
};
