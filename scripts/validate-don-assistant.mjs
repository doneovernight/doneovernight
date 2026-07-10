import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "components/don-assistant/don-assistant.js",
  "components/don-assistant/state-machine.js",
  "components/don-assistant/bubble.js",
  "components/don-assistant/motion-controller.js",
  "components/don-assistant/accessibility-controller.js",
  "components/don-assistant/styles.css",
  "labs/don-assistant/index.html",
  "labs/don-assistant/lab.js",
  "labs/don-assistant/lab.css",
  "docs/website/DONEOVERNIGHT-WEBSITE-CONSTITUTION.md",
  "docs/website/current-site-inventory.md",
  "docs/website/rollback-plan.md",
  "docs/website/don-assistant-spec.md",
  "outputs/don-assistant-prototype-summary.md"
];

for (const file of requiredFiles) {
  const stat = await fs.stat(path.join(root, file));
  assert.ok(stat.isFile() && stat.size > 0, `${file} must exist and be non-empty`);
}

const preview = await fs.readFile(path.join(root, "labs/don-assistant/index.html"), "utf8");
const robots = await fs.readFile(path.join(root, "robots.txt"), "utf8");
const sitemap = await fs.readFile(path.join(root, "sitemap.xml"), "utf8");
assert.match(preview, /meta name="robots" content="noindex, nofollow, noarchive"/);
assert.match(robots, /Disallow: \/labs\//);
assert.doesNotMatch(sitemap, /labs\/don-assistant/);
assert.match(preview, /assets\/doneovernight-wordmark\.svg/);
assert.match(preview, /doneovernight-footer-watermark/);

console.log(`DON Assistant validation passed: ${requiredFiles.length} required artifacts checked.`);
