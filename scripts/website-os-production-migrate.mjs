#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const apply = process.argv.includes("--apply");
const onlyIndex = process.argv.indexOf("--only");
const onlyMigration = onlyIndex >= 0 ? basename(process.argv[onlyIndex + 1] || "") : "";
const dbUrl = process.env.SUPABASE_DB_URL;
const projectRef = process.env.SUPABASE_PROJECT_REF;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const expectedProjectRef = process.env.WEBSITE_OS_EXPECTED_PROJECT_REF || "xvctqtcjhcmjlesbfbmj";
const migrationsRoot = resolve("supabase/migrations");
const linkedProjectRefFile = resolve("supabase/.temp/project-ref");
const linkedProjectRef = existsSync(linkedProjectRefFile) ? readFileSync(linkedProjectRefFile, "utf8").trim() : "";
const isolatedRemoteHistory = [
  "061_website_os_content_builder.sql",
  "062_website_os_content_conflict_errors.sql",
  "063_website_os_final_hardening.sql",
  "064_website_os_today_briefing.sql",
  "065_website_os_business_documents.sql"
];

function fail(message) {
  console.error(`Website OS migration blocked: ${message}`);
  process.exit(1);
}

function run(args, cwd = process.cwd()) {
  const result = spawnSync("npx", ["--yes", "supabase@latest", ...args], {
    cwd,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

function projectRefFromDbUrl(value = "") {
  const match = String(value).match(/(?:postgres\.|@db\.)([a-z0-9]{20})/i) || String(value).match(/postgres\.([a-z0-9]{20})@/i);
  return match?.[1] || "";
}

const targetProjectRef = projectRef || projectRefFromDbUrl(dbUrl) || linkedProjectRef;
if (!targetProjectRef) fail("The production project reference could not be verified from the configured credentials.");
if (targetProjectRef !== expectedProjectRef) fail(`Target project ${targetProjectRef} does not match the approved production project.`);

let commandRoot = process.cwd();
let temporaryRoot = "";
if (onlyMigration) {
  if (!/^\d{3}_[a-z0-9_]+\.sql$/i.test(onlyMigration)) fail("--only requires a migration filename such as 063_website_os_final_hardening.sql.");
  const source = join(migrationsRoot, onlyMigration);
  if (!existsSync(source)) fail(`Migration ${onlyMigration} does not exist.`);
  temporaryRoot = mkdtempSync(join(tmpdir(), "website-os-migration-"));
  const supabaseRoot = join(temporaryRoot, "supabase");
  mkdirSync(join(supabaseRoot, "migrations"), { recursive: true });
  copyFileSync(source, join(supabaseRoot, "migrations", onlyMigration));
  for (const migration of isolatedRemoteHistory) {
    const historySource = join(migrationsRoot, migration);
    if (!existsSync(historySource)) fail(`Required production migration history ${migration} does not exist locally.`);
    if (migration !== onlyMigration) copyFileSync(historySource, join(supabaseRoot, "migrations", migration));
  }
  const configSource = resolve("supabase/config.toml");
  if (existsSync(configSource)) copyFileSync(configSource, join(supabaseRoot, "config.toml"));
  else writeFileSync(join(supabaseRoot, "config.toml"), `project_id = "${expectedProjectRef}"\n`);
  const linkedState = resolve("supabase/.temp");
  if (!dbUrl && !projectRef && existsSync(linkedState)) cpSync(linkedState, join(supabaseRoot, ".temp"), { recursive: true });
  commandRoot = temporaryRoot;
  console.log(`Isolated migration: ${onlyMigration}`);
  console.log("Included production ledger baseline: 061, 062, 063, 064, 065");
}

if (!apply) console.log("Dry run only. No production schema changes will be applied.");
console.log(`Verified target project: ${targetProjectRef}`);

try {
  if (dbUrl) {
    const pushArgs = ["db", "push", "--db-url", dbUrl, ...(onlyMigration ? ["--include-all"] : [])];
    run([...pushArgs, "--dry-run"], commandRoot);
    if (apply) {
      if (process.env.WEBSITE_OS_MIGRATIONS_APPROVED !== "apply-production-website-os") {
        fail("Set WEBSITE_OS_MIGRATIONS_APPROVED=apply-production-website-os before applying.");
      }
      run(pushArgs, commandRoot);
    }
    process.exitCode = 0;
  } else {
    if (projectRef && dbPassword && accessToken) {
      run(["link", "--project-ref", projectRef, "--password", dbPassword], commandRoot);
    } else if (!linkedProjectRef || linkedProjectRef !== expectedProjectRef) {
      fail("Set SUPABASE_DB_URL, set project/password/access-token credentials, or authenticate and link the approved production project with Supabase CLI.");
    }
    const pushArgs = ["db", "push", "--linked", ...(onlyMigration ? ["--include-all"] : [])];
    run([...pushArgs, "--dry-run"], commandRoot);
    if (apply) {
      if (process.env.WEBSITE_OS_MIGRATIONS_APPROVED !== "apply-production-website-os") {
        fail("Set WEBSITE_OS_MIGRATIONS_APPROVED=apply-production-website-os before applying.");
      }
      run(pushArgs, commandRoot);
    }
  }
} finally {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
}
