const { generateHeartbeat, sendHeartbeat } = require("../heartbeat/summary");

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function readAuth(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return req.headers["x-heartbeat-key"] || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  const configuredKey = process.env.HEARTBEAT_API_KEY || "";
  if (!configuredKey) {
    return send(res, 503, {
      success: false,
      error: "Heartbeat API is not configured"
    });
  }

  if (readAuth(req) !== configuredKey) {
    return send(res, 401, {
      success: false,
      error: "Unauthorized"
    });
  }

  try {
    const dryRun = req.query?.dry_run === "1" || req.query?.dryRun === "1";
    const result = dryRun
      ? { summary: await generateHeartbeat(), telegram: { sent: false, status: "Dry run" } }
      : await sendHeartbeat();

    return send(res, 200, {
      success: true,
      dryRun,
      telegram: result.telegram,
      message: result.summary.telegramMessage
    });
  } catch (error) {
    return send(res, 500, {
      success: false,
      error: "Heartbeat failed",
      detail: error.message
    });
  }
};
