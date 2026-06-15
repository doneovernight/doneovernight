const { attention, fetchWithTimeout, healthy, unavailable } = require("./utils");

const TIME_ZONE = "Europe/Amsterdam";
const DELIVERED_STATES = ["delivered", "completed", "delivery_complete", "delivered_ready"];
const PENDING_REVIEW_STATES = ["new", "review_pending", "pending_review", "under_review", "request_received"];
const QUOTE_NEEDED_STATES = ["new", "review_pending", "pending_review", "under_review", "quote_preparation"];
const PAYMENT_STATES = ["awaiting_payment", "payment_pending"];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value) {
  return clean(value).toLowerCase();
}

function valueResult(source, value, detail = {}) {
  return healthy(source, {
    value,
    state: detail.state || "live",
    ...detail
  });
}

function attentionValue(source, value, reason) {
  return valueResult(source, value, {
    state: value > 0 ? "waiting" : "live",
    reason
  });
}

function hasSupabase(config = {}) {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

async function supabaseGet(config, path) {
  return fetchWithTimeout(`${config.supabaseUrl}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      Accept: "application/json"
    }
  });
}

async function selectRows(config, { table, columns = "*", filters = [], order = "created_at.desc", limit = 1000 }) {
  if (!hasSupabase(config)) return [];
  const query = [
    `${table}?select=${encodeURIComponent(columns)}`,
    ...filters,
    order ? `order=${order}` : "",
    `limit=${limit}`
  ].filter(Boolean).join("&");

  try {
    const response = await supabaseGet(config, query);
    if (!response.ok) return [];
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function getTimeZoneOffsetMs(date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day }, timeZone = TIME_ZONE) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(utcGuess, timeZone));
}

function getTodayWindow(now = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const start = zonedDateTimeToUtc({ year, month, day }, timeZone);
  const nextNoon = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const nextParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(nextNoon).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const end = zonedDateTimeToUtc({
    year: Number(nextParts.year),
    month: Number(nextParts.month),
    day: Number(nextParts.day)
  }, timeZone);
  return { timeZone, startAt: start.toISOString(), endAt: end.toISOString() };
}

function isInWindow(value, window) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time)
    && time >= new Date(window.startAt).getTime()
    && time < new Date(window.endAt).getTime();
}

function taskStates(task = {}) {
  return [
    task.status,
    task.state,
    task.delivery_status,
    task.payment_status,
    task.raw_payload?.status,
    task.raw_payload?.state,
    task.raw_payload?.delivery_status,
    task.raw_payload?.payment_status
  ].map(normalizeStatus).filter(Boolean);
}

function hasState(task, states) {
  return taskStates(task).some((state) => states.includes(state));
}

function isQuoteNeeded(task = {}) {
  return hasState(task, QUOTE_NEEDED_STATES) && !task.quote_amount && !task.payment_link;
}

function clientBudget(task = {}) {
  return clean(task.client_budget)
    || clean(task.budget)
    || clean(task.clientBudget)
    || clean(task.project_budget)
    || clean(task.estimatedBudget)
    || clean(task.raw_payload?.client_budget)
    || clean(task.raw_payload?.budget)
    || clean(task.raw_payload?.clientBudget)
    || clean(task.raw_payload?.project_budget)
    || clean(task.raw_payload?.estimatedBudget)
    || "";
}

function taskId(task = {}) {
  return clean(task.task_id) || clean(task.taskId) || clean(task.id) || "Unavailable";
}

function operatorStatus(record = {}) {
  return normalizeStatus(record.status || record.approval_state || record.state || record.status_group);
}

function operatorGroup(record = {}) {
  const status = operatorStatus(record);
  if (["active", "approved", "live"].includes(status)) return "active";
  if (["deleted", "removed"].includes(status) || record.deleted_at) return "deleted";
  if (["revoked", "inactive", "rejected", "cancelled", "archived"].includes(status)) return "inactive";
  return "pending";
}

function mergeOperator(map, email, record = {}) {
  const key = clean(email).toLowerCase();
  if (!key) return;
  const current = map.get(key) || { email: key };
  map.set(key, {
    ...current,
    ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""))
  });
}

async function getOperatorRows(config) {
  const [operators, profiles, applicationSnapshots, portalApplications] = await Promise.all([
    selectRows(config, { table: "operators", limit: 1000 }),
    selectRows(config, { table: "operator_profiles", limit: 1000 }),
    selectRows(config, { table: "operator_applications", limit: 1000 }),
    selectRows(config, { table: "portal_requests", filters: ["source=eq.operator_apply"], limit: 1000 })
  ]);
  const byEmail = new Map();

  operators.forEach((operator) => {
    mergeOperator(byEmail, operator.email, {
      email: operator.email,
      status: operator.status,
      created_at: operator.created_at,
      updated_at: operator.updated_at,
      source: "operators"
    });
  });
  profiles.forEach((profile) => {
    mergeOperator(byEmail, profile.email, {
      email: profile.email,
      name: profile.full_name || profile.display_name,
      status: profile.status,
      approved_at: profile.approved_at,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      deleted_at: profile.deleted_at,
      source: "operator_profiles"
    });
  });
  applicationSnapshots.forEach((application) => {
    const raw = application.submitted_payload || {};
    mergeOperator(byEmail, application.email || raw.email, {
      email: application.email || raw.email,
      name: raw.name || raw.full_name,
      status: application.approval_state,
      created_at: application.created_at,
      updated_at: application.updated_at,
      source: "operator_applications"
    });
  });
  portalApplications.forEach((application) => {
    mergeOperator(byEmail, application.email, {
      email: application.email,
      name: application.name,
      status: application.status,
      created_at: application.created_at,
      updated_at: application.updated_at,
      source: application.source || "operator_apply"
    });
  });

  return [...byEmail.values()].filter((operator) => operatorGroup(operator) !== "deleted");
}

function latestByDate(rows, fields = ["created_at", "updated_at"]) {
  return [...rows].filter(Boolean).sort((a, b) => {
    const aTime = Math.max(...fields.map((field) => new Date(a[field] || 0).getTime()).filter(Number.isFinite));
    const bTime = Math.max(...fields.map((field) => new Date(b[field] || 0).getTime()).filter(Number.isFinite));
    return bTime - aTime;
  })[0] || null;
}

function formatLatestAsk(task) {
  if (!task) return unavailable("Latest Ask", "No asks found");
  const budget = clientBudget(task);
  return valueResult("Latest Ask", taskId(task), {
    task_id: taskId(task),
    client: clean(task.name) || clean(task.email) || "Unknown client",
    source: clean(task.source) || clean(task.raw_payload?.source) || "Unavailable",
    budget,
    created_at: task.created_at || null,
    reason: [
      clean(task.name) || clean(task.email) || "Unknown client",
      budget ? `Budget: ${budget}` : "Budget: Not provided",
      clean(task.source) || clean(task.raw_payload?.source) || "Source unavailable"
    ].join(" · ")
  });
}

function formatLatestDispatch(contact) {
  if (!contact) return unavailable("Latest Dispatch Signup", "No Dispatch signups found");
  return valueResult("Latest Dispatch Signup", clean(contact.email) || "Dispatch contact", {
    email: clean(contact.email),
    source: clean(contact.source) || clean(contact.last_source) || clean(contact.page_hostname) || "Unavailable",
    created_at: contact.dispatch_subscribed_at || contact.created_at || null,
    reason: `${clean(contact.source) || clean(contact.last_source) || "Source unavailable"} · ${contact.dispatch_subscribed_at || contact.created_at || "Timestamp unavailable"}`
  });
}

function formatLatestOperator(application) {
  if (!application) return unavailable("Latest Operator Application", "No operator applications found");
  const raw = application.submitted_payload || application.raw_payload || {};
  return valueResult("Latest Operator Application", clean(application.email) || clean(raw.email) || "Operator application", {
    email: clean(application.email) || clean(raw.email),
    source: clean(application.source) || "operator_apply",
    created_at: application.created_at || null,
    reason: `${clean(application.source) || "operator_apply"} · ${application.created_at || "Timestamp unavailable"}`
  });
}

async function getOperationsSummary(config = {}) {
  if (!hasSupabase(config)) {
    const missing = unavailable("Operations", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return {
      status: "Unavailable",
      reason: missing.reason,
      asks: {},
      dispatch: {},
      operators: {},
      latest: {}
    };
  }

  const window = getTodayWindow(config.generatedAt instanceof Date ? config.generatedAt : new Date());
  const [tasks, contacts, operatorRows, latestOperatorSnapshots, latestOperatorPortal] = await Promise.all([
    selectRows(config, { table: "task_requests", limit: 5000 }),
    selectRows(config, {
      table: "crm_contacts",
      filters: ["dispatch_subscribed=eq.true"],
      order: "dispatch_subscribed_at.desc",
      limit: 5000
    }),
    getOperatorRows(config),
    selectRows(config, { table: "operator_applications", limit: 10 }),
    selectRows(config, { table: "portal_requests", filters: ["source=eq.operator_apply"], limit: 10 })
  ]);

  const asksTodayCount = tasks.filter((task) => isInWindow(task.created_at, window)).length;
  const pendingReviewCount = tasks.filter((task) => hasState(task, PENDING_REVIEW_STATES)).length;
  const quoteNeededCount = tasks.filter(isQuoteNeeded).length;
  const awaitingPaymentCount = tasks.filter((task) => hasState(task, PAYMENT_STATES)).length;
  const deliveredCount = tasks.filter((task) => hasState(task, DELIVERED_STATES)).length;
  const dispatchTodayCount = contacts.filter((contact) => isInWindow(contact.dispatch_subscribed_at || contact.created_at, window)).length;
  const activeOperators = operatorRows.filter((operator) => operatorGroup(operator) === "active").length;
  const pendingOperators = operatorRows.filter((operator) => operatorGroup(operator) === "pending").length;
  const latestAsk = latestByDate(tasks, ["created_at"]);
  const latestDispatch = latestByDate(contacts, ["dispatch_subscribed_at", "created_at"]);
  const latestOperator = latestByDate([...latestOperatorSnapshots, ...latestOperatorPortal], ["created_at", "updated_at"]);

  return {
    status: "Healthy",
    window,
    asks: {
      today: valueResult("Asks today", asksTodayCount),
      pendingReview: attentionValue("Pending review", pendingReviewCount, "Asks waiting for review"),
      quoteNeeded: attentionValue("Quote needed", quoteNeededCount, "Asks needing quote preparation"),
      awaitingPayment: attentionValue("Awaiting payment", awaitingPaymentCount, "Approved quotes awaiting payment"),
      delivered: valueResult("Delivered", deliveredCount)
    },
    dispatch: {
      today: valueResult("Dispatch signups today", dispatchTodayCount),
      total: valueResult("Dispatch total", contacts.length),
      latest: formatLatestDispatch(latestDispatch)
    },
    operators: {
      active: valueResult("Operators active", activeOperators),
      pending: attentionValue("Operators pending", pendingOperators, "Operator applications pending"),
      total: valueResult("Operators total", operatorRows.length)
    },
    latest: {
      ask: formatLatestAsk(latestAsk),
      dispatchSignup: formatLatestDispatch(latestDispatch),
      operatorApplication: formatLatestOperator(latestOperator)
    }
  };
}

module.exports = {
  getOperationsSummary
};
