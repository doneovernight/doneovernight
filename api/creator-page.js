const fs = require("node:fs");
const path = require("node:path");

const SUPABASE_TIMEOUT_MS = 10_000;
const DEFAULT_CREATOR_SLUG = "mosyaamosya";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSlug(value) {
  return clean(value || DEFAULT_CREATOR_SLUG)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || DEFAULT_CREATOR_SLUG;
}

function getQuery(req) {
  const parsed = new URL(req.url || "/", "https://doneovernight.local");
  return {
    ...(req.query || {}),
    ...Object.fromEntries(parsed.searchParams.entries())
  };
}

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(body);
}

function supabaseConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url, serviceRoleKey, configured: Boolean(url && serviceRoleKey) };
}

async function creatorExists(slug) {
  if (slug === DEFAULT_CREATOR_SLUG || slug === "mina") return true;
  const { url, serviceRoleKey, configured } = supabaseConfig();
  if (!configured) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  try {
    const response = await fetch(
      url + "/rest/v1/creators?slug=eq." + encodeURIComponent(slug) + "&select=slug&limit=1",
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: "Bearer " + serviceRoleKey,
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );
    if (!response.ok) return false;
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } finally {
    clearTimeout(timeout);
  }
}

function enginePath(surface) {
  return surface === "admin"
    ? path.join(process.cwd(), "admin", "mosyaamosya", "index.html")
    : path.join(process.cwd(), "mosyaamosya", "index.html");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "Method not allowed");
  }
  const query = getQuery(req);
  const slug = normalizeSlug(query.slug);
  const surface = clean(query.surface).toLowerCase() === "admin" ? "admin" : "public";
  if (!(await creatorExists(slug))) {
    return send(res, 404, "Creator not found");
  }
  const html = fs.readFileSync(enginePath(surface), "utf8");
  send(res, 200, html, "text/html; charset=utf-8");
};
