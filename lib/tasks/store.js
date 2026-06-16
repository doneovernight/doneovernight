const TASK_TABLE = "task_requests";
const SUPABASE_TIMEOUT_MS = 10_000;

class TaskPersistenceError extends Error {
  constructor(message, code = "TASK_PERSISTENCE_FAILED", statusCode = 502, diagnostic = {}) {
    super(message);
    this.name = "TaskPersistenceError";
    this.code = code;
    this.statusCode = statusCode;
    this.diagnostic = diagnostic;
  }
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    throw new TaskPersistenceError(
      "Supabase task persistence is not configured",
      "TASK_PERSISTENCE_NOT_CONFIGURED",
      503
    );
  }

  return { url, serviceRoleKey };
}

function createTaskId(now = new Date()) {
  const year = now.getUTCFullYear();
  const seed = Date.now() % 100000;
  return `DON-${year}-${String(seed).padStart(5, "0")}`;
}

function toSupabaseRow(task) {
  return {
    task_id: task.taskId,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    status: task.status,
    payment_status: task.paymentStatus,
    queue_state: task.queueState,
    priority: task.priority,
    review_window_estimate: task.reviewWindowEstimate,
    name: task.name,
    email: task.email,
    company: task.company || null,
    task_description: task.taskSummary,
    task_summary: task.taskSummary,
    client_budget: task.clientBudget || null,
    review_token_hash: task.reviewTokenHash || task.rawPayload?.review_token_hash || null,
    deadline: task.deadline || null,
    links: Array.isArray(task.links) ? task.links.join("\n") : "",
    attachments: task.attachments || [],
    source: task.source,
    quote_id: task.quoteId,
    payment_id: task.paymentId,
    client_id: task.clientId,
    raw_payload: task.rawPayload || task
  };
}

function isMissingOptionalColumn(status, detail, column) {
  const normalized = String(detail || "").toLowerCase();
  return status === 400 &&
    normalized.includes(column.toLowerCase()) &&
    (normalized.includes("schema cache") || normalized.includes("column") || normalized.includes("could not find"));
}

function safeDiagnosticDetail(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/apikey[=:]\s*["']?[A-Za-z0-9._-]+/gi, "apikey=[redacted]")
    .slice(0, 500);
}

async function insertTaskRow(task) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  const row = toSupabaseRow(task);
  let response;

  async function postRow(payload) {
    return fetch(`${url}/rest/v1/${TASK_TABLE}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });
  }

  try {
    response = await postRow(row);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new TaskPersistenceError(
        "Supabase task insert timed out",
        "TASK_PERSISTENCE_TIMEOUT",
        504
      );
    }

    console.warn(`Supabase task insert request failed: ${safeDiagnosticDetail(error.message)}`);
    throw new TaskPersistenceError(
      "Supabase task insert request failed",
      "TASK_PERSISTENCE_NETWORK_ERROR",
      502
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let errorText = await response.text();
    if (isMissingOptionalColumn(response.status, errorText, "review_token_hash")) {
      console.warn("Supabase task insert retrying without optional review_token_hash column");
      const fallbackRow = { ...row };
      delete fallbackRow.review_token_hash;
      fallbackRow.raw_payload = {
        ...(fallbackRow.raw_payload || {}),
        review_token_persistence: "raw_payload_only"
      };
      response = await postRow(fallbackRow);
      if (response.ok) {
        const inserted = await response.json();
        return Array.isArray(inserted) ? inserted[0] : inserted;
      }
      errorText = await response.text();
      if (isMissingOptionalColumn(response.status, errorText, "client_budget")) {
        console.warn("Supabase task insert retrying without optional review_token_hash and client_budget columns");
        delete fallbackRow.client_budget;
        fallbackRow.raw_payload = {
          ...(fallbackRow.raw_payload || {}),
          client_budget: task.clientBudget || task.rawPayload?.client_budget || task.rawPayload?.budget || "",
          client_budget_persistence: "raw_payload_only"
        };
        response = await postRow(fallbackRow);
        if (response.ok) {
          const inserted = await response.json();
          return Array.isArray(inserted) ? inserted[0] : inserted;
        }
        errorText = await response.text();
      }
    }
    if (isMissingOptionalColumn(response.status, errorText, "client_budget")) {
      console.warn("Supabase task insert retrying without optional client_budget column");
      const fallbackRow = { ...row };
      delete fallbackRow.client_budget;
      fallbackRow.raw_payload = {
        ...(fallbackRow.raw_payload || {}),
        client_budget_persistence: "raw_payload_only"
      };
      response = await postRow(fallbackRow);
      if (response.ok) {
        const inserted = await response.json();
        return Array.isArray(inserted) ? inserted[0] : inserted;
      }
    }
    console.warn(`Supabase task insert failed: ${response.status} ${errorText}`);
    throw new TaskPersistenceError(
      "Supabase task insert failed",
      "TASK_PERSISTENCE_INSERT_FAILED",
      502,
      {
        upstreamStatus: response.status,
        hint: "Check task_requests table schema and service-role permissions",
        detail: safeDiagnosticDetail(errorText)
      }
    );
  }

  const inserted = await response.json();
  return Array.isArray(inserted) ? inserted[0] : inserted;
}

async function saveTask(task) {
  return insertTaskRow(task);
}

module.exports = {
  createTaskId,
  saveTask,
  TaskPersistenceError,
  toSupabaseRow
};
