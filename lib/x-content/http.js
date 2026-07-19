const { parseBody, send } = require("../ops");
const { clean } = require("./config");
const tenant = require("./tenant-context");

const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
async function verifyAdmin(req, input) {
  const key = clean(input?.admin_key || input?.adminKey || req.headers["x-admin-key"]);
  if (!key) return false;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try { const response = await fetch(ADMIN_AUTH_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ admin_key: key }), signal: controller.signal }); const body = await response.json().catch(() => ({})); return response.ok && body.success === true; } finally { clearTimeout(timeout); }
}
function isCron(req) { const expected = clean(process.env.CRON_SECRET || process.env.CONTENT_CRON_SECRET); const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""); return Boolean(expected) && bearer === expected; }
async function requireAdmin(req, res) { const input = await parseBody(req); if (!await verifyAdmin(req, input)) { send(res, 401, { success: false, error: "Admin access denied" }); return null; } return input; }
async function runWithWorkspace(req, input, callback) {
  const context = tenant.workspaceScopingEnabled()
    ? tenant.resolveBoundaryContext(req.tenantContext || {})
    : tenant.seededCompatibilityContext();
  return tenant.run(context, () => callback(context));
}
module.exports = { send, parseBody, isCron, requireAdmin, runWithWorkspace };
