const {
  clean,
  getWorkspaceSessionFromRequest,
  parseBody,
  send,
  slugify,
  supabaseFetch,
  workspaceSessionMatchesRequest
} = require("../lib/ops");

function fallbackMessages({ taskId, slug }) {
  const label = taskId || (slug ? `@${slug}` : "workspace");
  return [
    {
      id: "system-ready",
      message_type: "system_update",
      author_role: "system",
      message: "Private workspace opened.",
      task_id: label,
      created_at: new Date().toISOString()
    }
  ];
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, `https://${req.headers.host || "doneovernight.com"}`);
      const slug = slugify(url.searchParams.get("slug") || "");
      const email = clean(url.searchParams.get("email") || "").toLowerCase();
      const taskId = clean(url.searchParams.get("task_id") || url.searchParams.get("taskId"));
      const session = await getWorkspaceSessionFromRequest(req);
      if (!session || !workspaceSessionMatchesRequest(session, { email, slug })) {
        return send(res, 401, {
          success: false,
          messages: [],
          error: "Private workspace access required",
          code: "WORKSPACE_SESSION_REQUIRED"
        });
      }
      const filters = ["select=*", "order=created_at.desc", "limit=50"];
      if (session.email) filters.unshift(`email=eq.${encodeURIComponent(session.email)}`);
      else if (session.workspace_slug) filters.unshift(`workspace_slug=eq.${encodeURIComponent(session.workspace_slug)}`);
      else if (taskId) filters.unshift(`task_id=eq.${encodeURIComponent(taskId)}`);
      const rows = await supabaseFetch(`workspace_messages?${filters.join("&")}`);
      return send(res, 200, { success: true, messages: Array.isArray(rows) ? rows : [] });
    }

    if (req.method === "POST") {
      const input = await parseBody(req);
      const session = await getWorkspaceSessionFromRequest(req);
      if (!session || !workspaceSessionMatchesRequest(session, {
        email: clean(input.email).toLowerCase(),
        slug: slugify(input.workspace_slug || input.slug || "")
      })) {
        return send(res, 401, {
          success: false,
          error: "Private workspace access required",
          code: "WORKSPACE_SESSION_REQUIRED"
        });
      }
      const message = clean(input.message);
      if (!message) return send(res, 400, { success: false, error: "Message is required" });
      const payload = {
        workspace_slug: session.workspace_slug,
        task_id: clean(input.task_id || input.taskId),
        email: session.email,
        author_role: "client",
        message_type: clean(input.message_type || input.messageType) || "system_update",
        message,
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
      };
      const rows = await supabaseFetch("workspace_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      return send(res, 200, { success: true, message: Array.isArray(rows) ? rows[0] : rows });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  } catch (error) {
    if (req.method === "GET") {
      const url = new URL(req.url, `https://${req.headers.host || "doneovernight.com"}`);
      return send(res, 200, {
        success: true,
        fallback: true,
        messages: fallbackMessages({
          slug: slugify(url.searchParams.get("slug") || ""),
          taskId: clean(url.searchParams.get("task_id") || url.searchParams.get("taskId"))
        })
      });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: "Could not save workspace message",
      code: error.code || "WORKSPACE_MESSAGE_FAILED"
    });
  }
};
