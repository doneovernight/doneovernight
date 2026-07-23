const TIMEZONE = "Europe/Amsterdam";
const LIFECYCLE = Object.freeze(["candidate", "drafted", "evaluated", "blocked", "scheduled", "publishing", "published", "failed", "recovered"]);

function dateKey(value = new Date(), timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const mapped = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${mapped.year}-${mapped.month}-${mapped.day}`;
}

function normalizePlan(plan = {}) {
  return { ...plan, timezone: plan.timezone || TIMEZONE, minimum_posts: Number(plan.minimum_posts ?? 2), preferred_posts: Number(plan.preferred_posts ?? 3), maximum_posts: Number(plan.maximum_posts ?? 5), status: plan.status || "open" };
}

function assertLifecycle(value) {
  if (value !== undefined && value !== null && !LIFECYCLE.includes(String(value))) throw Object.assign(new Error(`Unknown execution-plan lifecycle: ${value}`), { code: "EXECUTION_PLAN_LIFECYCLE_INVALID" });
}

function assertPlanItem(item = {}) {
  if (!item.plan_id) throw Object.assign(new Error("Execution-plan item requires plan_id"), { code: "EXECUTION_PLAN_REQUIRED" });
  if (!Number.isInteger(Number(item.slot_number)) || Number(item.slot_number) < 0) throw Object.assign(new Error("Execution-plan item requires a non-negative slot_number"), { code: "EXECUTION_PLAN_SLOT_INVALID" });
  assertLifecycle(item.lifecycle_status);
  if (item.lifecycle_status === "scheduled" && !item.schedule_id) throw Object.assign(new Error("A scheduled plan item requires schedule_id"), { code: "EXECUTION_PLAN_SCHEDULE_REQUIRED" });
  if (item.lifecycle_status === "published" && !item.publication_id) throw Object.assign(new Error("A published plan item requires publication_id"), { code: "EXECUTION_PLAN_PUBLICATION_REQUIRED" });
  return item;
}

module.exports = { TIMEZONE, LIFECYCLE, dateKey, normalizePlan, assertPlanItem };
