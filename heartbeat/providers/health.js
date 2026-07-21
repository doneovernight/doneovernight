const { attention, fetchWithTimeout, healthy, unavailable } = require("./utils");
const { supabaseServiceHeaders } = require("../../lib/supabase-service-auth");

async function checkHttp({ source, url, expectedStatuses = [200], method = "GET" }) {
  if (!url) return unavailable(source, "Missing URL");
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      method,
      headers: {
        Accept: "application/json, text/html;q=0.9, */*;q=0.8"
      }
    });
    const responseTimeMs = Date.now() - startedAt;

    const ok = expectedStatuses.includes(response.status);
    return ok
      ? healthy(source, { code: response.status, responseTimeMs })
      : attention(source, `HTTP ${response.status}`, { code: response.status, responseTimeMs });
  } catch (error) {
    return attention(source, error.name === "AbortError" ? "Timed out" : "Request failed", {
      responseTimeMs: Date.now() - startedAt
    });
  }
}

async function checkSupabase(config) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return unavailable("Supabase", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(`${config.supabaseUrl}/rest/v1/task_requests?select=task_id&limit=1`, {
      method: "GET",
      headers: supabaseServiceHeaders(config.supabaseServiceRoleKey, {
        Accept: "application/json"
      })
    });
    const responseTimeMs = Date.now() - startedAt;

    if (response.ok) return healthy("Supabase", { code: response.status, responseTimeMs });
    return attention("Supabase", `HTTP ${response.status}`, { code: response.status, responseTimeMs });
  } catch (error) {
    return attention("Supabase", error.name === "AbortError" ? "Timed out" : "Request failed", {
      responseTimeMs: Date.now() - startedAt
    });
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
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(`${config.supabaseUrl}/rest/v1/${query}`, {
      method: "GET",
      headers: supabaseServiceHeaders(config.supabaseServiceRoleKey, {
        Accept: "application/json",
        Prefer: "count=exact",
        Range: "0-0"
      })
    });
    const responseTimeMs = Date.now() - startedAt;

    if (!response.ok) return attention(source, `HTTP ${response.status}`, { code: response.status, responseTimeMs });
    const count = parseContentRangeCount(response.headers.get("content-range"));
    return healthy(source, {
      value: count === null ? "Available" : count,
      code: response.status,
      responseTimeMs
    });
  } catch (error) {
    return attention(source, error.name === "AbortError" ? "Timed out" : "Request failed", {
      responseTimeMs: Date.now() - startedAt
    });
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
  const [supabase, website, askWebsite, portalReview, adminWebsite, workspace, taskApi, github, taskCount, dispatchCount] = await Promise.all([
    checkSupabase(config),
    checkHttp({ source: "Website", url: config.siteUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Ask", url: config.askUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Portal", url: config.portalReviewUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Admin", url: config.adminUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Workspace", url: config.workspaceUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Task API", url: config.taskApiUrl, expectedStatuses: [405], method: "GET" }),
    checkGitHub(config),
    countSupabaseTable(config, { source: "Task Requests", table: "task_requests", column: "id" }),
    countSupabaseTable(config, {
      source: "Total Dispatch Signups",
      table: "crm_contacts",
      column: "id",
      filter: "dispatch_subscribed=eq.true"
    })
  ]);

  return {
    supabase,
    website,
    askWebsite,
    portalReview,
    adminWebsite,
    workspace,
    taskApi,
    github,
    taskCount,
    dispatchCount
  };
}

module.exports = {
  getHealth
};
