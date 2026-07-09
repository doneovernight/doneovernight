const {
  changeWebsiteOsPassword,
  getWebsiteOsSession,
  loginWebsiteOsUser,
  logoutOtherWebsiteOsSessions,
  logoutWebsiteOsUser,
  publicUser,
  publicWorkspace
} = require("../lib/website-os-auth");
const { clean, parseBody, send, slugify } = require("../lib/ops");

function assertAdminHost(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  if (host && host !== "admin.doneovernight.com" && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    const error = new Error("Website OS auth is only available on the admin host.");
    error.statusCode = 403;
    error.code = "ADMIN_HOST_REQUIRED";
    throw error;
  }
}

function normalizeAction(input = {}) {
  return clean(input.action || input.intent).toLowerCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    assertAdminHost(req);
    const input = await parseBody(req);
    const action = normalizeAction(input);

    if (action === "login") {
      const result = await loginWebsiteOsUser(res, {
        slug: slugify(input.workspace_slug || input.workspaceSlug || "cp"),
        email: input.email,
        password: input.password
      });
      return send(res, 200, { success: true, ...result });
    }

    if (action === "session") {
      const current = await getWebsiteOsSession(req, { slug: slugify(input.workspace_slug || input.workspaceSlug || "cp") });
      if (!current) {
        return send(res, 401, {
          success: false,
          authenticated: false,
          error: "Website OS session required",
          code: "WEBSITE_OS_SESSION_REQUIRED"
        });
      }
      return send(res, 200, {
        success: true,
        authenticated: true,
        workspace: publicWorkspace(current.workspace),
        user: publicUser(current.user),
        session: {
          expiresAt: current.session.expires_at,
          lastActivity: current.session.last_activity,
          createdAt: current.session.created_at
        }
      });
    }

    if (action === "logout") {
      await logoutWebsiteOsUser(req, res);
      return send(res, 200, { success: true });
    }

    if (action === "change_password") {
      if (clean(input.new_password || input.newPassword) !== clean(input.confirm_password || input.confirmPassword)) {
        return send(res, 400, {
          success: false,
          error: "New passwords do not match.",
          code: "PASSWORD_CONFIRMATION_MISMATCH"
        });
      }
      const result = await changeWebsiteOsPassword(req, {
        slug: slugify(input.workspace_slug || input.workspaceSlug || "cp"),
        currentPassword: input.current_password || input.currentPassword,
        newPassword: input.new_password || input.newPassword
      });
      return send(res, 200, { success: true, ...result });
    }

    if (action === "logout_other_devices") {
      const result = await logoutOtherWebsiteOsSessions(req, {
        slug: slugify(input.workspace_slug || input.workspaceSlug || "cp")
      });
      return send(res, 200, { success: true, ...result });
    }

    return send(res, 400, { success: false, error: "Unsupported Website OS auth action" });
  } catch (error) {
    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: error.message || "Website OS auth failed",
      code: error.code || "WEBSITE_OS_AUTH_FAILED"
    });
  }
};
