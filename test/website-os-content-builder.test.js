const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("content migration provides workspace drafts, atomic versions and persistent media", () => {
  const migration = read("supabase/migrations/061_website_os_content_builder.sql");
  [
    "website_os_content_drafts",
    "website_os_content_versions",
    "website_os_content_state",
    "website_os_media_assets"
  ].forEach((table) => assert.match(migration, new RegExp(`create table if not exists public\\.${table}`)));
  assert.match(migration, /website_os_save_content_draft/);
  assert.match(migration, /CONTENT_DRAFT_CONFLICT/);
  assert.match(migration, /website_os_publish_content/);
  assert.match(migration, /website_os_rollback_content/);
  assert.match(migration, /for update/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /website-os-media/);
});

test("migration imports the complete live FAQ in order and keeps booking on cp-book", () => {
  const migration = read("supabase/migrations/061_website_os_content_builder.sql");
  const questions = [
    "What kind of projects do you usually work on?",
    "Do I need a complete concept before contacting you?",
    "How does a project usually work?",
    "How long does delivery take?",
    "Why invest in professional photography?",
    "Can you travel?",
    "How is pricing determined?",
    "What happens after I book?"
  ];
  let cursor = -1;
  questions.forEach((question) => {
    const index = migration.indexOf(question);
    assert.ok(index > cursor, `${question} should retain its live order`);
    cursor = index;
  });
  assert.match(migration, /'id','faq'.*'defaultOpenId','faq-1'/s);
  assert.match(migration, /'id','booking'.*'ctaLink','https:\/\/doneovernight\.com\/cp-book'/s);
});

test("content API enforces session roles, optimistic revisions and atomic publish confirmation", () => {
  const api = read("api/task-submit.js");
  const conflictMigration = read("supabase/migrations/062_website_os_content_conflict_errors.sql");
  assert.match(api, /searchParams\.get\("commonpl4ce_content"\) === "1"/);
  assert.match(api, /requireWebsiteOsSession\(req, \{ slug: COMMONPLACE_CONTENT_WORKSPACE_SLUG/);
  assert.match(api, /p_expected_revision: expectedRevision/);
  assert.match(api, /PUBLISH_COMMONPL4CE/);
  assert.match(api, /ROLLBACK_COMMONPL4CE/);
  assert.match(api, /CONTENT_LOCAL_MEDIA_BLOCKED/);
  assert.match(api, /workspace_id=eq\.\$\{encodeURIComponent\(context\.workspace\.id\)\}/);
  assert.match(api, /COMMONPLACE_CONTENT_MEDIA_BUCKET/);
  assert.match(conflictMigration, /CONTENT_DRAFT_CONFLICT'.*errcode = 'P0001'/s);
  assert.doesNotMatch(conflictMigration, /CONTENT_DRAFT_CONFLICT'.*errcode = '40001'/s);
});

test("Website OS exposes FAQ, section-specific editors, server drafts and version rollback", () => {
  const ui = read("admin/website-os/commonpl4ce/index.html");
  assert.match(ui, /createBuilderSection\("FAQ", "FAQ"/);
  assert.match(ui, /data-faq-action="add"/);
  assert.match(ui, /data-faq-action="duplicate"/);
  assert.match(ui, /No default-open item/);
  assert.match(ui, /COMMONPLACE_CONTENT_API/);
  assert.match(ui, /persistBuilderDraft/);
  assert.match(ui, /contentDraftRevision/);
  assert.match(ui, /Full-page Draft Preview/);
  assert.match(ui, /data-content-rollback/);
  assert.match(ui, /Public booking destination: https:\/\/doneovernight\.com\/cp-book/);
  assert.match(ui, /overflow-wrap: anywhere/);
  assert.match(ui, /builderFromSiteConfig\(published, state\.builder\.mediaLibrary, state\.builder\)\.sections\.map\(comparableSection\)/);
});

test("public CP hydrates only published content and retains static fallback markup", () => {
  const page = read("cp/index.html");
  assert.match(page, /Questions worth answering\./);
  assert.match(page, /data-cp-section="faq"/);
  assert.match(page, /commonpl4ce_site_config=1/);
  assert.match(page, /renderFaq\(section\)/);
  assert.match(page, /item\.enabled !== false/);
  assert.match(page, /section\.defaultOpenId/);
  assert.match(page, /data-cp-booking-link/);
  assert.match(page, /https:\/\/doneovernight\.com\/cp-book/);
  assert.match(page, /\.catch\(function \(\) \{\}\)/);
});

test("all changed inline scripts parse", () => {
  ["admin/website-os/commonpl4ce/index.html", "cp/index.html"].forEach((file) => {
    const html = read(file);
    const scripts = [...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
    scripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `${file} script ${index + 1}`));
  });
});
