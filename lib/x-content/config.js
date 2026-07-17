const ALLOWED_MODES = new Set(["draft", "approve", "auto"]);
const ALLOWED_AUTONOMY_MODES = new Set(["off", "shadow", "auto"]);

function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function getConfig(overrides = {}) {
  const requestedMode = clean(overrides.mode || process.env.CONTENT_PUBLISH_MODE || "approve").toLowerCase();
  const requestedAutonomy = clean(overrides.autonomyMode || process.env.CONTENT_AUTONOMY_MODE || "shadow").toLowerCase();
  return {
    mode: ALLOWED_MODES.has(requestedMode) ? requestedMode : "approve",
    cronSecret: clean(overrides.cronSecret || process.env.CONTENT_CRON_SECRET),
    dailyCap: number(overrides.dailyCap || process.env.CONTENT_DAILY_CAP, 3, 1, 12),
    minimumIntervalMinutes: number(overrides.minimumIntervalMinutes || process.env.CONTENT_MIN_INTERVAL_MINUTES, 180, 15, 1440),
    publishStart: clean(overrides.publishStart || process.env.CONTENT_PUBLISH_START) || "08:00",
    publishEnd: clean(overrides.publishEnd || process.env.CONTENT_PUBLISH_END) || "21:30",
    timezone: clean(overrides.timezone || process.env.CONTENT_TIMEZONE) || "Europe/Amsterdam",
    publicationThreshold: number(overrides.publicationThreshold || process.env.CONTENT_PUBLISH_THRESHOLD, 0.68, 0, 1),
    editorialThreshold: number(overrides.editorialThreshold || process.env.CONTENT_EDITORIAL_THRESHOLD, 0.74, 0.5, 1),
    v2DraftBatchSize: number(overrides.v2DraftBatchSize || process.env.CONTENT_V2_DRAFT_BATCH_SIZE, 5, 1, 5),
    autonomy: {
      mode: ALLOWED_AUTONOMY_MODES.has(requestedAutonomy) ? requestedAutonomy : "shadow",
      publishEnabled: String(overrides.autonomousPublishEnabled ?? process.env.X_AUTONOMOUS_PUBLISH_ENABLED ?? "false").toLowerCase() === "true",
      dailyCap: number(overrides.autonomyDailyCap || process.env.CONTENT_AUTONOMY_DAILY_CAP, 2, 1, 2),
      weeklyCap: number(overrides.autonomyWeeklyCap || process.env.CONTENT_AUTONOMY_WEEKLY_CAP, 8, 1, 8),
      minimumIntervalMinutes: number(overrides.autonomyMinimumIntervalMinutes || process.env.CONTENT_AUTONOMY_MIN_INTERVAL_MINUTES, 240, 240, 1440),
      topicCooldownHours: number(overrides.autonomyTopicCooldownHours || process.env.CONTENT_AUTONOMY_TOPIC_COOLDOWN_HOURS, 24, 24, 168),
      sourceLimit48Hours: number(overrides.autonomySourceLimit48Hours || process.env.CONTENT_AUTONOMY_SOURCE_LIMIT_48H, 2, 1, 2),
      allowOvernight: String(overrides.autonomyAllowOvernight ?? process.env.CONTENT_AUTONOMY_ALLOW_OVERNIGHT ?? "false").toLowerCase() === "true",
      windows: clean(overrides.autonomyWindows || process.env.CONTENT_AUTONOMY_WINDOWS) || "09:00-12:00,13:00-17:30",
      thresholds: {
        brand: number(overrides.autonomyBrandThreshold || process.env.CONTENT_AUTONOMY_BRAND_THRESHOLD, 0.92, 0, 1),
        insight: number(overrides.autonomyInsightThreshold || process.env.CONTENT_AUTONOMY_INSIGHT_THRESHOLD, 0.88, 0, 1),
        educational: number(overrides.autonomyEducationalThreshold || process.env.CONTENT_AUTONOMY_EDUCATIONAL_THRESHOLD, 0.84, 0, 1),
        performance: number(overrides.autonomyPerformanceThreshold || process.env.CONTENT_AUTONOMY_PERFORMANCE_THRESHOLD, 0.85, 0, 1),
        sourceReliability: number(overrides.autonomySourceReliabilityThreshold || process.env.CONTENT_AUTONOMY_SOURCE_RELIABILITY_THRESHOLD, 0.95, 0, 1),
        risk: number(overrides.autonomyRiskThreshold || process.env.CONTENT_AUTONOMY_RISK_THRESHOLD, 0.10, 0, 1),
        maxWeightedLength: number(overrides.autonomyMaxWeightedLength || process.env.CONTENT_AUTONOMY_MAX_WEIGHTED_LENGTH, 230, 1, 240)
      }
    },
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
      accessTokenSecret: clean(overrides.xAccessTokenSecret || process.env.X_ACCESS_TOKEN_SECRET),
      bearerToken: clean(overrides.xBearerToken || process.env.X_BEARER_TOKEN)
    }
  };
}

module.exports = { ALLOWED_MODES, ALLOWED_AUTONOMY_MODES, clean, getConfig };
