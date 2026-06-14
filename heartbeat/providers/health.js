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

async function checkGitHub(config) {
  return checkHttp({
    source: "GitHub",
    url: config.repositoryUrl,
    expectedStatuses: [200]
  });
}

async function getHealth(config) {
  const [supabase, website, startWebsite, taskApi, github] = await Promise.all([
    checkSupabase(config),
    checkHttp({ source: "Website", url: config.siteUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Start Website", url: config.startUrl, expectedStatuses: [200] }),
    checkHttp({ source: "Task API", url: config.taskApiUrl, expectedStatuses: [405], method: "GET" }),
    checkGitHub(config)
  ]);

  return {
    supabase,
    website,
    startWebsite,
    taskApi,
    github
  };
}

module.exports = {
  getHealth
};
