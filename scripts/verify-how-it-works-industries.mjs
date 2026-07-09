import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const EXPECTED_VERSION = "100-industries-v1";
const MIN_INDUSTRIES = 100;

const args = new Set(process.argv.slice(2));
const urlArg = process.argv.find((arg, index, all) => all[index - 1] === "--url");
const baseUrl = urlArg ? urlArg.replace(/\/$/, "") : "";
const isProduction = args.has("--production");
const root = process.cwd();

function fail(message, details = {}) {
  console.error(`[how-it-works industry guard] ${message}`);
  if (Object.keys(details).length) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
}

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  assert(response.ok, `${url} returned ${response.status}.`);
  return response.text();
}

function assetUrlFromHtml(html, assetPath) {
  const escaped = assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`["'](${escaped}[^"']*)["']`));
  return match ? match[1] : "";
}

function industriesFromConfig(source) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "experience/industry-config.js" });
  return Array.isArray(context.window.DONEOVERNIGHT_INDUSTRIES)
    ? context.window.DONEOVERNIGHT_INDUSTRIES
    : [];
}

function label(industry = {}) {
  return String(industry.label?.en || industry.name || industry.key || "").trim();
}

function normalizeSearch(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a = "", b = "") {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1]
        : Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
    }
    previous = current;
  }
  return previous[b.length];
}

function isFuzzyMatch(queryToken = "", token = "") {
  if (queryToken.length < 4 || token.length < 4) return false;
  if (token.includes(queryToken) || queryToken.includes(token)) return true;
  const max = Math.max(queryToken.length, token.length);
  const allowed = max < 7 ? 1 : 2;
  return levenshtein(queryToken, token) <= allowed;
}

function industrySearchScore(industry = {}, term = "") {
  const aliases = Array.isArray(industry.aliases) ? industry.aliases : [];
  const signals = Array.isArray(industry.signals) ? industry.signals : [];
  const fields = [
    industry.key,
    industry.category,
    label(industry),
    industry.summary?.en || "",
    ...signals,
    ...aliases
  ].map(normalizeSearch).filter(Boolean);
  const text = fields.join(" ");
  let score = 0;
  if (normalizeSearch(label(industry)) === term) score += 120;
  if (normalizeSearch(label(industry)).startsWith(term)) score += 90;
  if (fields.some((field) => field === term)) score += 80;
  if (fields.some((field) => field.startsWith(term))) score += 64;
  if (text.includes(term)) score += 44;
  const queryTokens = term.split(" ").filter(Boolean);
  const fieldTokens = text.split(" ").filter(Boolean);
  queryTokens.forEach((queryToken) => {
    fieldTokens.forEach((token) => {
      if (token === queryToken) score += 26;
      else if (token.startsWith(queryToken) || queryToken.startsWith(token)) score += 18;
      else if (isFuzzyMatch(queryToken, token)) score += 24;
    });
  });
  return score;
}

function searchIndustries(industries = [], query = "") {
  const term = normalizeSearch(query);
  return industries
    .map((industry, index) => ({ industry, index, score: industrySearchScore(industry, term) }))
    .filter((entry) => entry.score >= 18)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.industry);
}

const htmlPath = "/how-it-works";
const html = baseUrl
  ? await fetchText(`${baseUrl}${htmlPath}`)
  : await readText("how-it-works/index.html");

const configAsset = assetUrlFromHtml(html, "/experience/industry-config.js");
assert(configAsset, "how-it-works does not import /experience/industry-config.js.");
assert(html.includes(`data-industry-version="${EXPECTED_VERSION}"`), "Current industry version marker is missing.", { expected: EXPECTED_VERSION });
assert(html.includes("Choose your industry."), "Step 05 copy is missing: Choose your industry.");
assert(!html.includes("Choose a world."), "Legacy Step 05 copy returned: Choose a world.");

const configSource = baseUrl
  ? await fetchText(`${baseUrl}${configAsset}`)
  : await readText(configAsset.replace(/^\//, "").replace(/\?.*$/, ""));

const industries = industriesFromConfig(configSource);
const labels = industries.map(label);
const normalizedLabels = new Set(labels.map(normalizeSearch));

assert(industries.length >= MIN_INDUSTRIES, "Industry count is below the required minimum.", {
  expectedAtLeast: MIN_INDUSTRIES,
  actual: industries.length
});
["Industrial", "Infrastructure", "Legal"].forEach((required) => {
  assert(normalizedLabels.has(normalizeSearch(required)), `Required industry is missing: ${required}.`);
});

const bridgeLabels = searchIndustries(industries, "bridge").slice(0, 8).map(label);
assert(bridgeLabels.includes("Infrastructure"), "Search for bridge does not return Infrastructure.", { results: bridgeLabels });
assert(bridgeLabels.includes("Civil engineering"), "Search for bridge does not return Civil Engineering.", { results: bridgeLabels });

const industrialLabels = searchIndustries(industries, "industrial").slice(0, 8).map(label);
assert(industrialLabels.includes("Industrial"), "Search for industrial does not return Industrial.", { results: industrialLabels });

if (isProduction) {
  assert(baseUrl, "--production requires --url.");
  console.log("[how-it-works industry guard] production verification passed");
} else {
  console.log("[how-it-works industry guard] local verification passed");
}
console.log(JSON.stringify({
  url: baseUrl || "local",
  version: EXPECTED_VERSION,
  industryCount: industries.length,
  bridgeResults: bridgeLabels,
  industrialResults: industrialLabels
}, null, 2));
