const repository = require("./repository");
const service = require("./service");
const { ALLOWED_MODES } = require("./config");
const { isCron, requireAdmin, send } = require("./http");

async function discover(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.discover() }); } catch (error) { console.error("[X_CONTENT] discovery_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Discovery failed", code: error.code || "DISCOVERY_FAILED" }); }
}

async function publish(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.publishNext() }); } catch (error) { console.error("[X_CONTENT] publish_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Publishing check failed", code: error.code || "PUBLISHING_FAILED" }); }
}

async function heartbeat(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  try { return send(res, 200, { success: true, ...(await service.heartbeat()) }); } catch (error) { return send(res, error.statusCode || 500, { success: false, error: "Content heartbeat unavailable", code: error.code || "HEARTBEAT_FAILED" }); }
}

async function identity(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try {
    const result = await require("./x-client").verifyIdentity();
    return send(res, 200, { success: true, username: result.username, userId: result.userId, authenticationMethod: result.authenticationMethod });
  } catch (error) {
    console.error("[X_CONTENT] identity_failed", { message: error.message, statusCode: error.statusCode || null, category: error.category || null });
    return send(res, error.statusCode || 500, { success: false, error: "X identity verification failed", code: error.code || "X_IDENTITY_FAILED", category: error.category || null });
  }
}

async function oauthStart(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { const result = await require("./x-client").startOAuth2Authorization(); return send(res, 200, { success: true, authorization_url: result.authorizationUrl, scopes: result.scopes }); }
  catch (error) { return send(res, error.statusCode || 500, { success: false, error: "OAuth 2.0 authorization could not start", code: error.code || "X_OAUTH2_START_FAILED" }); }
}

async function oauthCallback(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  const requestUrl = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`); const code = requestUrl.searchParams.get("code"); const state = requestUrl.searchParams.get("state");
  if (requestUrl.searchParams.get("error")) return send(res, 400, { success: false, error: "X OAuth 2.0 authorization was not completed", code: "X_OAUTH2_DENIED" });
  try { const result = await require("./x-client").completeOAuth2Authorization({ code, state }); return send(res, 200, { success: true, username: result.username, user_id: result.userId, scopes: result.scopes, refresh_token_available: result.refreshTokenAvailable }); }
  catch (error) { return send(res, error.statusCode || 500, { success: false, error: "X OAuth 2.0 authorization could not be completed", code: error.code || "X_OAUTH2_CALLBACK_FAILED" }); }
}

function sourceUrl(draft, candidate) {
  const references = Array.isArray(draft.source_references) ? draft.source_references : [];
  return String(references[0] || candidate?.source_url || "");
}
async function listReviewDrafts() {
  const drafts = (await repository.listDrafts()).filter((draft) => ["queued", "approved"].includes(draft.status));
  return Promise.all(drafts.map(async (draft) => {
    const candidate = draft.candidate_id ? await repository.getCandidate(draft.candidate_id) : null;
    const source = candidate?.source_url ? await repository.findSourceByUrl(candidate.source_url) : null;
    return { id: draft.id, text: draft.text, weighted_character_count: draft.weighted_character_count, post_type: draft.post_type, topic: draft.topic_cluster || candidate?.topic_cluster || "", source_title: source?.title || candidate?.headline || "Official source", source_url: sourceUrl(draft, candidate), confidence: draft.confidence, quality_score: draft.quality_score, created_at: draft.created_at, status: draft.status };
  }));
}

async function admin(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  try {
    const input = await requireAdmin(req, res); if (!input) return;
    const action = String(input.action || "list"); let result;
    if (action === "list") result = { drafts: await listReviewDrafts(), heartbeat: await service.heartbeat() };
    else if (action === "approve") result = await service.approveDraft(input.draft_id);
    else if (action === "reject") result = await service.rejectDraft(input.draft_id, input.reason);
    else if (action === "regenerate") result = await service.regenerateDraft(input.draft_id);
    else if (action === "publish_now") {
      if (input.publish_confirmation !== "PUBLISH") return send(res, 400, { success: false, error: "Type PUBLISH to confirm public posting" });
      result = await service.publishApprovedDraft(input.draft_id);
    }
    else if (action === "verify_identity") result = await require("./x-client").verifyIdentity();
    else if (action === "test_post") result = await service.testPost();
    else if (action === "set_mode") { const mode = String(input.mode || "").toLowerCase(); if (!ALLOWED_MODES.has(mode)) return send(res, 400, { success: false, error: "Mode must be draft, approve, or auto" }); result = await repository.setSetting("content_publish_mode", mode); }
    else return send(res, 400, { success: false, error: "Unknown action" });
    return send(res, 200, { success: true, result });
  } catch (error) { console.error("[X_CONTENT] admin_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: error.message, code: error.code || "X_CONTENT_ADMIN_FAILED" }); }
}

module.exports = { discover, publish, heartbeat, identity, oauthStart, oauthCallback, admin };
