#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const dbUrl = process.env.SUPABASE_DB_URL;
const projectRef = process.env.SUPABASE_PROJECT_REF;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

function fail(message) {
  console.error(`Website OS migration blocked: ${message}`);
  process.exit(1);
}

function run(args) {
  const result = spawnSync("npx", ["--yes", "supabase@latest", ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!apply) console.log("Dry run only. No production schema changes will be applied.");

if (dbUrl) {
  run(["db", "push", "--db-url", dbUrl, "--dry-run"]);
  if (apply) {
    if (process.env.WEBSITE_OS_MIGRATIONS_APPROVED !== "apply-production-website-os") {
      fail("Set WEBSITE_OS_MIGRATIONS_APPROVED=apply-production-website-os before applying.");
    }
    run(["db", "push", "--db-url", dbUrl]);
  }
  process.exit(0);
}

if (!projectRef || !dbPassword || !accessToken) {
  fail("Set SUPABASE_DB_URL, or set SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD and SUPABASE_ACCESS_TOKEN.");
}

run(["link", "--project-ref", projectRef, "--password", dbPassword]);
run(["db", "push", "--linked", "--dry-run"]);
if (apply) {
  if (process.env.WEBSITE_OS_MIGRATIONS_APPROVED !== "apply-production-website-os") {
    fail("Set WEBSITE_OS_MIGRATIONS_APPROVED=apply-production-website-os before applying.");
  }
  run(["db", "push", "--linked"]);
}
