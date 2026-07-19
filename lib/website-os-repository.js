const { clean, supabaseFetch } = require("./ops");
const { requireWebsiteOsSession } = require("./website-os-auth");

const MODULE_TABLES = Object.freeze({
  client: "website_os_clients",
  clientBooking: "website_os_client_bookings",
  messageThread: "website_os_message_threads",
  message: "website_os_messages",
  emailTemplate: "website_os_email_templates",
  emailSend: "website_os_email_sends",
  mediaAsset: "website_os_media_assets",
  portfolioProject: "website_os_portfolio_projects",
  portfolioMedia: "website_os_portfolio_media",
  invoice: "website_os_invoices",
  acceptanceFixture: "website_os_acceptance_fixtures"
});

const ACTOR_FIELDS = Object.freeze({
  client: "created_by",
  clientBooking: "linked_by",
  messageThread: "created_by",
  message: "author_user_id",
  emailTemplate: "created_by",
  emailSend: "created_by",
  mediaAsset: "created_by",
  portfolioProject: "created_by",
  invoice: "created_by",
  acceptanceFixture: "created_by"
});

const AUDIT_FIELDS = [
  "id", "status", "title", "name", "slug", "category", "display_order",
  "booking_task_id", "client_id", "thread_id", "media_asset_id", "project_id", "company",
  "invoice_number", "subtotal_cents", "vat_cents", "total_cents", "payment_status",
  "deleted_at", "archived_at", "published_at", "read_at", "sent_at", "paid_at", "cancelled_at", "is_test"
];

function moduleTable(moduleName) {
  const table = MODULE_TABLES[moduleName];
  if (!table) {
    const error = new Error("Unsupported Website OS module record");
    error.statusCode = 400;
    error.code = "WEBSITE_OS_MODULE_UNSUPPORTED";
    throw error;
  }
  return table;
}

function recordId(value) {
  const id = clean(value);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    const error = new Error("Invalid Website OS record id");
    error.statusCode = 400;
    error.code = "WEBSITE_OS_RECORD_ID_INVALID";
    throw error;
  }
  return id;
}

function auditSnapshot(record = {}) {
  return AUDIT_FIELDS.reduce((snapshot, key) => {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") snapshot[key] = record[key];
    return snapshot;
  }, {});
}

async function requireWebsiteOsModuleContext(req, { slug, roles = [] } = {}) {
  return requireWebsiteOsSession(req, { slug, roles });
}

async function getScopedRecord(context, moduleName, id, select = "*") {
  const table = moduleTable(moduleName);
  const rows = await supabaseFetch([
    `${table}?id=eq.${encodeURIComponent(recordId(id))}`,
    `workspace_id=eq.${encodeURIComponent(context.workspace.id)}`,
    `select=${encodeURIComponent(select)}`,
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listScopedRecords(context, moduleName, { select = "*", filters = [], order = "created_at.desc", limit = 100 } = {}) {
  const table = moduleTable(moduleName);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const safeFilters = Array.isArray(filters)
    ? filters.filter((filter) => /^[a-z_]+=(eq|neq|is)\.[^&]+$/i.test(filter))
    : [];
  const rows = await supabaseFetch([
    `${table}?workspace_id=eq.${encodeURIComponent(context.workspace.id)}`,
    `select=${encodeURIComponent(select)}`,
    ...safeFilters,
    `order=${encodeURIComponent(order)}`,
    `limit=${safeLimit}`
  ].join("&"));
  return Array.isArray(rows) ? rows : [];
}

async function writeAuditEvent(context, { entityType, entityId, action, previousState = {}, nextState = {}, metadata = {} }) {
  await supabaseFetch("website_os_audit_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      workspace_id: context.workspace.id,
      actor_user_id: context.user.id,
      entity_type: clean(entityType),
      entity_id: clean(entityId),
      action: clean(action),
      previous_state: auditSnapshot(previousState),
      next_state: auditSnapshot(nextState),
      metadata: metadata && typeof metadata === "object" ? metadata : {}
    })
  });
}

async function createScopedRecord(context, moduleName, values, { action = "created" } = {}) {
  const table = moduleTable(moduleName);
  const actorField = ACTOR_FIELDS[moduleName];
  const rows = await supabaseFetch(`${table}?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...values,
      workspace_id: context.workspace.id,
      ...(actorField ? { [actorField]: context.user.id } : {})
    })
  });
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record) throw new Error("Website OS record was not created");
  await writeAuditEvent(context, { entityType: moduleName, entityId: record.id, action, nextState: record });
  return record;
}

async function updateScopedRecord(context, moduleName, id, values, { action = "updated" } = {}) {
  const table = moduleTable(moduleName);
  const previous = await getScopedRecord(context, moduleName, id);
  if (!previous) {
    const error = new Error("Website OS record not found in this workspace");
    error.statusCode = 404;
    error.code = "WEBSITE_OS_RECORD_NOT_FOUND";
    throw error;
  }
  const rows = await supabaseFetch([
    `${table}?id=eq.${encodeURIComponent(previous.id)}`,
    `workspace_id=eq.${encodeURIComponent(context.workspace.id)}`,
    "select=*"
  ].join("&"), {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(values)
  });
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record) throw new Error("Website OS record was not updated");
  await writeAuditEvent(context, { entityType: moduleName, entityId: record.id, action, previousState: previous, nextState: record });
  return record;
}

module.exports = {
  MODULE_TABLES,
  createScopedRecord,
  getScopedRecord,
  listScopedRecords,
  moduleTable,
  requireWebsiteOsModuleContext,
  updateScopedRecord,
  writeAuditEvent
};
