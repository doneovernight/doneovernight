const { heartbeat } = require("../lib/x-content/service");
const { send } = require("../lib/x-content/http");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  try { return send(res, 200, { success: true, ...(await heartbeat()) }); } catch (error) { return send(res, error.statusCode || 500, { success: false, error: "Content heartbeat unavailable", code: error.code || "HEARTBEAT_FAILED" }); }
};
