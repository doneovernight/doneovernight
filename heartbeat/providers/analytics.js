const { attention, fetchWithTimeout, healthy, unavailable } = require("./utils");

const TIME_ZONE = "Europe/Amsterdam";
const EVENT_TABLE = "analytics_events";
const ANALYTICS_UNAVAILABLE = "First-party analytics unavailable";
const TRACKED_ROUTE_MATCHERS = {
  homepageVisits: {
    label: "Homepage visits",
    matches: ["/", "/index", "/index.html", "/index/"]
  },
  askVisits: {
    label: "Ask visits",
    includes: ["/ask", "ask.doneovernight.com"]
  },
  startVisits: {
    label: "Start visits",
    includes: ["/start", "start.doneovernight.com"]
  },
  reviewVisits: {
    label: "Review visits",
    includes: ["/review", "/portal/review", "portal.doneovernight.com/review"]
  },
  workspaceVisits: {
    label: "Workspace visits",
    includes: ["/workspace", "portal.doneovernight.com/workspace", "client.doneovernight.com/workspace"]
  },
  adminVisits: {
    label: "Admin visits",
    includes: ["/admin", "admin.doneovernight.com"]
  }
};

function parseContentRangeCount(value) {
  const match = String(value || "").match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") return null;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) ? count : null;
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

function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = TIME_ZONE) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
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
  const nextLocalNoon = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const nextParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(nextLocalNoon).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const end = zonedDateTimeToUtc({
    year: Number(nextParts.year),
    month: Number(nextParts.month),
    day: Number(nextParts.day)
  }, timeZone);

  return {
    timeZone,
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}

function getPreviousWindow(window) {
  const start = new Date(window.startAt);
  const end = new Date(window.endAt);
  const duration = end.getTime() - start.getTime();

  return {
    timeZone: window.timeZone,
    startAt: new Date(start.getTime() - duration).toISOString(),
    endAt: start.toISOString()
  };
}

