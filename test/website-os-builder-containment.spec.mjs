import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORTS = [320, 375, 390, 430, 680, 720, 768, 900, 1024, 1080, 1081, 1180, 1280, 1440, 1600];
const SECTION_IDS = ["hero", "story", "what-we-create", "novateur", "process", "booking", "faq", "footer"];
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

let server;
let baseUrl;

async function serveFile(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let filePath = resolve(ROOT, `.${requestPath}`);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

async function openBuilder(page) {
  await page.goto(`${baseUrl}/admin/website-os/commonpl4ce/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const longHeading = "NOVATEUR / SELECTED CLIENT WITH AN EXTRAORDINARILY LONG EDITORIAL CAMPAIGN TITLE THAT MUST STAY CONTAINED";
    const longUrl = "https://doneovernight.com/a/very/long/unbroken/path/that/must/not/push/the/preview/or/editor/outside/its/assigned/column";
    const longCopy = `${longHeading}\n${longUrl}\nInternal production notes remain readable without forcing a panel wider than its assigned card.`;
    state.authUser = {
      email: "very.long.authorized.editor.address.for.commonpl4ce@extraordinarily-long-production-domain.example",
      role: "owner"
    };
    state.contentDraftLastEditor = state.authUser;
    state.contentDraftLastSavedAt = new Date("2026-07-20T12:37:00+02:00").toISOString();
    state.builder = defaultBuilderDraft();
    state.builder.sections.forEach((section) => {
      section.heading = longHeading;
      section.body = longCopy;
      section.secondaryBody = longCopy;
      section.internalNotes = longCopy;
      section.ctaLabel = "A VERY LONG BUT VALID CALL TO ACTION LABEL";
      if (section.type !== "Booking CTA") section.ctaLink = longUrl;
      if (section.type === "FAQ") {
        section.questions[0].question = `${longHeading} ${longUrl}`;
        section.questions[0].answer = longCopy;
      }
    });
    document.body.classList.add("is-unlocked");
    switchView("website");
    switchWebsiteTab("builder");
    setBuilderSaveState("Draft saved to workspace");
  });
}

async function selectSection(page, sectionId) {
  await page.evaluate((id) => {
    state.builder.selectedSectionId = id;
    renderSectionBuilder();
    setBuilderSaveState("Draft saved to workspace");
  }, sectionId);
}

async function containmentSnapshot(page) {
  return page.evaluate(() => {
    const tolerance = 1.5;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const outside = (child, parent) => child.left < parent.left - tolerance || child.right > parent.right + tolerance;
    const grid = document.querySelector(".builder-grid");
    const workspace = document.querySelector('[data-website-tab="builder"]');
    const panels = [...grid.children].filter(visible);
    const violations = [];
    const selectors = [
      ".builder-head", ".builder-save-summary", ".builder-state", ".builder-section-item",
      ".builder-editor-grid", ".builder-editor-grid .field", ".builder-editor-grid input",
      ".builder-editor-grid textarea", ".builder-editor-grid select", ".builder-editor-grid button",
      ".builder-editor-grid .form-note", ".builder-editor-grid .empty-state", ".faq-editor-item",
      ".faq-editor-head", ".faq-editor-actions", "#builderPreview", ".draft-preview-card"
    ].join(",");
    panels.forEach((panel, panelIndex) => {
      const parentRect = rect(panel);
      panel.querySelectorAll(selectors).forEach((element) => {
        if (!visible(element)) return;
        const childRect = rect(element);
        if (outside(childRect, parentRect)) {
          violations.push({ panelIndex, selector: element.id ? `#${element.id}` : element.className || element.tagName, childRect, parentRect });
        }
        if (element.matches("input, textarea, select")) {
          const field = element.closest(".field");
          if (field && outside(childRect, rect(field))) {
            violations.push({ panelIndex, selector: `${element.tagName} outside field`, childRect, parentRect: rect(field) });
          }
        }
      });
    });
    const overlaps = [];
    panels.forEach((first, firstIndex) => panels.slice(firstIndex + 1).forEach((second, offset) => {
      const a = rect(first);
      const b = rect(second);
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > tolerance && overlapY > tolerance) overlaps.push([firstIndex, firstIndex + offset + 1, overlapX, overlapY]);
    }));
    const gridRect = rect(grid);
    const workspaceRect = rect(workspace);
    return {
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      gridOutsideWorkspace: outside(gridRect, workspaceRect),
      violations,
      overlaps,
      visiblePanels: panels.length,
      panelRects: panels.map(rect),
      mobileSwitchVisible: visible(document.querySelector(".mobile-builder-switch")),
      editorStatus: document.querySelector("#builderStorageState")?.textContent,
      editorStatusLabel: document.querySelector("#builderStorageState")?.getAttribute("aria-label")
    };
  });
}

