const { attention, fetchWithTimeout, healthy, unavailable } = require("./utils");

const TIME_ZONE = "Europe/Amsterdam";
const VERCEL_OBSERVABILITY_QUERY_URL = "https://api.vercel.com/v2/observability/query";
const ANALYTICS_UNAVAILABLE = "Analytics temporarily unavailable";
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

function sumRows(rows = [], metric = "vercel.request.count") {
  const rollupKey = `${String(metric).replace(/\./g, "_")}_sum`;

  return rows.reduce((total, row) => {
    const value = Number(row?.[rollupKey] ?? row?.value ?? row?.count ?? row?.total ?? 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
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

function countForRoute(rows, matcher, metric) {
  return sumRows(rows.filter((row) => routeMatches(row.route || row.path || row.host || row.pathname, matcher)), metric);
}

function topRoute(rows = [], metric) {
  const totals = new Map();

  rows.forEach((row) => {
    const route = normalizeRoute(row.route || row.path || row.pathname || row.host || "Unknown route");
    if (!route) return;
    const value = sumRows([row], metric);
    totals.set(route, (totals.get(route) || 0) + value);
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

async function queryVercelRouteMetrics(config, window, { source = "Vercel Analytics" } = {}) {
  const token = cleanSignal(config.vercelAnalyticsToken);
  const teamId = cleanSignal(config.vercelAnalyticsTeamId);
  const projectId = cleanSignal(config.vercelAnalyticsProjectId);
  const metric = cleanSignal(config.vercelAnalyticsMetric) || "vercel.request.count";

  if (!token) return unavailable(source, "Missing VERCEL_ANALYTICS_TOKEN");
  if (!teamId) return unavailable(source, "Missing VERCEL_ANALYTICS_TEAM_ID");
  if (!projectId) return unavailable(source, "Missing VERCEL_ANALYTICS_PROJECT_ID");

  const startedAt = Date.now();
  const body = {
    scope: {
      type: "project",
      ownerId: teamId,
      projectIds: [projectId]
    },
    metric,
    aggregation: "sum",
    startTime: window.startAt,
    endTime: window.endAt,
    granularity: { hours: 1 },
    groupBy: ["route"],
    limit: 100
  };

  try {
    const response = await fetchWithTimeout(`${VERCEL_OBSERVABILITY_QUERY_URL}?teamId=${encodeURIComponent(teamId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    }, 10_000);
    const responseTimeMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const reason = payload?.error?.message || payload?.message || `Vercel Analytics HTTP ${response.status}`;
      return attention(source, reason, {
        code: response.status,
        responseTimeMs,
        endpoint: "/v2/observability/query",
        metric
      });
    }

    return healthy(source, {
      data: Array.isArray(payload.data) ? payload.data : [],
      summary: Array.isArray(payload.summary) ? payload.summary : [],
      statistics: payload.statistics || {},
      code: response.status,
      responseTimeMs,
      endpoint: "/v2/observability/query",
      metric,
      window
    });
  } catch (error) {
    return attention(source, error.name === "AbortError" ? "Vercel Analytics query timed out" : "Vercel Analytics query failed", {
      responseTimeMs: Date.now() - startedAt,
      endpoint: "/v2/observability/query",
      metric
    });
  }
}

async function getVercelAnalyticsStatus(config, window) {
  const previousWindow = getPreviousWindow(window);
  const [todayResult, previousResult] = await Promise.all([
    queryVercelRouteMetrics(config, window, { source: "Vercel Analytics today" }),
    queryVercelRouteMetrics(config, previousWindow, { source: "Vercel Analytics yesterday" })
  ]);

  const fallbackCard = (source, reason = ANALYTICS_UNAVAILABLE) => unavailable(source, reason);
  if (todayResult.status !== "Healthy") {
    const reason = todayResult.reason || ANALYTICS_UNAVAILABLE;
    return {
      todayVisits: fallbackCard("Today visits", reason),
      homepageVisits: fallbackCard("Homepage visits", reason),
      askVisits: fallbackCard("Ask visits", reason),
      startVisits: fallbackCard("Start visits", reason),
      reviewVisits: fallbackCard("Review visits", reason),
      workspaceVisits: fallbackCard("Workspace visits", reason),
      adminVisits: fallbackCard("Admin visits", reason),
      trafficTrend: fallbackCard("Traffic trend", reason),
      topPublicRoute: fallbackCard("Top page", reason),
      connection: todayResult,
      endpoint: "/v2/observability/query"
    };
  }

  const rows = todayResult.data || [];
  const previousRows = previousResult.status === "Healthy" ? previousResult.data || [] : [];
  const metric = todayResult.metric || config.vercelAnalyticsMetric || "vercel.request.count";
  const totalToday = Math.round(sumRows(rows, metric));
  const totalPrevious = Math.round(sumRows(previousRows, metric));
  const bestRoute = topRoute(rows, metric);
  const makeRouteSignal = (key) => {
    const matcher = TRACKED_ROUTE_MATCHERS[key];
    const value = Math.round(countForRoute(rows, matcher, metric));
    return healthy(matcher.label, {
      value,
      responseTimeMs: todayResult.responseTimeMs,
      reason: "Vercel route metric"
    });
  };

  return {
    todayVisits: healthy("Today visits", {
      value: totalToday,
      responseTimeMs: todayResult.responseTimeMs,
      reason: "Vercel route metric"
    }),
    homepageVisits: makeRouteSignal("homepageVisits"),
    askVisits: makeRouteSignal("askVisits"),
    startVisits: makeRouteSignal("startVisits"),
    reviewVisits: makeRouteSignal("reviewVisits"),
    workspaceVisits: makeRouteSignal("workspaceVisits"),
    adminVisits: makeRouteSignal("adminVisits"),
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
          count: Math.round(bestRoute.count),
          reason: "Vercel route metric",
          responseTimeMs: todayResult.responseTimeMs
        })
      : unavailable("Top page", "No Vercel route traffic in this window"),
    connection: healthy("Vercel Analytics", {
      value: "Connected",
      responseTimeMs: todayResult.responseTimeMs,
      endpoint: "/v2/observability/query",
      metric
    }),
    endpoint: "/v2/observability/query",
    metric
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
      : unavailable("Top page", "Vercel route analytics not connected yet")
  };
}

async function getAnalyticsSummary(config = {}) {
  const window = getTodayWindow(config.generatedAt instanceof Date ? config.generatedAt : new Date());
  const [signals, vercel] = await Promise.all([
    getSupabaseSignals(config, window),
    getVercelAnalyticsStatus(config, window)
  ]);
  const connected = vercel.connection?.status === "Healthy";

  return {
    generatedAt: new Date().toISOString(),
    window,
    status: connected ? "Connected" : "Unavailable",
    source: connected ? "Vercel Analytics" : ANALYTICS_UNAVAILABLE,
    vercel,
    signals,
    traffic: {
      todayVisits: vercel.todayVisits,
      homepageVisits: vercel.homepageVisits,
      askVisits: vercel.askVisits,
      startVisits: vercel.startVisits,
      reviewVisits: vercel.reviewVisits,
      workspaceVisits: vercel.workspaceVisits,
      adminVisits: vercel.adminVisits,
      trafficTrend: vercel.trafficTrend,
      topPublicRoute: vercel.topPublicRoute
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
