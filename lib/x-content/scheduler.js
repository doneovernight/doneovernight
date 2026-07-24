const ALLOWED_SOURCES = new Set([
  "supabase_pg_cron",
  "github_watchdog",
  "github_manual",
  "internal_manual"
]);

const PRIMARY_SOURCE = "supabase_pg_cron";
const WATCHDOG_SOURCE = "github_watchdog";
const PRIMARY_INTERVAL_MS = 5 * 60 * 1000;
const PRIMARY_LATE_MS = 12 * 60 * 1000;

function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value) {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : null;
}

function fiveMinuteBucket(time) {
  return Math.floor(Number(time) / PRIMARY_INTERVAL_MS) * PRIMARY_INTERVAL_MS;
}

function triggerFromRequest(req, now = Date.now()) {
  const requestedSource = String(header(req, "x-scheduler-source") || "internal_manual").trim();
  const source = ALLOWED_SOURCES.has(requestedSource) ? requestedSource : "internal_manual";
  const suppliedIntended = validDate(header(req, "x-scheduler-intended-at"));
  const intended = suppliedIntended !== null && suppliedIntended <= now + PRIMARY_INTERVAL_MS && suppliedIntended >= now - 24 * 60 * 60 * 1000
    ? suppliedIntended
    : fiveMinuteBucket(now);
  const actual = Number(now);
  const bucket = fiveMinuteBucket(intended);
  return {
    source,
    intendedTriggerAt: new Date(intended).toISOString(),
    actualTriggerAt: new Date(actual).toISOString(),
    delayMs: Math.max(0, actual - intended),
    idempotencyKey: `autonomy_publish:${source}:${new Date(bucket).toISOString()}`
  };
}

function sanitizeResult(result = {}) {
  const safe = {
    published: result?.published === true,
    skipped: result?.skipped ? String(result.skipped).replace(/[\r\n]+/g, " ").slice(0, 240) : null
  };
  if (result?.schedule_id) safe.schedule_id = String(result.schedule_id).slice(0, 80);
  if (result?.draft_id) safe.draft_id = String(result.draft_id).slice(0, 80);
  if (result?.publication_id) safe.publication_id = String(result.publication_id).slice(0, 80);
  if (result?.x_post_id) safe.x_post_id = String(result.x_post_id).slice(0, 80);
  return safe;
}

function primaryStatus(runs = [], now = Date.now()) {
  const ordered = [...runs].sort((left, right) => new Date(right.actual_trigger_at || right.created_at || 0) - new Date(left.actual_trigger_at || left.created_at || 0));
  const primary = ordered.find((row) => row.scheduler_source === PRIMARY_SOURCE) || null;
  const watchdog = ordered.find((row) => row.scheduler_source === WATCHDOG_SOURCE) || null;
  const lastAt = primary ? new Date(primary.actual_trigger_at || primary.created_at || 0).getTime() : 0;
  const primaryCurrent = Boolean(lastAt && now - lastAt <= PRIMARY_LATE_MS);
  const nextExpected = lastAt ? new Date(lastAt + PRIMARY_INTERVAL_MS).toISOString() : null;
  let fallbackState = "armed";
  if (watchdog?.result?.reason === "primary_current" || watchdog?.result?.skipped === "primary_current") fallbackState = "standby";
  else if (watchdog?.result?.recovery === true || (watchdog?.status === "completed" && watchdog?.result?.published !== undefined)) fallbackState = "recovery_ran";
  else if (watchdog?.status === "failed") fallbackState = "attention";
  return {
    primary: "Supabase pg_cron",
    primary_source: PRIMARY_SOURCE,
    cadence_minutes: 5,
    last_scheduler_run: lastAt ? new Date(lastAt).toISOString() : null,
    next_expected_run: nextExpected,
    scheduler_delay_ms: primary ? Math.max(0, Number(primary.delay_ms) || 0) : null,
    scheduler_delay_seconds: primary ? Math.round(Math.max(0, Number(primary.delay_ms) || 0) / 1000) : null,
    primary_current: primaryCurrent,
    last_result: primary?.status || null,
    fallback_state: fallbackState,
    watchdog_last_run: watchdog?.actual_trigger_at || watchdog?.created_at || null
  };
}

module.exports = {
  ALLOWED_SOURCES,
  PRIMARY_SOURCE,
  WATCHDOG_SOURCE,
  PRIMARY_INTERVAL_MS,
  PRIMARY_LATE_MS,
  triggerFromRequest,
  sanitizeResult,
  primaryStatus
};
