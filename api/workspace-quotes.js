const {
  clean,
  getWorkspaceSessionFromRequest,
  parseBody,
  send,
  slugify,
  supabaseFetch,
  workspaceSessionMatchesRequest
} = require("../lib/ops");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, `https://${req.headers.host || "doneovernight.com"}`);
      const slug = slugify(url.searchParams.get("slug") || "");
      const email = clean(url.searchParams.get("email") || "").toLowerCase();
      const session = await getWorkspaceSessionFromRequest(req);
      if (!session || !workspaceSessionMatchesRequest(session, { email, slug })) {
        return send(res, 401, {
          success: false,
          quotes: [],
          error: "Private workspace access required",
          code: "WORKSPACE_SESSION_REQUIRED"
        });
      }
      const filters = ["select=*", "order=created_at.desc", "limit=50"];
      if (session.email) filters.unshift(`email=eq.${encodeURIComponent(session.email)}`);
      else if (session.workspace_slug) filters.unshift(`workspace_slug=eq.${encodeURIComponent(session.workspace_slug)}`);
      const rows = await supabaseFetch(`workspace_quotes?${filters.join("&")}`);
      return send(res, 200, { success: true, quotes: Array.isArray(rows) ? rows : [] });
    }

    if (req.method === "POST") {
      const input = await parseBody(req);
      const session = await getWorkspaceSessionFromRequest(req);
      if (!session) {
        return send(res, 401, {
          success: false,
          error: "Private workspace access required",
          code: "WORKSPACE_SESSION_REQUIRED"
        });
      }
      const action = clean(input.action);
      if (action === "approve" || action === "reject") {
        const id = clean(input.id);
        if (!id) return send(res, 400, { success: false, error: "Quote id is required" });
        const rows = await supabaseFetch([
          `workspace_quotes?id=eq.${encodeURIComponent(id)}`,
          `email=eq.${encodeURIComponent(session.email)}`,
          "select=*",
          "limit=1"
        ].join("&"));
        const quote = Array.isArray(rows) ? rows[0] : null;
        if (!quote) return send(res, 404, { success: false, error: "Quote not found" });
        const updatedRows = await supabaseFetch(`workspace_quotes?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status: action === "approve" ? "approved" : "rejected", updated_at: new Date().toISOString() })
        });
        return send(res, 200, { success: true, quote: Array.isArray(updatedRows) ? updatedRows[0] : updatedRows });
      }

      return send(res, 403, {
        success: false,
        error: "Quote creation is admin-only",
        code: "WORKSPACE_QUOTE_ADMIN_ONLY"
      });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  } catch (error) {
    if (req.method === "GET") return send(res, 200, { success: true, fallback: true, quotes: [] });
    return send(res, error.statusCode || 500, {
      success: false,
      error: "Could not process workspace quote",
      code: error.code || "WORKSPACE_QUOTE_FAILED"
    });
  }
};
