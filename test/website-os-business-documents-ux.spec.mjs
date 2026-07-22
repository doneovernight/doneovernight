import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORTS = [320, 390, 430, 768, 1024, 1280, 1440];
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
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

async function openBusinessDocuments(page, role = "Owner") {
  await page.goto(`${baseUrl}/admin/website-os/commonpl4ce/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate((activeRole) => {
    const longTitle = "BOOKING POLICY / AN EXTRAORDINARILY LONG DOCUMENT TITLE THAT MUST WRAP WITHOUT WIDENING ITS LIBRARY OR EDITOR PANEL";
    const normalDocument = {
      id: "00000000-0000-4000-8000-000000000002", document_type: "booking_policy", title: longTitle,
      version_label: "1.0", status: "active", enabled: true, effective_date: "2026-07-20", language: "nl",
      internal_notes: "A very long internal note with https://doneovernight.com/an/extraordinarily/long/path/that/must/wrap/safely",
      body: `${longTitle}\n\nLong content remains inside the editor, preview and mobile sheet.`, revision: 3,
      published_version_id: "00000000-0000-4000-8000-000000000102", updated_at: "2026-07-20T12:00:00Z", system_evidence: false
    };
    const evidence = {
      id: "00000000-0000-4000-8000-000000000001", document_type: "custom", title: "Controlled acceptance record",
      version_label: "1.0", status: "archived", enabled: false, language: "nl", internal_notes: "system_acceptance_evidence",
      body: "Immutable evidence", revision: 1, published_version_id: "00000000-0000-4000-8000-000000000101",
      updated_at: "2026-07-19T12:00:00Z", system_evidence: true
    };
    state.authUser = { id: "00000000-0000-4000-8000-000000000900", email: "long.authorized.user@commonpl4ce.example", role: activeRole };
    state.businessLoaded = true;
    state.businessDocuments = [normalDocument, evidence];
    state.businessDocumentVersions = [
      { id: normalDocument.published_version_id, document_id: normalDocument.id, version_number: 1, version_label: "1.0", title: normalDocument.title, body: normalDocument.body, published_at: "2026-07-20T12:00:00Z" },
      { id: evidence.published_version_id, document_id: evidence.id, version_number: 1, version_label: "1.0", title: evidence.title, body: evidence.body, published_at: "2026-07-19T12:00:00Z" }
    ];
    state.businessDocumentWorkflows = [{ id: "workflow", document_id: normalDocument.id, destination: "booking_confirmation", enabled: true }];
    state.businessPolicies = [{ id: "policy", document_id: normalDocument.id, label: longTitle, policy_key: "booking_policy", requirement: "required", visibility: "customer_visible", enabled: true, display_order: 1, acceptance_contexts: ["booking"] }];
    state.businessPolicyAcceptances = [{ id: "acceptance", policy_id: "policy", booking_task_id: "acceptance-check", customer_name_snapshot: "Acceptance customer", accepted_version_number: 1, accepted_at: "2026-07-20T12:30:00Z" }];
    state.invoiceDocuments = [];
    state.selectedBusinessDocumentId = normalDocument.id;
    state.selectedBusinessPolicyId = "policy";
    state.documentStatusFilter = "active";
    state.activeBusinessTab = "documents";
    state.businessDocumentScreen = "list";
    document.body.classList.add("is-unlocked");
    switchView("documents");
  }, role);
}

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const tolerance = 1.5;
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const outside = (child, parent) => child.left < parent.left - tolerance || child.right > parent.right + tolerance;
    const workspace = document.querySelector('[data-business-workspace="documents"]');
    const workspaceRect = workspace.getBoundingClientRect();
    const panels = [...workspace.children].filter(visible);
    const violations = [];
    for (const panel of panels) {
      const parentRect = panel.getBoundingClientRect();
      panel.querySelectorAll("input,textarea,select,button,.document-library-row,.document-editor-head,.document-sticky-actions,.business-advanced,.document-preview").forEach((element) => {
        if (!visible(element)) return;
        if (outside(element.getBoundingClientRect(), parentRect)) violations.push(element.id || element.className || element.tagName);
      });
      if (outside(parentRect, workspaceRect)) violations.push("panel-outside-workspace");
    }
    const touchTargets = innerWidth <= 430 ? [...workspace.querySelectorAll("button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary")].filter(visible).map((element) => {
      const target = element.matches('input[type="checkbox"], input[type="radio"]') ? element.closest("label") || element : element;
      const rect = target.getBoundingClientRect();
      return { label: target.textContent?.trim().slice(0, 30) || element.name || element.tagName, width: rect.width, height: rect.height };
    }).filter((item) => item.width < 44 || item.height < 44) : [];
    return {
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      panels: panels.length,
      violations,
      touchTargets,
      evidenceInActive: document.querySelector("#businessDocumentList")?.textContent.includes("Controlled acceptance record") || false,
      stickyBottom: document.querySelector(".document-sticky-actions")?.getBoundingClientRect().bottom || 0,
      viewportHeight: innerHeight
    };
  });
}

test.beforeAll(async () => {
  server = createServer((request, response) => void serveFile(request, response));
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolveClose) => server.close(resolveClose));
});

test("Business Documents stays contained and thumb-safe across approved widths", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBusinessDocuments(page);
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of width <= 720 ? ["list", "editor"] : ["list"]) {
      await page.evaluate((value) => { state.businessDocumentScreen = value; renderBusinessWorkspace(); }, screen);
      const result = await layoutSnapshot(page);
      expect(result.documentWidth, `${width}px ${screen}: horizontal overflow`).toBeLessThanOrEqual(width);
      expect(result.violations, `${width}px ${screen}: panel/control containment`).toEqual([]);
      expect(result.touchTargets, `${width}px ${screen}: touch targets`).toEqual([]);
      expect(result.evidenceInActive, `${width}px: evidence hidden from Active`).toBe(false);
      if (width <= 430 && screen === "editor") {
        expect(result.stickyBottom, `${width}px ${screen}: sticky actions inside viewport`).toBeLessThanOrEqual(result.viewportHeight);
      }
    }
  }
});

test("Business Documents reflows continuously without refresh", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBusinessDocuments(page);
  for (let width = 1440; width >= 320; width -= 40) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 720) await page.evaluate(() => { state.businessDocumentScreen = "editor"; renderBusinessWorkspace(); });
    const result = await layoutSnapshot(page);
    expect(result.documentWidth, `${width}px resize overflow`).toBeLessThanOrEqual(width);
    expect(result.violations, `${width}px resize containment`).toEqual([]);
  }
});

test("Preview and acceptance sheets trap and restore keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBusinessDocuments(page);
  await page.evaluate(() => { state.businessDocumentScreen = "editor"; renderBusinessWorkspace(); });
  const previewButton = page.locator("[data-open-document-preview]");
  await previewButton.focus();
  await previewButton.click();
  const previewDialog = page.locator("#businessDocumentPreviewDialog");
  await expect(previewDialog).toHaveAttribute("aria-hidden", "false");
  const previewClose = previewDialog.locator("button").first();
  await expect(previewClose).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(previewClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(previewButton).toBeFocused();

  await page.evaluate(() => { state.activeBusinessTab = "policies"; state.businessPolicyScreen = "editor"; renderBusinessWorkspace(); });
  const historyButton = page.locator("[data-open-policy-acceptances]");
  await historyButton.focus();
  await historyButton.click();
  const historyDialog = page.locator("#businessAcceptanceDialog");
  await expect(historyDialog).toHaveAttribute("aria-hidden", "false");
  await page.keyboard.press("Escape");
  await expect(historyButton).toBeFocused();
});

test("Business Document role controls remain least-privilege", async ({ page }) => {
  for (const role of ["Owner", "Editor", "Viewer"]) {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openBusinessDocuments(page, role);
    const editorDisabled = await page.locator("#businessDocumentForm input[name=title]").isDisabled();
    const publishVisible = await page.locator("[data-publish-business-document]").count();
    const policyCreateDisabled = await page.locator("#addBusinessPolicy").isDisabled();
    if (role === "Owner") {
      expect(editorDisabled).toBe(false); expect(publishVisible).toBe(1); expect(policyCreateDisabled).toBe(false);
    } else if (role === "Editor") {
      expect(editorDisabled).toBe(false); expect(publishVisible).toBe(0); expect(policyCreateDisabled).toBe(true);
    } else {
      expect(editorDisabled).toBe(true); expect(publishVisible).toBe(0); expect(policyCreateDisabled).toBe(true);
    }
  }
});