test.beforeAll(async () => {
  server = createServer((request, response) => void serveFile(request, response));
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise((resolveClose) => server.close(resolveClose));
});

test("Builder panels remain contained across sections and responsive widths", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBuilder(page);

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 1000 });
    for (const sectionId of SECTION_IDS) {
      await selectSection(page, sectionId);
      if (width <= 720) {
        for (const pane of ["sections", "editor", "preview"]) {
          await page.evaluate((value) => setMobileBuilderPane(value), pane);
          const snapshot = await containmentSnapshot(page);
          expect(snapshot.documentWidth, `${width}px ${sectionId} ${pane}: page overflow`).toBeLessThanOrEqual(width);
          expect(snapshot.mobileSwitchVisible, `${width}px: mobile pane switch`).toBe(true);
          expect(snapshot.visiblePanels, `${width}px ${pane}: one active pane`).toBe(1);
          expect(snapshot.gridOutsideWorkspace, `${width}px ${sectionId} ${pane}: grid containment`).toBe(false);
          expect(snapshot.violations, `${width}px ${sectionId} ${pane}: child containment`).toEqual([]);
          expect(snapshot.overlaps, `${width}px ${sectionId} ${pane}: panel overlap`).toEqual([]);
        }
      } else {
        const snapshot = await containmentSnapshot(page);
        expect(snapshot.documentWidth, `${width}px ${sectionId}: page overflow`).toBeLessThanOrEqual(width);
        expect(snapshot.visiblePanels, `${width}px: all Builder panels visible`).toBe(3);
        expect(snapshot.gridOutsideWorkspace, `${width}px ${sectionId}: grid containment`).toBe(false);
        expect(snapshot.violations, `${width}px ${sectionId}: child containment`).toEqual([]);
        expect(snapshot.overlaps, `${width}px ${sectionId}: panel overlap`).toEqual([]);
        expect(["Saved", "Opgeslagen"], `${width}px: compact save state`).toContain(snapshot.editorStatus);
        expect(snapshot.editorStatusLabel, `${width}px: full accessible save state`).toContain("very.long.authorized.editor.address");
      }
    }
  }
});

test("Builder reflows continuously and preserves phone pane behavior", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openBuilder(page);
  await selectSection(page, "novateur");
  for (let width = 1600; width >= 320; width -= 40) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 720) await page.evaluate(() => setMobileBuilderPane("editor"));
    const snapshot = await containmentSnapshot(page);
    expect(snapshot.documentWidth, `${width}px resize: page overflow`).toBeLessThanOrEqual(width);
    expect(snapshot.gridOutsideWorkspace, `${width}px resize: grid containment`).toBe(false);
    expect(snapshot.violations, `${width}px resize: child containment`).toEqual([]);
    expect(snapshot.overlaps, `${width}px resize: panel overlap`).toEqual([]);
  }
  for (let width = 320; width <= 1600; width += 40) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 720) await page.evaluate(() => setMobileBuilderPane("preview"));
    const snapshot = await containmentSnapshot(page);
    expect(snapshot.documentWidth, `${width}px reverse resize: page overflow`).toBeLessThanOrEqual(width);
    expect(snapshot.violations, `${width}px reverse resize: child containment`).toEqual([]);
    expect(snapshot.overlaps, `${width}px reverse resize: panel overlap`).toEqual([]);
  }
});

test("Builder contains long content at effective browser zoom widths", async ({ page }) => {
  const physicalWidth = 1280;
  await page.setViewportSize({ width: physicalWidth, height: 900 });
  await openBuilder(page);
  await selectSection(page, "faq");
  for (const zoomPercent of [80, 100, 125, 150, 200]) {
    const effectiveCssWidth = Math.round(physicalWidth / (zoomPercent / 100));
    await page.setViewportSize({ width: effectiveCssWidth, height: 900 });
    if (effectiveCssWidth <= 720) await page.evaluate(() => setMobileBuilderPane("editor"));
    const snapshot = await containmentSnapshot(page);
    expect(snapshot.documentWidth, `${zoomPercent}% zoom: page overflow`).toBeLessThanOrEqual(effectiveCssWidth);
    expect(snapshot.gridOutsideWorkspace, `${zoomPercent}% zoom: grid containment`).toBe(false);
    expect(snapshot.violations, `${zoomPercent}% zoom: child containment`).toEqual([]);
    expect(snapshot.overlaps, `${zoomPercent}% zoom: panel overlap`).toEqual([]);
  }
});
