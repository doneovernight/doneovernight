const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const ADMIN_AUTH_TIMEOUT_MS = 10_000;

const { clean, parseBody, send } = require("../lib/ops");
const { generateHeartbeat, sendHeartbeat } = require("../heartbeat/summary");

async function verifyAdminKey(adminKey) {
  if (!adminKey) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADMIN_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(ADMIN_AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ admin_key: adminKey }),
      signal: controller.signal
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data?.success === true;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const adminKey = clean(input.admin_key || input.adminKey || req.headers["x-admin-key"]);
    const authorized = await verifyAdminKey(adminKey);
    if (!authorized) {
      return send(res, 401, { success: false, error: "Admin access denied" });
    }

    const shouldSend = input.send === true || input.send === "true";
    const result = shouldSend
      ? await sendHeartbeat()
      : { summary: await generateHeartbeat(), telegram: { sent: false, status: "Dry run" } };

    return send(res, 200, {
      success: true,
      sent: shouldSend,
      summary: result.summary,
      telegram: result.telegram
    });
  } catch (error) {
    console.error("[ADMIN_HEARTBEAT_ERROR]", error);
    return send(res, error.statusCode || 500, {
      success: false,
      error: error.message || "Heartbeat failed"
    });
  }
};
