const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const bookingStatus = require("../assets/common-place/website-os-booking-status");
const websiteOsPath = path.join(__dirname, "..", "admin", "website-os", "commonpl4ce", "index.html");

test("Website OS booking status mapping uses the required calendar groups", () => {
  ["new", "requested", "pending", "contacted", "quote_sent"].forEach((status) => {
    assert.equal(bookingStatus.group(status), "pending");
  });
  ["confirmed", "accepted", "scheduled", "project_active"].forEach((status) => {
    assert.equal(bookingStatus.group(status), "confirmed");
  });
  ["cancelled", "declined", "rejected", "no_longer_proceeding"].forEach((status) => {
    assert.equal(bookingStatus.group(status), "cancelled");
  });
  ["completed", "archived"].forEach((status) => {
    assert.equal(bookingStatus.group(status), "neutral");
  });
});

test("Website OS preserves cancelled and declined as exact visible statuses", () => {
  assert.equal(bookingStatus.status("cancelled"), "Cancelled");
  assert.equal(bookingStatus.status("rejected"), "Declined");
  assert.equal(bookingStatus.status("completed"), "Completed");
  assert.equal(bookingStatus.status("archived"), "Archived");
});

test("calendar summary keeps multiple booking status groups on one date", () => {
  const summary = bookingStatus.summarize(["new", "confirmed", "cancelled", "archived", "confirmed"]);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.groups.map(({ group, count }) => [group, count]), [
    ["pending", 1],
    ["confirmed", 2],
    ["cancelled", 1],
    ["neutral", 1]
  ]);
});

test("calendar renders persisted status dots with accessible non-color context", () => {
  const source = fs.readFileSync(websiteOsPath, "utf8");
  assert.match(source, /calendar-status-indicators/);
  assert.match(source, /calendar-status-dot/);
  assert.match(source, /bookingStatusSummary/);
  assert.match(source, /title="\$\{escapeHTML\(statusSummary\)\}"/);
  assert.match(source, /booking-status-pill/);
  assert.match(source, /renderOperationalDashboard\(\);\s*await loadBookings/);
});
