const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const handlerPath = path.join(root, "api", "admin-update-task.js");
const authPath = path.join(root, "lib", "website-os-auth.js");
const repositoryPath = path.join(root, "lib", "website-os-repository.js");

function responseCapture() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); }
  };
}

function loadHandler({ role = "Owner", task, auditEvents = [] } = {}) {
  const resolvedAuth = require.resolve(authPath);
  const resolvedRepository = require.resolve(repositoryPath);
  const resolvedHandler = require.resolve(handlerPath);
  const previousAuth = require.cache[resolvedAuth];
  const previousRepository = require.cache[resolvedRepository];
  const previousHandler = require.cache[resolvedHandler];

  const context = {
    workspace: { id: "11111111-1111-4111-8111-111111111111", slug: "cp" },
    user: { id: "22222222-2222-4222-8222-222222222222", role }
  };

  require.cache[resolvedAuth] = {
    id: resolvedAuth,
    filename: resolvedAuth,
    loaded: true,
    exports: {
      assertWebsiteOsRequestOrigin: () => true,
      requireWebsiteOsSession: async (_req, options = {}) => {
        if (Array.isArray(options.roles) && !options.roles.includes(role)) {
          const error = new Error("Website OS permission denied");
          error.code = "WEBSITE_OS_ROLE_REQUIRED";
          error.statusCode = 403;
          throw error;
        }
        return context;
      }
    }
  };
  require.cache[resolvedRepository] = {
    id: resolvedRepository,
    filename: resolvedRepository,
    loaded: true,
    exports: {
      createScopedRecord: async () => null,
      getScopedRecord: async () => null,
      listScopedRecords: async () => [],
      updateScopedRecord: async () => null,
      writeAuditEvent: async (_context, event) => { auditEvents.push(event); }
    }
  };
  delete require.cache[resolvedHandler];
  const handler = require(resolvedHandler);

  function restore() {
    if (previousAuth) require.cache[resolvedAuth] = previousAuth; else delete require.cache[resolvedAuth];
    if (previousRepository) require.cache[resolvedRepository] = previousRepository; else delete require.cache[resolvedRepository];
    if (previousHandler) require.cache[resolvedHandler] = previousHandler; else delete require.cache[resolvedHandler];
  }

  return { handler, context, restore };
}