function hasSupabase(config = {}) {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

async function supabaseGet(config, path, options = {}) {
  const response = await fetchWithTimeout(`${config.supabaseUrl}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  return response;
}

async function countSupabase(config, { source, table, column = "id", filters = [] }) {
  if (!hasSupabase(config)) {
    return unavailable(source, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const query = [
    `${table}?select=${encodeURIComponent(column)}`,
    ...filters
  ].join("&");
  const startedAt = Date.now();

  try {
    const response = await supabaseGet(config, query, {
      headers: {
        Prefer: "count=exact",
        Range: "0-0"
      }
    });
    const responseTimeMs = Date.now() - startedAt;

    if (!response.ok) return attention(source, `Supabase HTTP ${response.status}`, { code: response.status, responseTimeMs });
    const count = parseContentRangeCount(response.headers.get("content-range"));
    return healthy(source, {
      value: count === null ? 0 : count,
      code: response.status,
      responseTimeMs
    });
  } catch (error) {
    return attention(source, error.name === "AbortError" ? "Timed out" : "Supabase query failed", {
      responseTimeMs: Date.now() - startedAt
    });
  }
}

async function selectSupabase(config, { source, table, columns = "source,created_at,raw_payload", filters = [], limit = 500 }) {
  if (!hasSupabase(config)) return [];
  const query = [
    `${table}?select=${encodeURIComponent(columns)}`,
    ...filters,
    "order=created_at.desc",
    `limit=${limit}`
  ].join("&");

  try {
    const response = await supabaseGet(config, query);
    if (!response.ok) return [];
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function cleanSignal(value) {
  return typeof value === "string" ? value.trim() : "";
}

function topValue(rows, readers) {
  const counts = new Map();
  rows.forEach((row) => {
    const value = readers.map((reader) => cleanSignal(reader(row))).find(Boolean);
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const [value, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return value ? { value, count } : null;
}

function signalFromResult(result, emptyReason) {
  if (result.status !== "Healthy") return result;
  if (!Number(result.value)) {
    return {
      ...result,
      reason: emptyReason || "No records in this window"
    };
  }
  return result;
}

function normalizeRoute(value) {
  return String(value || "").trim();
}

function routeMatches(route, matcher = {}) {
  const cleanRoute = normalizeRoute(route);
  const lowerRoute = cleanRoute.toLowerCase();
  if (!cleanRoute) return false;
  if (matcher.matches?.some((candidate) => lowerRoute === candidate.toLowerCase())) return true;
  return matcher.includes?.some((candidate) => lowerRoute.includes(candidate.toLowerCase())) || false;
}

function countEvents(rows = [], predicate = () => true) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0);
}

function countEventType(rows = [], eventType) {
  return countEvents(rows, (row) => row.event_type === eventType);
}

function countPageViewsForRoute(rows = [], matcher = {}) {
  return countEvents(rows, (row) => row.event_type === "page_view" && routeMatches(row.route, matcher));
}

function topRoute(rows = []) {
  const totals = new Map();

  rows
    .filter((row) => row.event_type === "page_view")
    .forEach((row) => {
      const route = normalizeRoute(row.route || "Unknown route");
      if (!route) return;
      totals.set(route, (totals.get(route) || 0) + 1);
    });

  const [route, count] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return route ? { route, count } : null;
}

function formatTrend(today, previous) {
  if (!Number.isFinite(today) || !Number.isFinite(previous)) return "Unavailable";
  if (previous <= 0) return today > 0 ? "New traffic today" : "No traffic yet today";
  const delta = Math.round(((today - previous) / previous) * 100);
  if (delta === 0) return "Flat vs yesterday";
  return `${delta > 0 ? "+" : ""}${delta}% vs yesterday`;
}

function getTrafficState(today, previous) {
  if (!Number.isFinite(today) || !Number.isFinite(previous)) return "Unavailable";
  if (today > 0 || previous > 0) return "Healthy";
  return "Needs attention";
}

async function queryAnalyticsEvents(config, window, { source = "First-party analytics" } = {}) {
  if (!hasSupabase(config)) {
    return unavailable(source, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const startedAt = Date.now();
  const query = [
    `${EVENT_TABLE}?select=${encodeURIComponent("event_type,task_id,source,route,referrer,session_id,created_at,metadata")}`,
    `created_at=gte.${encodeURIComponent(window.startAt)}`,
    `created_at=lt.${encodeURIComponent(window.endAt)}`,
    "order=created_at.desc",
    "limit=10000"
  ].join("&");

  try {
    const response = await supabaseGet(config, query);
    const responseTimeMs = Date.now() - startedAt;

    if (!response.ok) {
      return attention(source, `Supabase events HTTP ${response.status}`, {
        code: response.status,
        responseTimeMs,
        table: EVENT_TABLE
      });
    }

    const rows = await response.json().catch(() => []);
    return healthy(source, {
      data: Array.isArray(rows) ? rows : [],
      code: response.status,
      responseTimeMs,
      table: EVENT_TABLE,
      window
    });
  } catch (error) {
    return attention(source, error.name === "AbortError" ? "Supabase events query timed out" : "Supabase events query failed", {
      responseTimeMs: Date.now() - startedAt,
      table: EVENT_TABLE
    });
  }
}

function makeEventSignal(source, value, responseTimeMs, reason = "First-party event count") {
  return healthy(source, {
    value,
    responseTimeMs,
    reason
  });
}

function makeConversionFunnel(rows = [], responseTimeMs = 0) {
  const visits = countEventType(rows, "page_view");
  const asks = countEventType(rows, "ask_submitted");
  const reviews = countEventType(rows, "review_opened");
  const plans = countEventType(rows, "execution_plan_viewed");
  const approvals = countEventType(rows, "approve_start_clicked");
  const payments = countEventType(rows, "payment_link_clicked");
  const workspaces = countEventType(rows, "workspace_opened");

  return healthy("Conversion funnel", {
    value: `Visit ${visits} → Ask ${asks} → Review ${reviews} → Plan ${plans} → Approve ${approvals} → Pay ${payments} → Workspace ${workspaces}`,
    responseTimeMs,
    reason: "First-party event funnel",
    stages: { visits, asks, reviews, plans, approvals, payments, workspaces }
  });
}

async function getFirstPartyAnalyticsStatus(config, window) {
  const previousWindow = getPreviousWindow(window);
  const [todayResult, previousResult] = await Promise.all([
    queryAnalyticsEvents(config, window, { source: "First-party events today" }),
    queryAnalyticsEvents(config, previousWindow, { source: "First-party events yesterday" })
  ]);

  const fallbackCard = (source, reason = ANALYTICS_UNAVAILABLE) => unavailable(source, reason);
  if (todayResult.status !== "Healthy") {
    const reason = todayResult.reason || ANALYTICS_UNAVAILABLE;
    return {
      todayVisits: fallbackCard("Today visits", reason),
      homepageVisits: fallbackCard("Homepage visits", reason),
      askViews: fallbackCard("Ask views", reason),
      askVisits: fallbackCard("Ask views", reason),
      reviewOpens: fallbackCard("Review opens", reason),
      reviewVisits: fallbackCard("Review opens", reason),
      executionPlanViews: fallbackCard("Execution plan views", reason),
      paymentClicks: fallbackCard("Payment clicks", reason),
      workspaceOpens: fallbackCard("Workspace opens", reason),
      workspaceVisits: fallbackCard("Workspace opens", reason),
      trafficTrend: fallbackCard("Traffic trend", reason),
      topPublicRoute: fallbackCard("Top page", reason),
      conversionFunnel: fallbackCard("Conversion funnel", reason),
      connection: todayResult,
      endpoint: EVENT_TABLE
    };
  }

  const rows = todayResult.data || [];
  const previousRows = previousResult.status === "Healthy" ? previousResult.data || [] : [];
  const totalToday = countEventType(rows, "page_view");
  const totalPrevious = countEventType(previousRows, "page_view");
  const bestRoute = topRoute(rows);
  const homepageViews = countPageViewsForRoute(rows, TRACKED_ROUTE_MATCHERS.homepageVisits);
  const askViews = countPageViewsForRoute(rows, TRACKED_ROUTE_MATCHERS.askVisits);
  const reviewOpens = countEventType(rows, "review_opened");
  const executionPlanViews = countEventType(rows, "execution_plan_viewed");
  const paymentClicks = countEventType(rows, "payment_link_clicked");
  const workspaceOpens = countEventType(rows, "workspace_opened") + countPageViewsForRoute(rows, TRACKED_ROUTE_MATCHERS.workspaceVisits);

  return {
    todayVisits: makeEventSignal("Today visits", totalToday, todayResult.responseTimeMs, "First-party page_view events"),
    homepageVisits: makeEventSignal("Homepage visits", homepageViews, todayResult.responseTimeMs),
    askViews: makeEventSignal("Ask views", askViews, todayResult.responseTimeMs),
    askVisits: makeEventSignal("Ask views", askViews, todayResult.responseTimeMs),
    reviewOpens: makeEventSignal("Review opens", reviewOpens, todayResult.responseTimeMs),
    reviewVisits: makeEventSignal("Review opens", reviewOpens, todayResult.responseTimeMs),
    executionPlanViews: makeEventSignal("Execution plan views", executionPlanViews, todayResult.responseTimeMs),
    paymentClicks: makeEventSignal("Payment clicks", paymentClicks, todayResult.responseTimeMs),
    workspaceOpens: makeEventSignal("Workspace opens", workspaceOpens, todayResult.responseTimeMs),
    workspaceVisits: makeEventSignal("Workspace opens", workspaceOpens, todayResult.responseTimeMs),
    trafficTrend: {
      source: "Traffic trend",
      status: getTrafficState(totalToday, totalPrevious),
      value: formatTrend(totalToday, totalPrevious),
      reason: `Today ${totalToday} · yesterday ${totalPrevious}`,
      responseTimeMs: todayResult.responseTimeMs
    },
    topPublicRoute: bestRoute
      ? healthy("Top page", {
          value: bestRoute.route,
          count: bestRoute.count,
          reason: "First-party page_view events",
          responseTimeMs: todayResult.responseTimeMs
        })
      : unavailable("Top page", "No page_view events in this window"),
    conversionFunnel: makeConversionFunnel(rows, todayResult.responseTimeMs),
    connection: healthy("First-party analytics", {
      value: "Connected",
      responseTimeMs: todayResult.responseTimeMs,
      table: EVENT_TABLE
    }),
    endpoint: EVENT_TABLE,
    rows
  };
}

async function getSupabaseSignals(config, window) {
  const filters = [
    `created_at=gte.${encodeURIComponent(window.startAt)}`,
    `created_at=lt.${encodeURIComponent(window.endAt)}`
  ];
  const dispatchFilters = [
    "dispatch_subscribed=eq.true",
    `dispatch_subscribed_at=gte.${encodeURIComponent(window.startAt)}`,
    `dispatch_subscribed_at=lt.${encodeURIComponent(window.endAt)}`
  ];

  const [
    askSubmissionsToday,
    askSubmissionsTotal,
    dispatchSignupsToday,
    dispatchSignupsTotal,
    taskRowsToday,
    dispatchRowsToday
  ] = await Promise.all([
    countSupabase(config, { source: "Ask submissions today", table: "task_requests", filters }),
    countSupabase(config, { source: "Ask submissions total", table: "task_requests" }),
    countSupabase(config, {
      source: "Dispatch signups today",
      table: "crm_contacts",
      filters: dispatchFilters
    }),
    countSupabase(config, {
      source: "Dispatch signups total",
      table: "crm_contacts",
      filters: ["dispatch_subscribed=eq.true"]
    }),
    selectSupabase(config, {
      source: "Task signals",
      table: "task_requests",
      columns: "source,created_at,raw_payload",
      filters,
      limit: 500
    }),
    selectSupabase(config, {
      source: "Dispatch signals",
      table: "crm_contacts",
      columns: "source,last_source,page_hostname,created_at,dispatch_subscribed_at,raw_payload",
      filters: dispatchFilters,
      limit: 500
    })
  ]);

  const topSource = topValue([...taskRowsToday, ...dispatchRowsToday], [
    (row) => row.source,
    (row) => row.last_source,
    (row) => row.raw_payload?.source,
    (row) => row.raw_payload?.page_hostname
  ]);
  const topPage = topValue(dispatchRowsToday, [
    (row) => row.page_hostname,
    (row) => row.raw_payload?.page_hostname,
    (row) => row.raw_payload?.page,
    (row) => row.raw_payload?.url
  ]);

  return {
    askSubmissionsToday: signalFromResult(askSubmissionsToday, "No asks submitted today"),
    askSubmissionsTotal,
    dispatchSignupsToday: signalFromResult(dispatchSignupsToday, "No Dispatch signups today"),
    dispatchSignupsTotal,
    topSource: topSource
      ? healthy("Top source", { value: topSource.value, count: topSource.count })
      : unavailable("Top source", "No source data available today"),
    topPage: topPage
      ? healthy("Top page", { value: topPage.value, count: topPage.count })
      : unavailable("Top page", "No first-party page events available yet")
  };
}

async function getAnalyticsSummary(config = {}) {
  const window = getTodayWindow(config.generatedAt instanceof Date ? config.generatedAt : new Date());
  const firstParty = await getFirstPartyAnalyticsStatus(config, window);
  const connected = firstParty.connection?.status === "Healthy";
  const signals = {
    askSubmissionsToday: firstParty.askSubmitted || makeEventSignal("Ask submissions today", firstParty.conversionFunnel?.stages?.asks || 0, firstParty.connection?.responseTimeMs || 0),
    askSubmissionsTotal: unavailable("Ask submissions total", "Use operations task counts for lifetime asks"),
    dispatchSignupsToday: unavailable("Dispatch signups today", "Dispatch is tracked in crm_contacts, not analytics_events"),
    dispatchSignupsTotal: unavailable("Dispatch signups total", "Dispatch is tracked in crm_contacts, not analytics_events"),
    topSource: unavailable("Top source", "Source breakdown is not surfaced yet"),
    topPage: firstParty.topPublicRoute
  };

  return {
    generatedAt: new Date().toISOString(),
    window,
    status: connected ? "Connected" : "Unavailable",
    source: connected ? "First-party Supabase analytics" : ANALYTICS_UNAVAILABLE,
    provider: connected ? "supabase_analytics_events" : "supabase_analytics_events_unavailable",
    vercel: {
      connection: unavailable("External analytics", "Disabled. DONEOVERNIGHT now uses first-party Supabase events.")
    },
    firstParty,
    signals,
    traffic: {
      todayVisits: firstParty.todayVisits,
      homepageVisits: firstParty.homepageVisits,
      askViews: firstParty.askViews,
      askVisits: firstParty.askViews,
      reviewOpens: firstParty.reviewOpens,
      reviewVisits: firstParty.reviewOpens,
      executionPlanViews: firstParty.executionPlanViews,
      paymentClicks: firstParty.paymentClicks,
      workspaceOpens: firstParty.workspaceOpens,
      workspaceVisits: firstParty.workspaceOpens,
      trafficTrend: firstParty.trafficTrend,
      topPublicRoute: firstParty.topPublicRoute,
      conversionFunnel: firstParty.conversionFunnel
    },
    conversions: {
      askSubmissionsToday: signals.askSubmissionsToday,
      askSubmissionsTotal: signals.askSubmissionsTotal,
      dispatchSignupsToday: signals.dispatchSignupsToday,
      dispatchSignupsTotal: signals.dispatchSignupsTotal
    }
  };
}

module.exports = {
  getAnalyticsSummary
};
