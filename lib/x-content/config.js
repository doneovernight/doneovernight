const ALLOWED_MODES = new Set(["draft", "approve", "auto"]);

function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function getConfig(overrides = {}) {
  const requestedMode = clean(overrides.mode || process.env.CONTENT_PUBLISH_MODE || "approve").toLowerCase();
  return {
    mode: ALLOWED_MODES.has(requestedMode) ? requestedMode : "approve",
    cronSecret: clean(overrides.cronSecret || process.env.CONTENT_CRON_SECRET),
    dailyCap: number(overrides.dailyCap || process.env.CONTENT_DAILY_CAP, 3, 1, 12),
    minimumIntervalMinutes: number(overrides.minimumIntervalMinutes || process.env.CONTENT_MIN_INTERVAL_MINUTES, 180, 15, 1440),
    publishStart: clean(overrides.publishStart || process.env.CONTENT_PUBLISH_START) || "08:00",
    publishEnd: clean(overrides.publishEnd || process.env.CONTENT_PUBLISH_END) || "21:30",
    timezone: clean(overrides.timezone || process.env.CONTENT_TIMEZONE) || "Europe/Amsterdam",
    publicationThreshold: number(overrides.publicationThreshold || process.env.CONTENT_PUBLISH_THRESHOLD, 0.68, 0, 1),
    openaiApiKey: clean(overrides.openaiApiKey || process.env.OPENAI_API_KEY),
    openaiModel: clean(overrides.openaiModel || process.env.OPENAI_MODEL),
    allowTestPost: String(overrides.allowTestPost || process.env.X_ALLOW_TEST_POST || "").toLowerCase() === "true",
    x: {
      clientId: clean(overrides.xClientId || process.env.X_CLIENT_ID),
      clientSecret: clean(overrides.xClientSecret || process.env.X_CLIENT_SECRET),
      redirectUri: clean(overrides.xRedirectUri || process.env.X_REDIRECT_URI),
      accessToken: clean(overrides.xAccessToken || process.env.X_ACCESS_TOKEN),
      refreshToken: clean(overrides.xRefreshToken || process.env.X_REFRESH_TOKEN),
      apiKey: clean(overrides.xApiKey || process.env.X_API_KEY),
      apiSecret: clean(overrides.xApiSecret || process.env.X_API_SECRET),
      accessTokenSecret: clean(overrides.xAccessTokenSecret || process.env.X_ACCESS_TOKEN_SECRET)
    }
  };
}

module.exports = { ALLOWED_MODES, clean, getConfig };
