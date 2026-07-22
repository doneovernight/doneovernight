(function exposeBookingStatus(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.COMMONPL4CE_BOOKING_STATUS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBookingStatus() {
  const GROUPS = Object.freeze({
    pending: Object.freeze([
      "new", "requested", "request_received", "review_pending", "pending",
      "under_review", "review_in_progress", "needs_info", "contacted", "on_hold",
      "quoted", "quote_sent", "execution_plan_ready", "payment_started",
      "payment_returned", "awaiting_payment", "verification_pending", "queued"
    ]),
    confirmed: Object.freeze([
      "confirmed", "accepted", "scheduled", "awaiting_start", "payment_confirmed",
      "operators_assigned", "workspace_ready", "workspace_active", "project_active",
      "execution_active", "in_progress", "delivery_prep"
    ]),
    cancelled: Object.freeze([
      "cancelled", "canceled", "declined", "rejected", "no_longer_proceeding",
      "payment_failed", "refunded"
    ]),
    neutral: Object.freeze(["completed", "delivered", "archived"])
  });

  const GROUP_ORDER = Object.freeze(["pending", "confirmed", "cancelled", "neutral"]);

  function key(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function group(value) {
    const normalized = key(value);
    return GROUP_ORDER.find((name) => GROUPS[name].includes(normalized)) || "pending";
  }

  function status(value) {
    const normalized = key(value);
    if (["cancelled", "canceled", "no_longer_proceeding", "payment_failed", "refunded"].includes(normalized)) return "Cancelled";
    if (["declined", "rejected"].includes(normalized)) return "Declined";
    if (["completed", "delivered"].includes(normalized)) return "Completed";
    if (normalized === "archived") return "Archived";
    if (group(normalized) === "confirmed") return "Confirmed";
    if (["needs_info", "contacted", "under_review", "review_in_progress", "on_hold", "quoted", "quote_sent", "execution_plan_ready"].includes(normalized)) return "Contacted";
    return "New";
  }

  function presentation(value) {
    const statusGroup = group(value);
    return Object.freeze({
      status: status(value),
      group: statusGroup,
      className: `is-${statusGroup}`
    });
  }

  function summarize(values) {
    const items = Array.isArray(values) ? values : [];
    const statusCounts = new Map();
    const groupCounts = new Map();
    items.forEach((value) => {
      const meta = presentation(value);
      statusCounts.set(meta.status, (statusCounts.get(meta.status) || 0) + 1);
      groupCounts.set(meta.group, (groupCounts.get(meta.group) || 0) + 1);
    });
    return {
      total: items.length,
      statuses: Array.from(statusCounts, ([label, count]) => ({ label, count })),
      groups: GROUP_ORDER
        .filter((name) => groupCounts.has(name))
        .map((name) => ({ group: name, count: groupCounts.get(name), className: `is-${name}` }))
    };
  }

  return Object.freeze({ GROUPS, GROUP_ORDER, key, group, status, presentation, summarize });
});
