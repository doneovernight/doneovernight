const { attention, fetchWithTimeout, healthy, unavailable } = require("./utils");

async function checkHttp({ source, url, expectedStatuses = [200], method = "GET" }) {
  if (!url) return unavailable(source, "Missing URL");

  try {
    const response = await fetchWithTimeout(url, {
      method,
      headers: {
        Accept: "application/json, text/html;q=0.9, */*;q=0.8"
      }
    });

    const ok = expectedStatuses.includes(response.status);
    return ok
      ? healthy(source, { code: response.status })
      : attention(source, `HTTP ${response.status}`, { code: response.status });
  } catch (error) {
    return attention(source, error.name === "AbortError" ? "Timed out" : "Request failed");
  }
}

async function checkSupabase(config) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return unavailable("Supabase", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  try {
    const response = await fetchWithTimeout(`${config.supabaseUrl}/rest/v1/task_requests?select=task_id&limit=1`, {
      method: "GET",
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        Accept: "application/json"
      }
    });

    if (response.ok) return healthy("Supabase", { code: response.status });
    return attention("Supabase", `HTTP ${response.status}`, { code: response.status });
  } catch (error) {
    return attention("Supabase", error.name === "AbortError" ? "Timed out" : "Request failed");
  }
}

function parseContentRangeCount(value) {
  const match = String(value || "").match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") return null;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) ? count : null;
}

async function countSupabaseTable(config, { source, table, column = "id", filter = "" }) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return unavailable(source, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const query = `${table}?select=${encodeURIComponent(column)}${filter ? `&${filter}` : ""}`;

  try {
    const response = await fetchWithTimeout(`${config.supabaseUrl}/rest/v1/${query}`, {
      method: "GET",
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        Accept: "application/json",
        Prefer: "count=exact",
        Range: "0-0"
      }
    });

    if (!response.ok) return attention(source, `HTTP ${response.status}`, { code: response.status });
    const count = parseContentRangeCount(response.headers.get("content-range"));
    return healthy(source, {
      value: count === null ? "Available" : count,
      code: response.status
    });
  } catch (error) {
    return attention(source, error.name === "AbortError" ? "Timed out" : "Request failed");
  }
}

async function checkGitHub(config) {
  return checkHttp({
    source: "GitHub",
    url: config.repositoryUrl,
    expectedStatuses: [200]
  });
}

async function getHealth(config) {
  const [supabase, website, askWebsite, startWebsite, portalReview, adminWebsite, taskApi, github, taskCount, dispatchCount] = await Promise.all([
    checkSupabase(config),
    checkHttp({ source: "Website", url: config.siteUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Ask", url: config.askUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Start Website", url: config.startUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Portal Review", url: config.portalReviewUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Admin", url: config.adminUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Task API", url: config.taskApiUrl, expectedStatuses: [405], method: "GET" }),
    checkGitHub(config),
    countSupabaseTable(config, { source: "Task Requests", table: "task_requests", column: "id" }),
    countSupabaseTable(config, {
      source: "Dispatch Signups",
      table: "crm_contacts",
      column: "id",
      filter: "dispatch_subscribed=eq.true"
    })
  ]);

  return {
    supabase,
    website,
    askWebsite,
    startWebsite,
    portalReview,
    adminWebsite,
    taskApi,
    github,
    taskCount,
    dispatchCount
  };
}

module.exports = {
  getHealth
};
