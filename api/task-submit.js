const { buildTaskPayload, validateTaskInput } = require("../lib/tasks/model");
const { createTaskId, saveTask, TaskPersistenceError } = require("../lib/tasks/store");

const WEBHOOK_TIMEOUT_MS = 7_000;

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function notifyOperations(task) {
  const webhookUrl = process.env.TASK_SUBMIT_WEBHOOK_URL;
  if (!webhookUrl) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  const preferredLanguage =
    task.preferredLanguage ||
    task.rawPayload?.preferred_language ||
    "en";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: task.taskId,
        task_id: task.taskId,
        taskId: task.taskId,
        operational_id: task.taskId,
        created_at: task.createdAt,
        createdAt: task.createdAt,
        name: task.name,
        clientName: task.name,
        client_name: task.name,
        email: task.email,
        company: task.company,
        deadline: task.deadline,
        priority: task.priority,
        source: task.source,
        intakeVersion: task.intakeVersion,
        intake_version: task.intakeVersion,
        preferred_language: preferredLanguage,
        lang: preferredLanguage,
        language: preferredLanguage,
        task_summary: task.taskSummary,
        task_description: task.taskSummary,
        taskSummary: task.taskSummary,
        links: task.links,
        files_link: Array.isArray(task.links) ? task.links.join("\n") : "",
        attachments: task.attachments,
        attachment_names: Array.isArray(task.attachments)
          ? task.attachments.map((attachment) => attachment.name).filter(Boolean).join(", ")
          : "",
        queue_state: task.queueState,
        queueState: task.queueState,
        review_window_estimate: task.reviewWindowEstimate,
        raw_payload: task.rawPayload
      })
    });

    if (!response.ok) {
      throw new Error(`Task submit webhook failed: ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const errors = validateTaskInput(input);
    if (errors.length) {
      return send(res, 400, {
        success: false,
        error: "Missing required fields",
        fields: errors
      });
    }

    const now = new Date();
    const taskId = createTaskId(now);
    const task = buildTaskPayload(input, taskId, now);

    // Future operational handoffs: quote generation, payment session generation,
    // portal linking, operator assignment, and realtime client status updates.
    const persistedTask = await saveTask(task);

    try {
      await notifyOperations(task);
    } catch (notificationError) {
      console.warn(`Task notification warning: ${notificationError.message}`);
    }

    return send(res, 200, {
      success: true,
      taskId,
      redirectTo: `/task/submitted?id=${encodeURIComponent(taskId)}`,
      task,
      persistedTask
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, {
        success: false,
        error: "Invalid JSON",
        code: "INVALID_JSON"
      });
    }

    if (error.message === "Payload too large") {
      return send(res, 413, {
        success: false,
        error: "Payload too large",
        code: "PAYLOAD_TOO_LARGE"
      });
    }

    const statusCode = error instanceof TaskPersistenceError ? error.statusCode : 500;
    const code = error instanceof TaskPersistenceError ? error.code : "TASK_INTAKE_FAILED";
    const diagnostic = error instanceof TaskPersistenceError ? error.diagnostic : null;
    console.warn(`Task intake error: ${code}`);

    return send(res, statusCode, {
      success: false,
      error: "Could not create task intake record",
      code,
      ...(diagnostic ? { diagnostic } : {})
    });
  }
};
