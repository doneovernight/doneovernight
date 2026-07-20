import { spawnSync } from "node:child_process";

const testEnv = { ...process.env };
for (const key of [
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

const result = spawnSync(process.execPath, ["--test", "test/**/*.test.js"], {
  env: testEnv,
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
