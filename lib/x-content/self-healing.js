const crypto = require("node:crypto");
const tenant = require("./tenant-context");

const FAILURE_CATEGORIES = Object.freeze([
  "transient_network", "rate_limit", "oauth_access_expired", "oauth_refresh_invalid",
  "identity_mismatch", "x_write_rejected", "database_temporarily_unavailable",
  "postgrest_schema_cache_stale", "database_constraint", "missing_schema",
  "workflow_trigger_gap", "stale_schedule", "duplicate_execution", "job_lock_stale",
  "no_candidate", "candidate_quality_failure", "predicted_performance_block",
  "analytics_lag", "deployment_regression", "unknown"
]);
const SEVERITIES = Object.freeze(["info", "warning", "error", "critical"]);
const STATUSES = Object.freeze(["detecting", "contained", "repairing", "verifying", "recovered", "approval_required", "escalated", "failed_closed"]);

const RECOVERY_MATRIX = Object.freeze({
  transient_network: { action: "retry_with_backoff", automatic: true, approval: false, escalation: "none", severity: "warning" },
  rate_limit: { action: "reschedule_from_rate_limit", automatic: true, approval: false, escalation: "none", severity: "warning" },
  oauth_access_expired: { action: "refresh_verified_token", automatic: true, approval: false, escalation: "none", severity: "warning" },
  oauth_refresh_invalid: { action: "request_owner_reauthorization", automatic: false, approval: true, escalation: "account_owner", severity: "critical" },
  identity_mismatch: { action: "activate_safe_stop_and_request_owner", automatic: false, approval: true, escalation: "account_owner", severity: "critical" },
  x_write_rejected: { action: "contain_and_escalate", automatic: false, approval: false, escalation: "operator", severity: "error" },
  database_temporarily_unavailable: { action: "retry_database_operation", automatic: true, approval: false, escalation: "none", severity: "warning" },
  postgrest_schema_cache_stale: { action: "request_safe_schema_reload", automatic: false, approval: true, escalation: "operator", severity: "error" },
  database_constraint: { action: "fail_closed_and_prepare_fix", automatic: false, approval: true, escalation: "operator", severity: "error" },
  missing_schema: { action: "fail_closed_and_request_migration", automatic: false, approval: true, escalation: "operator", severity: "critical" },
  workflow_trigger_gap: { action: "reconcile_missed_workflow", automatic: true, approval: false, escalation: "none", severity: "warning" },
  stale_schedule: { action: "evaluate_or_replace_schedule", automatic: true, approval: false, escalation: "none", severity: "warning" },
  duplicate_execution: { action: "idempotency_guard", automatic: true, approval: false, escalation: "none", severity: "info" },
  job_lock_stale: { action: "release_expired_lease", automatic: true, approval: false, escalation: "none", severity: "warning" },
  no_candidate: { action: "run_discovery_fallback", automatic: true, approval: false, escalation: "none", severity: "info" },
  candidate_quality_failure: { action: "remain_silent_after_fallback", automatic: true, approval: false, escalation: "none", severity: "info" },
  predicted_performance_block: { action: "advisory_during_learning_mode", automatic: true, approval: false, escalation: "none", severity: "info" },
  analytics_lag: { action: "retry_metrics_and_mark_stale", automatic: true, approval: false, escalation: "none", severity: "warning" },
  deployment_regression: { action: "prepare_verified_rollback", automatic: false, approval: true, escalation: "operator", severity: "critical" },
  unknown: { action: "fail_closed_and_escalate", automatic: false, approval: false, escalation: "critical", severity: "critical" }
});

const SENSITIVE = /(?:secret|token|authorization|cookie|password|api[_-]?key|verifier|credential|private)/i;

function sanitize(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  if (!value || typeof value !== "object") return String(value ?? "").replace(/[\r\n]+/g, " ").slice(0, 500);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE.test(key)).slice(0, 30).map(([key, item]) => [key, sanitize(item)]));
}

