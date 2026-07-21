import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
let server;
let baseUrl;

async function serveFile(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let filePath = resolve(ROOT, `.${requestPath}`);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) return response.writeHead(403).end("Forbidden");
  try {
    if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, "index.html");
    response.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end("Not found");
  }
}

async function openWorkspace(page) {
  await page.goto(`${baseUrl}/admin/website-os/commonpl4ce/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const today = workspaceDateKey();
    const booking = {
      id: "booking-dialog-test",
      taskId: "DON-2026-90001",
      name: "Dialog Test",
      email: "dialog@example.invalid",
      brandCompany: "COMMONPL4CE",
      projectType: "Campaign",
      location: "Amsterdam",
      preferredDate: `${today} 23:45`,
      scheduledTime: "23:45",
      status: "Confirmed",
      taskStatus: "confirmed",
      isTest: false,
      isTrashed: false,
      outstandingActions: []
    };
    state.authUser = { id: "user-dialog-test", role: "Owner", email: "owner@example.invalid" };
    state.bookings = [booking];
    state.allBookings = [booking];
    state.todayBriefingDate = today;
    state.todayBriefingLoaded = true;
    state.businessLoaded = true;
    state.businessDocuments = [{
      id: "00000000-0000-4000-8000-000000000002",
      document_type: "booking_policy",
      title: "Booking Policy",
      body: "Approved copy",
      version_label: "1.0",
      revision: 1,
      status: "active",
      enabled: true,
      system_evidence: false
    }];
    state.selectedBusinessDocumentId = state.businessDocuments[0].id;
    state.businessPolicies = [{ id: "policy-dialog-test", document_id: state.businessDocuments[0].id, label: "Booking Policy", acceptance_contexts: ["booking"] }];
    state.selectedBusinessPolicyId = "policy-dialog-test";
    document.body.classList.add("is-unlocked");
    renderBusinessWorkspace();
  });
}

async function expectDialogOpen(page, id) {
  const overlay = page.locator(id);
  await expect(overlay).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("body")).toHaveClass(/has-open-dialog/);
  expect(await page.locator(".os-header").evaluate((element) => element.inert)).toBe(true);
  await expect.poll(() => overlay.evaluate((element) => element.contains(document.activeElement))).toBe(true);
}

async function expectDialogClosed(page, id, returnFocusId) {
  await expect(page.locator(id)).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("body")).not.toHaveClass(/has-open-dialog/);
  expect(await page.locator(".os-header").evaluate((element) => element.inert)).toBe(false);
  if (returnFocusId) await expect(page.locator(returnFocusId)).toBeFocused();
}

test.beforeAll(async () => {
  server = createServer((request, response) => void serveFile(request, response));
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolveClose) => server.close(resolveClose));
});

test("all Website OS dialogs share focus, Escape, inert background and restoration", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  const returnFocus = "#mobileMoreButton";

  const cases = [
    { id: "#newBookingDialog", open: "openNewBookingDialog()" },
    { id: "#customerDialog", open: "openCustomerDialog()" },
    { id: "#invoiceDialog", open: "openInvoiceDialog('booking-dialog-test')" }
  ];
  for (const item of cases) {
    await page.locator(returnFocus).focus();
    await page.evaluate((expression) => Function(expression)(), item.open);
    await expectDialogOpen(page, item.id);
    const focusables = page.locator(`${item.id} button:not([disabled]), ${item.id} [href], ${item.id} input:not([disabled]), ${item.id} select:not([disabled]), ${item.id} textarea:not([disabled]), ${item.id} [tabindex]:not([tabindex='-1'])`);
    await focusables.last().focus();
    await page.keyboard.press("Tab");
    await expect(focusables.first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expectDialogClosed(page, item.id, returnFocus);
  }

  await page.locator(returnFocus).focus();
  await page.evaluate(() => openTodayBriefing({ force: true }));
  await expectDialogOpen(page, "#todayBriefingDialog");
  await page.keyboard.press("Escape");
  await expectDialogClosed(page, "#todayBriefingDialog", returnFocus);

  await page.locator(returnFocus).focus();
  await page.evaluate(() => openBusinessDialog("preview", document.getElementById("mobileMoreButton")));
  await expectDialogOpen(page, "#businessDocumentPreviewDialog");
  await page.keyboard.press("Escape");
  await expectDialogClosed(page, "#businessDocumentPreviewDialog", returnFocus);

  await page.locator(returnFocus).focus();
  await page.evaluate(() => openBusinessDialog("acceptances", document.getElementById("mobileMoreButton")));
  await expectDialogOpen(page, "#businessAcceptanceDialog");
  await page.keyboard.press("Escape");
  await expectDialogClosed(page, "#businessAcceptanceDialog", returnFocus);

  await page.locator(returnFocus).focus();
  await page.evaluate(() => { window.__confirmationResult = null; askConfirmation({ title: "Confirm", body: "Accessible confirmation" }).then((value) => { window.__confirmationResult = value; }); });
  await expectDialogOpen(page, "#confirmDialog");
  await page.keyboard.press("Escape");
  await expectDialogClosed(page, "#confirmDialog", returnFocus);
  await expect.poll(() => page.evaluate(() => window.__confirmationResult)).toBe(false);

  await page.locator(returnFocus).focus();
  await page.evaluate(() => openNewBookingDialog());
  const nestedReturnFocus = "#newBookingDialog .panel-head [data-close-new-booking]";
  await page.locator(nestedReturnFocus).focus();
  await page.evaluate(() => { window.__nestedConfirmationResult = null; askConfirmation({ title: "Confirm", body: "Nested confirmation" }).then((value) => { window.__nestedConfirmationResult = value; }); });
  await expectDialogOpen(page, "#confirmDialog");
  await page.keyboard.press("Escape");
  await expect(page.locator("#newBookingDialog")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("body")).toHaveClass(/has-open-dialog/);
  await expect(page.locator(nestedReturnFocus)).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__nestedConfirmationResult)).toBe(false);
  await page.keyboard.press("Escape");
  await expectDialogClosed(page, "#newBookingDialog", returnFocus);

  await page.locator("#mobileMoreButton").click();
  await expectDialogOpen(page, "#mobileMoreBackdrop");
  await page.keyboard.press("Escape");
  await expectDialogClosed(page, "#mobileMoreBackdrop", "#mobileMoreButton");
});
