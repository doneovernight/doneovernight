import { spawnSync } from "node:child_process";

const testEnv = { ...process.env };
for (const key of [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_DB_URL",
  "CRON_SECRET",
  "CONTENT_CRON_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "HEARTBEAT_TELEGRAM_CHAT_ID",
  "DONEOVERNIGHT_OPS_BOT_TOKEN",
  "DONEOVERNIGHT_OPS_CHAT_ID",
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
  "X_BEARER_TOKEN",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_REDIRECT_URI",
  "X_REFRESH_TOKEN"
]) {
  delete testEnv[key];
}

testEnv.CONTENT_PUBLISH_MODE = "approve";
testEnv.CONTENT_AUTONOMY_MODE = "shadow";
testEnv.X_AUTONOMOUS_PUBLISH_ENABLED = "false";
testEnv.X_ALLOW_TEST_POST = "false";

const result = spawnSync(process.execPath, ["--test", "test/**/*.test.js"], {
  env: testEnv,
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
