const EVENT_TYPES = new Set([
  "cycle_started", "cycle_completed", "decision_created", "draft_auto_approved", "draft_blocked",
  "schedule_proposed", "schedule_due", "schedule_delayed", "schedule_missed", "schedule_cancelled", "publish_attempted", "publish_skipped", "publish_succeeded",
  "publish_failed", "metric_checkpoint_completed", "learning_recommendation_created", "kill_switch_checked", "mode_changed"
]);

const SENSITIVE_KEY = /(?:secret|token|authorization|cookie|api[_-]?key|password|verifier|credential)/i;

function safeReason(value) {
  return String(value || "unspecified")
    .replace(/[^a-zA-Z0-9_.,:;\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240) || "unspecified";
}

function sanitize(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  if (!value || typeof value !== "object") return typeof value === "string" ? safeReason(value) : value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .slice(0, 30)
    .map(([key, item]) => [key, sanitize(item)]));
}

async function record(repo, event = {}) {
  if (!EVENT_TYPES.has(event.event_type)) throw new Error("Unsupported autonomous audit event");
  if (!repo?.recordAutonomyAudit) return null;
  return repo.recordAutonomyAudit({
    event_type: event.event_type,
    run_id: event.run_id || null,
    draft_id: event.draft_id || null,
    publication_id: event.publication_id || null,
    schedule_id: event.schedule_id || null,
    mode: ["off", "shadow", "auto"].includes(event.mode) ? event.mode : "shadow",
    actor: "system",
    reason: safeReason(event.reason),
    payload: sanitize(event.payload || {}),
    created_at: event.created_at || new Date().toISOString()
  });
}

module.exports = { EVENT_TYPES, record, safeReason, sanitize };
