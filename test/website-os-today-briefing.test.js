const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Today Briefing migration persists user, booking and Amsterdam-date dismissal state", () => {
  const migration = read("supabase/migrations/064_website_os_today_briefing.sql");
  assert.match(migration, /create table if not exists public\.website_os_today_briefing_dismissals/);
  assert.match(migration, /unique \(workspace_id, user_id, booking_task_id, briefing_date\)/);
  assert.match(migration, /now\(\) \+ interval '60 minutes'/);
  assert.match(migration, /website_os_save_today_briefing_state/);
  assert.match(migration, /website_os_users[\s\S]*workspace_id = p_workspace_id[\s\S]*active = true/);
  assert.match(migration, /task_requests[\s\S]*website_os_workspace_id = p_workspace_id[\s\S]*task_id = p_booking_task_id/);
  assert.match(migration, /website_os_audit_events/);
  assert.match(migration, /revoke all privileges on table public\.website_os_today_briefing_dismissals from anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
});

test("Today Briefing API derives scope and date server-side", () => {
  const api = read("api/task-submit.js");
  assert.match(api, /const COMMONPLACE_TIME_ZONE = "Europe\/Amsterdam"/);
  assert.match(api, /isWebsiteOsTodayBriefingRequest/);
  assert.match(api, /assertWebsiteOsAdminHost\(req\)/);
  assert.match(api, /assertWebsiteOsRequestOrigin\(req\)/);
  assert.match(api, /requireWebsiteOsSession\(req, \{[\s\S]*roles: \["Owner", "Admin", "Editor", "Viewer"\]/);
  assert.match(api, /const briefingDate = currentCommonplaceDate\(\)/);
  assert.match(api, /workspace_id=eq\.\$\{encodeURIComponent\(current\.workspace\.id\)\}/);
  assert.match(api, /user_id=eq\.\$\{encodeURIComponent\(current\.user\.id\)\}/);
  assert.match(api, /rpc\/website_os_save_today_briefing_state/);
});

test("Website OS exposes an accessible, exact-record, multi-booking Today Briefing", () => {
  const ui = read("admin/website-os/commonpl4ce/index.html");
  assert.match(ui, /id="todayBriefingCard"/);
  assert.match(ui, /id="todayNavButton"/);
  assert.match(ui, /id="mobileTodayBadge"/);
  assert.match(ui, /id="todayBriefingDialog"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(ui, /const WORKSPACE_TIME_ZONE = "Europe\/Amsterdam"/);
  assert.match(ui, /function todayBookings\(\)/);
  assert.match(ui, /booking\.isTest \|\| booking\.isTrashed/);
  assert.match(ui, /"cancelled", "canceled", "declined", "rejected", "no_longer_proceeding", "archived", "trashed"/);
  assert.match(ui, /\["completed", "delivered"\][\s\S]*!booking\.followUpRequired/);
  assert.match(ui, /data-today-briefing-step/);
  assert.match(ui, /todayBriefingTouchStartX/);
  assert.match(ui, /handleTodayBriefingKeydown/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /openBooking\(booking\.id\)/);
  assert.match(ui, /customerForBooking\(bookingReference\(booking\)\)/);
  assert.match(ui, /activeInvoiceForBooking\(bookingReference\(booking\)\)/);
  assert.match(ui, /refreshTodayBriefing\(\{ allowAutoOpen: true \}\)/);
  assert.doesNotMatch(ui, /localStorage[^\n]+today[_-]?briefing/i);
});

test("Amsterdam date boundaries remain stable across summer and winter offsets", () => {
  const dateKey = (value) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };
  assert.equal(dateKey("2026-07-19T21:59:00.000Z"), "2026-07-19");
  assert.equal(dateKey("2026-07-19T22:01:00.000Z"), "2026-07-20");
  assert.equal(dateKey("2026-01-19T23:01:00.000Z"), "2026-01-20");
  const ui = read("admin/website-os/commonpl4ce/index.html");
  assert.match(ui, /followUpRequired:[^\n]+outstandingActions\.some/);
});

test("Today Briefing executable scripts parse", () => {
  const html = read("admin/website-os/commonpl4ce/index.html");
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/src=|application\/json|application\/ld\+json/i.test(match[1]))
    .map((match) => match[2]);
  scripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `inline script ${index + 1}`));
});
