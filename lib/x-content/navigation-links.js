const X_HOSTS = new Set(["x.com", "www.x.com"]);
const ACCOUNT_USERNAME = "doneovernight";

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function canonicalUrl(value) {
  const url = httpsUrl(value);
  if (!url) return null;
  url.hash = "";
  return url.toString();
}

function trustedSourceUrl(value, persistedEvidence) {
  const candidate = canonicalUrl(value);
  const evidence = canonicalUrl(persistedEvidence);
  return candidate && evidence && candidate === evidence ? candidate : null;
}

function canonicalXPostUrl({ xPostId, xPostUrl, username = ACCOUNT_USERNAME } = {}) {
  const id = String(xPostId || "").trim();
  if (!/^\d+$/.test(id) || String(username).toLowerCase() !== ACCOUNT_USERNAME) return null;
  const expectedPath = `/${ACCOUNT_USERNAME}/status/${id}`;
  const supplied = httpsUrl(xPostUrl);
  if (supplied && (!X_HOSTS.has(supplied.hostname.toLowerCase()) || supplied.pathname !== expectedPath)) return null;
  return `https://x.com${expectedPath}`;
}

function xConversationUrl(xEventId) {
  const id = String(xEventId || "").trim();
  return /^\d+$/.test(id) ? `https://x.com/i/status/${id}` : null;
}

module.exports = { ACCOUNT_USERNAME, X_HOSTS, httpsUrl, canonicalUrl, trustedSourceUrl, canonicalXPostUrl, xConversationUrl };
