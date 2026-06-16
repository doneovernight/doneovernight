const crypto = require("crypto");

const REVIEW_TOKEN_VERSION = "review_token_v1";
const REVIEW_BASE_URL = "https://portal.doneovernight.com/review";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getReviewTokenSecret(env = process.env) {
  return clean(env.REVIEW_TOKEN_SECRET)
    || clean(env.SUPABASE_SERVICE_ROLE_KEY)
    || clean(env.TASK_SUBMIT_WEBHOOK_URL);
}

function getReviewTaskId(task = {}) {
  return clean(task.taskId)
    || clean(task.task_id)
    || clean(task.operational_id)
    || clean(task.id);
}

function getReviewCreatedAt(task = {}) {
  return clean(task.createdAt)
    || clean(task.created_at)
    || clean(task.rawPayload?.createdAt)
    || clean(task.rawPayload?.created_at)
    || clean(task.raw_payload?.createdAt)
    || clean(task.raw_payload?.created_at);
}

function reviewTokenInput(task = {}) {
  const taskId = getReviewTaskId(task);
  const createdAt = getReviewCreatedAt(task);
  if (!taskId || !createdAt) return "";
  return `${REVIEW_TOKEN_VERSION}:${taskId}:${createdAt}`;
}

function createReviewToken(task = {}, env = process.env) {
  const secret = getReviewTokenSecret(env);
  const input = reviewTokenInput(task);
  if (!secret || !input) return "";
  return base64Url(crypto.createHmac("sha256", secret).update(input).digest()).slice(0, 43);
}

function hashReviewToken(token = "", env = process.env) {
  const secret = getReviewTokenSecret(env);
  const value = clean(token);
  if (!secret || !value) return "";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function getStoredReviewTokenHash(task = {}) {
  return clean(task.review_token_hash)
    || clean(task.rawPayload?.review_token_hash)
    || clean(task.raw_payload?.review_token_hash);
}

function safeCompare(valueA = "", valueB = "") {
  const a = clean(valueA);
  const b = clean(valueB);
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifyReviewToken(task = {}, token = "", env = process.env) {
  const providedHash = hashReviewToken(token, env);
  const storedHash = getStoredReviewTokenHash(task);
  const expectedToken = createReviewToken(task, env);
  const expectedHash = hashReviewToken(expectedToken, env);

  return Boolean(
    providedHash &&
    (
      (storedHash && safeCompare(providedHash, storedHash)) ||
      (!storedHash && expectedHash && safeCompare(providedHash, expectedHash))
    )
  );
}

function buildSecureReviewUrl(task = {}, token = createReviewToken(task)) {
  const taskId = getReviewTaskId(task);
  if (!taskId || !token) return "";
  const url = new URL(REVIEW_BASE_URL);
  url.searchParams.set("task_id", taskId);
  url.searchParams.set("token", token);
  return url.toString();
}

function attachReviewSecurity(task = {}, env = process.env) {
  const token = createReviewToken(task, env);
  const tokenHash = hashReviewToken(token, env);
  if (!token || !tokenHash) return { task, token: "", tokenHash: "" };

  const securedTask = {
    ...task,
    reviewTokenHash: tokenHash,
    rawPayload: {
      ...(task.rawPayload || {}),
      review_token_hash: tokenHash,
      review_token_version: REVIEW_TOKEN_VERSION
    }
  };

  return { task: securedTask, token, tokenHash };
}

module.exports = {
  REVIEW_TOKEN_VERSION,
  attachReviewSecurity,
  buildSecureReviewUrl,
  createReviewToken,
  getReviewTaskId,
  hashReviewToken,
  verifyReviewToken
};
