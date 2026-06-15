const { attention, fetchWithTimeout, healthy, unavailable } = require("./utils");

const TIME_ZONE = "Europe/Amsterdam";

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

function getVercelAnalyticsStatus() {
  return {
    todayVisits: unavailable("Today visits", "Vercel Analytics not connected yet"),
    homepageVisits: unavailable("Homepage visits", "Vercel Analytics not connected yet"),
    askVisits: unavailable("Ask visits", "Vercel Analytics not connected yet"),
    reviewVisits: unavailable("Review visits", "Vercel Analytics not connected yet"),
    dispatchSignups: unavailable("Dispatch signups", "Vercel Analytics not connected yet"),
    topPublicRoute: unavailable("Top public route", "Vercel Analytics not connected yet"),
    connection: unavailable("Vercel Analytics", "No Vercel Analytics API token or export source configured")
  };
}

async function getAnalyticsSummary(config = {}) {
  const window = getTodayWindow(config.generatedAt instanceof Date ? config.generatedAt : new Date());
  const [signals] = await Promise.all([
    getSupabaseSignals(config, window)
  ]);
  const vercel = getVercelAnalyticsStatus(config);

  return {
    generatedAt: new Date().toISOString(),
    window,
    status: "Unavailable",
    source: "Vercel Analytics not connected",
    vercel,
    signals,
    traffic: {
      todayVisits: vercel.todayVisits,
      homepageVisits: vercel.homepageVisits,
      askVisits: vercel.askVisits,
      reviewVisits: vercel.reviewVisits,
      dispatchSignups: vercel.dispatchSignups,
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