function safeText(value) { return String(value || "unknown").replace(/[\r\n]+/g, " ").replace(/[^a-zA-Z0-9_.,:;()\- ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || "unknown"; }

function classifyFailure(error = {}, context = {}) {
  const status = Number(error.statusCode || error.status || error.xFailure?.http_status || 0);
  const code = String(error.code || error.xFailure?.x_error_code || "").toLowerCase();
  const category = String(error.category || error.xFailure?.x_error_category || "").toLowerCase();
  const detail = `${code} ${category} ${error.message || ""} ${error.detail || ""} ${error.xFailure?.x_detail || ""}`.toLowerCase();
  if (context.failureCategory && FAILURE_CATEGORIES.includes(context.failureCategory)) return context.failureCategory;
  if (status === 429 || /rate.?limit|retry.?after/.test(detail)) return "rate_limit";
  if (/refresh.*invalid|invalid.*refresh|token.*revok|oauth2_token_exchange_failed/.test(detail)) return "oauth_refresh_invalid";
  if (category === "authentication" && /identity|username|user.?id/.test(detail)) return "identity_mismatch";
  if (category === "authentication" || status === 401 || status === 403) return context.phase === "oauth_refresh" ? "oauth_refresh_invalid" : "oauth_access_expired";
  if (status >= 500 || /econnreset|etimedout|enotfound|network|fetch failed|temporar/.test(detail)) return context.component === "database" ? "database_temporarily_unavailable" : "transient_network";
  if (status === 404 && /column|relation|schema|postgrest|cache/.test(detail)) return /cache|schema.?reload/.test(detail) ? "postgrest_schema_cache_stale" : "missing_schema";
  if (status === 400 && /constraint|violates|column|not.?null|foreign key/.test(detail)) return "database_constraint";
  if (/duplicate|idempot/.test(detail)) return "duplicate_execution";
  if (/stale.*schedule|overdue/.test(detail)) return "stale_schedule";
  if (/no.?candidate|no fresh/.test(detail)) return "no_candidate";
  if (/predicted.?performance/.test(detail)) return "predicted_performance_block";
  if (/analytics|metric/.test(detail)) return "analytics_lag";
  return "unknown";
}

function recoveryFor(category) { return RECOVERY_MATRIX[category] || RECOVERY_MATRIX.unknown; }
function incidentKey({ component = "unknown", failureCategory = "unknown", reference = "global" } = {}) { return crypto.createHash("sha256").update(`${component}:${failureCategory}:${reference}`).digest("hex").slice(0, 48); }
function currentWorkspaceId(input) { return String(input?.workspace_id || tenant.current()?.workspaceId || ""); }

async function recordIncident(repo, input = {}) {
  const failureCategory = FAILURE_CATEGORIES.includes(input.failure_category) ? input.failure_category : classifyFailure(input.error || input, input);
  const recovery = recoveryFor(failureCategory);
  const workspaceId = currentWorkspaceId(input);
  if (!workspaceId || !repo?.upsertSelfHealingIncident) return null;
  const key = input.incident_key || incidentKey({ component: input.component, failureCategory, reference: input.reference || input.schedule_id || input.run_id || "global" });
  const existing = repo.getSelfHealingIncident ? await repo.getSelfHealingIncident(key).catch(() => null) : null;
  const payload = {
    incident_key: key,
    workspace_id: workspaceId,
    component: safeText(input.component || "unknown"),
    failure_category: failureCategory,
    severity: SEVERITIES.includes(input.severity) ? input.severity : recovery.severity,
    sanitized_error: safeText(input.sanitized_error || input.error?.xFailure?.sanitized_message || input.error?.message || input.reason),
    last_seen_at: input.last_seen_at || new Date().toISOString(),
    attempt_count: Math.max(1, Number(existing?.attempt_count || 0) + (Number(input.attempt_count) || 1)),
    selected_recovery: input.selected_recovery || recovery.action,
    recovery_started_at: input.recovery_started_at || null,
    recovery_completed_at: input.recovery_completed_at || null,
    verification_result: sanitize(input.verification_result || {}),
    status: STATUSES.includes(input.status) ? input.status : (recovery.approval ? "approval_required" : recovery.automatic ? "contained" : "failed_closed"),
    escalation_level: input.escalation_level || recovery.escalation,
    run_id: input.run_id || null,
    workflow_id: input.workflow_id || null,
    schedule_id: input.schedule_id || null,
    draft_id: input.draft_id || null,
    publication_id: input.publication_id || null,
    approval_required: Boolean(input.approval_required ?? recovery.approval),
    updated_at: new Date().toISOString()
  };
  try { return await repo.upsertSelfHealingIncident(payload); } catch { return null; }
}

async function resolveIncident(repo, input = {}) {
  if (!repo?.updateSelfHealingIncident || !input.incident_key) return null;
  try { return await repo.updateSelfHealingIncident(input.incident_key, { status: "recovered", recovery_completed_at: new Date().toISOString(), verification_result: sanitize(input.verification_result || {}), updated_at: new Date().toISOString() }); } catch { return null; }
}

function shouldAlert(incident, now = Date.now(), minimumMinutes = 30) {
  if (!incident) return true;
  if (!incident.last_alerted_at) return true;
  return now - new Date(incident.last_alerted_at).getTime() >= minimumMinutes * 60_000;
}

async function alertOnce(repo, notify, incident, message) {
  if (!incident || !shouldAlert(incident)) return { sent: false, skipped: "deduplicated" };
  const sent = typeof notify === "function" ? await notify(message).catch(() => ({ sent: false })) : { sent: false, skipped: "not_configured" };
  if (repo?.updateSelfHealingIncident && incident.incident_key) await repo.updateSelfHealingIncident(incident.incident_key, { last_alerted_at: new Date().toISOString(), alert_count: Number(incident.alert_count || 0) + (sent.sent ? 1 : 0) }).catch(() => null);
  return sent;
}

async function withBoundedRetry(operation, options = {}) {
  const maxAttempts = Math.max(1, Math.min(3, Number(options.maxAttempts) || 3));
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try { return { value: await operation({ attempt, idempotency_key: options.idempotency_key || null }), attempts: attempt }; }
    catch (error) {
      const category = classifyFailure(error, options);
      if (!(["transient_network", "rate_limit", "database_temporarily_unavailable", "analytics_lag"].includes(category)) || attempt >= maxAttempts) throw Object.assign(error, { recovery_attempts: attempt, recovery_category: category });
      const retryAfter = Number(error.xFailure?.rate_limit?.retry_after || 0);
      const reset = Number(error.xFailure?.rate_limit?.x_rate_limit_reset || 0);
      const resetDelay = reset > Math.floor(Date.now() / 1000) ? (reset - Math.floor(Date.now() / 1000)) * 1000 : 0;
      const base = retryAfter > 0 ? retryAfter * 1000 : resetDelay || Math.min(2000, 100 * (2 ** (attempt - 1)));
      const jitter = Number(options.jitter?.(attempt) ?? Math.floor(Math.random() * 50));
      await sleep(Math.min(5000, base + jitter));
    }
  }
  throw new Error("Recovery retry exhausted");
}

async function status(repo, options = {}) {
  const rows = repo?.listSelfHealingIncidents ? await repo.listSelfHealingIncidents(options.limit || 50).catch(() => []) : [];
  const active = rows.filter((row) => !["recovered"].includes(row.status));
  const resolved = rows.filter((row) => row.status === "recovered");
  const recoveryTimes = resolved.map((row) => new Date(row.recovery_completed_at || 0).getTime() - new Date(row.recovery_started_at || row.first_seen_at || 0).getTime()).filter((value) => Number.isFinite(value) && value >= 0);
  return { enabled: Boolean(repo?.listSelfHealingIncidents), active, resolved: resolved.slice(0, 20), active_count: active.length, resolved_count: resolved.length, average_recovery_minutes: recoveryTimes.length ? Math.round((recoveryTimes.reduce((sum, value) => sum + value, 0) / recoveryTimes.length) / 60000 * 10) / 10 : null, code_repair_enabled: String(process.env.X_SELF_HEALING_CODE_REPAIR || "false").toLowerCase() === "true", last_known_good_deployment: options.last_known_good_deployment || process.env.LAST_KNOWN_GOOD_DEPLOYMENT || null };
}

module.exports = { FAILURE_CATEGORIES, RECOVERY_MATRIX, STATUSES, classifyFailure, recoveryFor, incidentKey, sanitize, recordIncident, resolveIncident, shouldAlert, alertOnce, withBoundedRetry, status };
