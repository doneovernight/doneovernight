const { buildSecureReviewUrl } = require("../review-token");

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function hasSecureReviewParams(value) {
  const url = clean(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return Boolean(parsed.searchParams.get("task_id") && parsed.searchParams.get("token"));
  } catch (error) {
    return false;
  }
}

function firstTokenizedReviewUrl(...values) {
  return values.map(clean).find(hasSecureReviewParams) || "";
}

function resolveClientReviewUrl(task = {}, candidates = []) {
  const existingUrl = firstTokenizedReviewUrl(
    ...candidates,
    task.secure_review_url,
    task.client_review_url,
    task.review_url,
    task.reviewUrl,
    task.raw_payload?.secure_review_url,
    task.raw_payload?.client_review_url,
    task.raw_payload?.review_url,
    task.rawPayload?.secure_review_url,
    task.rawPayload?.client_review_url,
    task.rawPayload?.review_url
  );

  return existingUrl || buildSecureReviewUrl(task);
}

module.exports = {
  firstTokenizedReviewUrl,
  hasSecureReviewParams,
  resolveClientReviewUrl
};
