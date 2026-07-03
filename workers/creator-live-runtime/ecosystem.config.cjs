"use strict";

const fs = require("node:fs");
const path = require("node:path");

const workerDir = __dirname;
const envPath = path.join(workerDir, ".env");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = parseEnvFile(envPath);

module.exports = {
  apps: [
    {
      name: "creator-live-runtime-mosyaamosya",
      cwd: workerDir,
      script: "index.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 50,
      min_uptime: "10s",
      restart_delay: 10000,
      exp_backoff_restart_delay: 10000,
      kill_timeout: 10000,
      time: true,
      merge_logs: true,
      out_file: path.join(workerDir, "logs", "runtime.out.log"),
      error_file: path.join(workerDir, "logs", "runtime.error.log"),
      env: {
        NODE_ENV: "production",
        CREATOR_SLUG: "mosyaamosya",
        CREATOR_LIVE_USERNAME: "mosyaamosya",
        RUNTIME_STALE_SECONDS: "75",
        RUNTIME_HEARTBEAT_SECONDS: "25",
        RUNTIME_RECONNECT_MIN_MS: "10000",
        RUNTIME_RECONNECT_MAX_MS: "300000",
        ...fileEnv
      }
    }
  ]
};
