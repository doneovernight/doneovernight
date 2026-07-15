const { publishNext } = require("../lib/x-content/service");
const { isCron, send } = require("../lib/x-content/http");
module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await publishNext() }); } catch (error) { console.error("[X_CONTENT] publish_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Publishing check failed", code: error.code || "PUBLISHING_FAILED" }); }
};
