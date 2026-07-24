const MIN_POSTS = 2;
const PREFERRED_RANGE = [3, 4];
const MAX_POSTS = 5;
const MIN_SPACING_MINUTES = 180;
const WINDOW = { start: "08:00", end: "22:00" };

const MIX = [
  { objective: "timely_insight", pillar: "current systems", tiers: ["breaking_news", "industry_releases", "x_discussions"], fallback: "evergreen_education" },
  { objective: "operator_lesson", pillar: "operating systems", tiers: ["evergreen_education", "founder_insights", "internal_knowledge"], fallback: "historical_lessons" },
  { objective: "founder_framework", pillar: "founder operations", tiers: ["founder_insights", "quote_opportunities", "internal_knowledge"], fallback: "scheduled_campaigns" },
  { objective: "timely_commentary", pillar: "practical execution", tiers: ["breaking_news", "github_releases", "hacker_news"], fallback: "evergreen_education" },
  { objective: "high_confidence_opportunity", pillar: "trusted signals", tiers: ["quote_opportunities", "product_hunt", "github_releases"], fallback: "internal_knowledge" }
];
const CURATED_PRINCIPLES = Object.freeze([
  { id: "state-visible", title: "Visible state is a product feature", text: "Reliable automation starts with visible state. When every transition is inspectable, operators can repair the workflow instead of guessing what happened.", evidence: "Approved DONEOVERNIGHT operating principle: inspectable workflow state.", topic: "workflow reliability" },
  { id: "failure-legible", title: "Make failure legible", text: "A useful workflow does not hide failure behind a green button. It records the boundary, the reason, and the next safe action so recovery is part of delivery.", evidence: "Approved DONEOVERNIGHT operating principle: explicit recovery paths.", topic: "recovery design" },
  { id: "handoffs-explicit", title: "Explicit handoffs beat heroic memory", text: "Systems scale when handoffs are explicit. The right question is not who remembers the next step, but where the next step is recorded and reviewable.", evidence: "Approved DONEOVERNIGHT operating principle: durable handoffs.", topic: "operating systems" },
  { id: "quality-before-volume", title: "Quality gates protect cadence", text: "Publishing more often only helps when the quality gate stays intact. A bounded queue with clear rejection reasons beats a calendar full of interchangeable posts.", evidence: "Approved DONEOVERNIGHT operating principle: quality before volume.", topic: "content operations" },
  { id: "agents-need-boundaries", title: "Agents need boundaries", text: "An agent becomes useful when its authority is explicit. Give it a goal, a safe boundary, and an audit trail; then let the operator see every decision.", evidence: "Approved DONEOVERNIGHT operating principle: bounded autonomy.", topic: "agent systems" }
]);

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function dayKey(date, timezone) { const parts = localParts(date, timezone); return `${parts.year}-${parts.month}-${parts.day}`; }
function offsetFor(day, index) { let hash = index + 17; for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) % 97; return ((hash % 3) - 1) * 10; }
function atLocal(day, minutes, timezone) {
  const [year, month, date] = day.split("-").map(Number); const approx = new Date(Date.UTC(year, month - 1, date, Math.floor(minutes / 60), minutes % 60));
  const zonePart = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(approx).find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = zonePart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/); const offsetMinutes = match ? (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === "+" ? 1 : -1) : 0;
  return new Date(approx.getTime() - offsetMinutes * 60_000);
}

function shiftDayKey(day, amount = 1) {
  const [year, month, date] = String(day).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + Number(amount || 0), 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function planSlotsForDay({ day, now = Date.now(), timezone = "Europe/Amsterdam", count = 3 } = {}) {
  const target = Math.min(MAX_POSTS, Math.max(MIN_POSTS, Number(count) || MIN_POSTS));
  const baseMinutes = [9 * 60 + 5, 12 * 60 + 25, 16 * 60 + 10, 19 * 60 + 20, 21 * 60 + 5];
  const selected = baseMinutes
    .map((minutes, index) => ({ date: atLocal(day, minutes + offsetFor(day, index), timezone), index }))
    .filter(({ date }) => date.getTime() >= now + 5 * 60_000 && Number(localParts(date, timezone).hour) >= 8 && Number(localParts(date, timezone).hour) < 22)
    .slice(0, target);
  const slots = selected.map(({ date, index }) => ({ index, planned_for: date.toISOString(), date_key: dayKey(date, timezone), objective: MIX[index % MIX.length].objective, content_pillar: MIX[index % MIX.length].pillar, discovery_tiers: MIX[index % MIX.length].tiers, fallback_tier: MIX[index % MIX.length].fallback, expected_audience_value: "A concrete, source-backed operating takeaway for builders, founders, or operators." }));
  return { day, target: { minimum: MIN_POSTS, preferred: PREFERRED_RANGE, maximum: MAX_POSTS }, timezone, window: WINDOW, minimum_spacing_minutes: MIN_SPACING_MINUTES, slots };
}

function planSlots({ now = Date.now(), timezone = "Europe/Amsterdam", count = 3 } = {}) {
  const target = Math.min(MAX_POSTS, Math.max(MIN_POSTS, Number(count) || MIN_POSTS)); const currentDay = dayKey(new Date(now), timezone); const days = [currentDay, shiftDayKey(currentDay, 1)]; let selectedPlan = null;
  for (const day of days) {
    selectedPlan = planSlotsForDay({ day, now, timezone, count: target });
    if (selectedPlan.slots.length >= target || day !== days[0]) break;
  }
  return { ...selectedPlan, target: { minimum: MIN_POSTS, preferred: PREFERRED_RANGE, maximum: MAX_POSTS } };
}

function planHorizon({ now = Date.now(), timezone = "Europe/Amsterdam", count = 3, days = 2 } = {}) {
  const start = dayKey(new Date(now), timezone);
  const plans = Array.from({ length: Math.max(1, Math.min(7, Number(days) || 2)) }, (_, offset) => planSlotsForDay({ day: shiftDayKey(start, offset), now, timezone, count }));
  return { target: { minimum: MIN_POSTS, preferred: PREFERRED_RANGE, maximum: MAX_POSTS }, timezone, window: WINDOW, minimum_spacing_minutes: MIN_SPACING_MINUTES, days: plans, slots: plans.flatMap((plan) => plan.slots) };
}

function respectsSpacing(slots) { return slots.every((slot, index) => index === 0 || new Date(slot.planned_for).getTime() - new Date(slots[index - 1].planned_for).getTime() >= MIN_SPACING_MINUTES * 60_000); }
function remainingMinimum({ published = 0, scheduled = 0 } = {}) { return Math.max(0, MIN_POSTS - Number(published || 0) - Number(scheduled || 0)); }
function dailyStatus({ published = 0, scheduled = 0, blocker = null, next = null } = {}) { const remaining = remainingMinimum({ published, scheduled }); return { target: { minimum: MIN_POSTS, preferred: PREFERRED_RANGE, maximum: MAX_POSTS }, published, scheduled, remaining_minimum: remaining, next_scheduled_slot: next, at_risk: remaining > 0 && !next, blocker: remaining > 0 && !next ? (blocker || "No usable schedule passed all gates") : null }; }

module.exports = { MIN_POSTS, PREFERRED_RANGE, MAX_POSTS, MIN_SPACING_MINUTES, MIX, CURATED_PRINCIPLES, planSlots, planSlotsForDay, planHorizon, shiftDayKey, respectsSpacing, remainingMinimum, dailyStatus, dayKey };
