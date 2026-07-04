const { parseBody, send } = require("../lib/ops");
const { reportCreatorError, runCreatorHealth } = require("../lib/creator-watchtower");

function query(req) {
  const parsed = new URL(req.url || "/", "https://doneovernight.local");
  return {
    ...(req.query || {}),
    ...Object.fromEntries(parsed.searchParams.entries())
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const input = query(req);
    const health = await runCreatorHealth({
      req,
      slug: input.slug || "mosyaamosya",
      sendAlertOnFailure: input.alert === "1"
    });
    return send(res, 200, health);
  }

  if (req.method === "POST") {
    try {
      const input = await parseBody(req);
      if (input.action === "report_error") {
        const result = await reportCreatorError({
          slug: input.slug || "mosyaamosya",
          creator: input.creator || "Mina Mosya",
          area: input.area,
          action: input.action_name || input.event || input.watchtower_action,
          error: input.error || input.message,
          url: input.url,
          source: input.source || "production",
          suggested_check: input.suggested_check
        });
        return send(res, 200, result);
      }

      if (input.action === "run_health_check") {
        const health = await runCreatorHealth({
          req,
          slug: input.slug || "mosyaamosya",
          sendAlertOnFailure: input.alert_on_failure === true
        });
        return send(res, 200, health);
      }

      return send(res, 400, { success: false, error: "Unsupported health action" });
    } catch (error) {
      return send(res, error.statusCode || 500, {
        success: false,
        error: error.message || "Creator health request failed",
        code: error.code || "CREATOR_HEALTH_FAILED"
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { success: false, error: "Method not allowed" });
};