async function runAction({ action, role = "Owner", task: taskOverride, expectedUpdatedAt = "2026-07-19T08:00:00.000Z" }) {
  const auditEvents = [];
  let task = taskOverride || {
    id: "33333333-3333-4333-8333-333333333333",
    task_id: "DON-2026-00001",
    source: "commonpl4ce_booker",
    website_os_workspace_id: "11111111-1111-4111-8111-111111111111",
    status: "new",
    updated_at: "2026-07-19T08:00:00.000Z",
    raw_payload: { source: "commonpl4ce_booker", workspace: "cp" }
  };
  const { handler, restore } = loadHandler({ role, task, auditEvents });
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("/rest/v1/task_requests?") && (!options.method || options.method === "GET")) {
      return new Response(JSON.stringify([task]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(url).includes("/rest/v1/task_requests?") && options.method === "PATCH") {
      const patch = JSON.parse(options.body);
      task = { ...task, ...patch };
      return new Response(JSON.stringify([task]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${options.method || "GET"} ${url}`);
  };

  const req = {
    method: "POST",
    headers: { host: "admin.doneovernight.com", origin: "https://admin.doneovernight.com" },
    body: {
      action: "commonpl4ce_record_action",
      workspace_slug: "cp",
      record_id: "DON-2026-00001",
      record_type: "booking",
      record_action: action,
      expected_updated_at: expectedUpdatedAt
    }
  };
  const res = responseCapture();
  try {
    await handler(req, res);
    return { res, task, auditEvents };
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    restore();
  }
}

test("record_id reaches the existing archive action and writes workspace audit", async () => {
  const { res, task, auditEvents } = await runAction({ action: "archive" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(task.status, "archived");
  assert.equal(task.raw_payload.website_status, "Archived");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].action, "archive");
  assert.equal(auditEvents[0].entityId, "DON-2026-00001");
});

test("mark_test persists a dedicated flag and audit event", async () => {
  const { res, task, auditEvents } = await runAction({ action: "mark_test" });
  assert.equal(res.statusCode, 200);
  assert.equal(task.raw_payload.website_os_test_record, true);
  assert.equal(task.raw_payload.test_record, true);
  assert.equal(auditEvents[0].action, "mark_test");
});

test("trash is a soft delete with actor and timestamp", async () => {
  const { res, task, auditEvents } = await runAction({ action: "trash" });
  assert.equal(res.statusCode, 200);
  assert.equal(task.status, "trashed");
  assert.ok(task.raw_payload.deleted_at);
  assert.equal(task.raw_payload.deleted_by, "22222222-2222-4222-8222-222222222222");
  assert.equal(task.raw_payload.previous_status, "new");
  assert.equal(auditEvents[0].action, "trash");
});

test("restore returns a trashed booking to its persisted previous status", async () => {
  const { res, task, auditEvents } = await runAction({
    action: "restore",
    task: {
      id: "33333333-3333-4333-8333-333333333333",
      task_id: "DON-2026-00001",
      source: "commonpl4ce_booker",
      website_os_workspace_id: "11111111-1111-4111-8111-111111111111",
      status: "trashed",
      updated_at: "2026-07-19T08:00:00.000Z",
      raw_payload: {
        source: "commonpl4ce_booker",
        workspace: "cp",
        previous_status: "project_active",
        website_os_visibility: "trashed",
        deleted_at: "2026-07-19T07:00:00.000Z",
        deleted_by: "22222222-2222-4222-8222-222222222222"
      }
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(task.status, "project_active");
  assert.equal(task.raw_payload.website_os_visibility, "active");
  assert.equal(task.raw_payload.deleted_at, "");
  assert.equal(task.raw_payload.deleted_by, "");
  assert.ok(task.raw_payload.restored_at);
  assert.equal(auditEvents[0].action, "restore");
});

test("Editor and cross-workspace record actions are rejected", async () => {
  const unauthorized = await runAction({ action: "archive", role: "Editor" });
  assert.equal(unauthorized.res.statusCode, 403);
  assert.equal(unauthorized.res.body.code, "WEBSITE_OS_ROLE_REQUIRED");

  const crossWorkspace = await runAction({
    action: "archive",
    task: {
      id: "33333333-3333-4333-8333-333333333333",
      task_id: "DON-2026-00001",
      source: "commonpl4ce_booker",
      website_os_workspace_id: "99999999-9999-4999-8999-999999999999",
      status: "new",
      updated_at: "2026-07-19T08:00:00.000Z",
      raw_payload: { source: "commonpl4ce_booker", workspace: "another-client" }
    }
  });
  assert.equal(crossWorkspace.res.statusCode, 404);
  assert.equal(crossWorkspace.res.body.code, "RECORD_NOT_FOUND");
});

test("stale concurrent record actions are rejected", async () => {
  const { res } = await runAction({ action: "archive", expectedUpdatedAt: "2026-07-19T09:00:00.000Z" });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "RECORD_ACTION_CONFLICT");
});

test("record action PATCH is conditional on the persisted updated timestamp", () => {
  const source = fs.readFileSync(handlerPath, "utf8");
  assert.match(source, /updated_at=eq\.\$\{encodeURIComponent\(expectedUpdatedAt\)\}/);
  assert.match(source, /\{ expectedUpdatedAt: clean\(task\.updated_at\) \}/);
});

test("Website OS UI keeps archived and test records out of production collections", () => {
  const source = fs.readFileSync(path.join(root, "admin", "website-os", "commonpl4ce", "index.html"), "utf8");
  assert.match(source, /data-booking-filter="archived"/);
  assert.match(source, /data-booking-filter="test"/);
  assert.match(source, /state\.testBookings = visible\.filter\(\(booking\) => booking\.isTest\)/);
  assert.match(source, /state\.archivedBookings = visible\.filter/);
  assert.match(source, /state\.bookings = visible\.filter\(\(booking\) => !booking\.isTest && booking\.status !== "Archived"\)/);
  assert.match(source, /expected_updated_at: booking\?\.updatedAt/);
  assert.match(source, /recordActionsPending/);
});

test("analytics and invoice summaries explicitly exclude marked test bookings", () => {
  const analyticsSource = fs.readFileSync(path.join(root, "api", "task-submit.js"), "utf8");
  const taskSource = fs.readFileSync(path.join(root, "api", "admin-tasks.js"), "utf8");
  assert.match(analyticsSource, /testBookingsExcluded: testBookingCount/);
  assert.match(analyticsSource, /return !isTest && visibility !== "trashed"/);
  assert.match(taskSource, /productionInvoices = invoices\.filter/);
  assert.match(taskSource, /invoiceSummary: summarizeInvoices\(productionInvoices\)/);
});
