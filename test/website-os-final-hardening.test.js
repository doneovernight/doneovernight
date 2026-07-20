const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("hardening migration reconciles persistent modules and removes public write privileges", () => {
  const migration = read("supabase/migrations/063_website_os_final_hardening.sql");
  [
    "website_os_message_threads",
    "website_os_messages",
    "website_os_email_templates",
    "website_os_email_sends",
    "website_os_portfolio_projects",
    "website_os_portfolio_media",
    "website_os_acceptance_fixtures",
    "website_os_auth_rate_limits",
    "website_os_auth_events"
  ].forEach((table) => assert.match(migration, new RegExp(`create table if not exists public\\.${table}`)));
  assert.match(migration, /drop policy if exists "Allow public update task requests"/);
  assert.match(migration, /revoke insert, update, delete, truncate on table public\.task_requests from anon, authenticated/);
  assert.match(migration, /add column if not exists website_os_workspace_id uuid references public\.website_os_workspaces/);
  assert.match(migration, /task_requests_commonpl4ce_workspace_required/);
  assert.match(migration, /revoke all privileges on table public\.%I from anon, authenticated/);
  assert.match(migration, /website_os_commonpl4ce_analytics_summary/);
  assert.match(migration, /website_os_register_public_ingest/);
  assert.match(migration, /session_revoked/);
});

test("Website OS auth has server rate limits, origin checks, audit events and device sessions", () => {
  const auth = read("lib/website-os-auth.js");
  const api = read("api/task-submit.js");
  assert.match(auth, /assertWebsiteOsRequestOrigin/);
  assert.match(auth, /website_os_register_auth_attempt/);
  assert.match(auth, /website_os_auth_events/);
  assert.match(auth, /user_agent:/);
  assert.match(auth, /ip_hash:/);
  assert.match(auth, /async function listWebsiteOsSessions/);
  assert.match(auth, /async function revokeWebsiteOsSession/);
  assert.match(api, /action === "sessions"/);
  assert.match(api, /action === "revoke_session"/);
});

test("public ingestion is scoped, rate limited and reads the published Website OS state", () => {
  const api = read("api/task-submit.js");
  assert.match(api, /const config = await readPublishedCommonplaceConfig\(\)/);
  assert.match(api, /scope: "commonpl4ce_booking"/);
  assert.match(api, /scope: "commonpl4ce_newsletter"/);
  assert.match(api, /scope: "commonpl4ce_analytics"/);
  assert.match(api, /NEWSLETTER_DISABLED/);
  assert.match(api, /consentVersion: "commonpl4ce_newsletter_consent_v1"/);
  assert.match(api, /duplicate: true/);
  assert.match(api, /analytics_disabled/);
  assert.match(api, /website_os_workspace_id=eq\.\$\{encodeURIComponent\(workspace\.id\)\}/);
});

test("content and media hardening validates URLs, decoded images and server-derived usage", () => {
  const api = read("api/task-submit.js");
  assert.match(api, /function assertSafeContentUrl/);
  assert.match(api, /CONTENT_URL_INVALID/);
  assert.match(api, /sharp\(/);
  assert.match(api, /rotate\(\)/);
  assert.match(api, /COMMONPLACE_CONTENT_MAX_MEDIA_BYTES/);
  assert.match(api, /function collectCommonplaceMediaUsage/);
  assert.match(api, /async function syncCommonplaceMediaUsage/);
  assert.match(api, /CONTENT_LOCAL_MEDIA_BLOCKED/);
});

test("public CP restores scoped analytics, newsletter and shared booking availability", () => {
  const cp = read("cp/index.html");
  const book = read("cp-book/index.html");
  assert.match(cp, /cp-newsletter-popup/);
  assert.match(cp, /commonpl4ce_newsletter_signup/);
  assert.match(cp, /source:\s*['"]commonpl4ce['"]/);
  assert.match(cp, /applyBookingAvailability/);
  assert.match(cp, /commonpl4ce_site_config=1/);
  assert.match(book, /commonpl4ce_booker_v1/);
  assert.match(book, /__commonplaceConfigPromise/);
});

test("Website OS mobile shell exposes thumb-zone navigation and touch-sized controls", () => {
  const ui = read("admin/website-os/commonpl4ce/index.html");
  assert.match(ui, /mobile-bottom-nav/);
  assert.match(ui, /mobile-action-bar/);
  assert.match(ui, /mobile-more-sheet/);
  assert.match(ui, /min-height:\s*44px/);
  assert.match(ui, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(ui, /data-mobile-builder-pane/);
  assert.match(ui, /data-mobile-action="\$\{action\}"/);
  assert.match(ui, /data-revoke-session/);
});

test("deployment build runs the full suite and admin routes carry defense headers", () => {
  const pkg = JSON.parse(read("package.json"));
  const vercel = read("vercel.json");
  assert.equal(pkg.scripts["vercel-build"], "npm test");
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(vercel, /frame-ancestors 'none'/);
  assert.match(vercel, /X-Frame-Options/);
  assert.match(vercel, /X-Content-Type-Options/);
  assert.match(vercel, /Referrer-Policy/);
  assert.match(vercel, /Permissions-Policy/);
});

test("all COMMONPL4CE executable inline scripts parse after hardening", () => {
  ["admin/website-os/commonpl4ce/index.html", "cp/index.html", "cp-book/index.html"].forEach((file) => {
    const html = read(file);
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((match) => !/src=|application\/json|application\/ld\+json/i.test(match[1]))
      .map((match) => match[2]);
    scripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `${file} script ${index + 1}`));
  });
});
