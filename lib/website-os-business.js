const crypto = require("crypto");
const { clean, supabaseFetch } = require("./ops");
const {
  createScopedRecord,
  getScopedRecord,
  listScopedRecords,
  moduleTable,
  updateScopedRecord,
  writeAuditEvent
} = require("./website-os-repository");
const { buildWebsiteOsDocumentPdf, documentPdfName } = require("./website-os-document-pdf");

const DOCUMENT_TYPES = Object.freeze([
  "general_terms", "booking_policy", "payment_policy", "cancellation_policy",
  "privacy_policy", "cookie_policy", "invoice_terms", "service_agreement", "custom"
]);
const DOCUMENT_DESTINATIONS = Object.freeze([
  "booking_confirmation", "invoice", "branded_email", "customer_welcome",
  "project_start", "manual_email", "client_portal"
]);
const POLICY_CONTEXTS = Object.freeze(["booking", "invoice", "project", "manual"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function businessError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function assertRole(context, roles, code = "BUSINESS_PERMISSION_DENIED") {
  if (!roles.includes(clean(context?.user?.role))) throw businessError("Business workspace permission denied", code, 403);
}

function uuid(value, code = "BUSINESS_RECORD_ID_INVALID") {
  const id = clean(value);
  if (!UUID_PATTERN.test(id)) throw businessError("Valid record id required", code);
  return id;
}

function limited(value, max = 5000) {
  return clean(value).slice(0, max);
}

function email(value, { required = false } = {}) {
  const normalized = clean(value).toLowerCase();
  if (!normalized && !required) return "";
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) throw businessError("A valid email address is required", "BUSINESS_EMAIL_INVALID");
  return normalized;
}

function safeUrl(value, { allowPath = false } = {}) {
  const normalized = clean(value);
  if (!normalized) return "";
  if (allowPath && /^\/(?!\/)[^\s]*$/.test(normalized)) return normalized.slice(0, 1000);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw businessError("A valid HTTPS URL is required", "BUSINESS_URL_INVALID");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw businessError("Only HTTP and HTTPS URLs are allowed", "BUSINESS_URL_INVALID");
  return parsed.toString().slice(0, 1000);
}

function normalizeColors(value) {
  const items = Array.isArray(value) ? value : clean(value).split(",");
  const colors = items.map((item) => clean(item).toUpperCase()).filter(Boolean).slice(0, 8);
  if (colors.some((item) => !/^#[0-9A-F]{6}$/.test(item))) throw businessError("Brand colors must use six-digit hex values", "BUSINESS_COLORS_INVALID");
  return [...new Set(colors)];
}

function validTimeZone(value) {
  const zone = clean(value) || "Europe/Amsterdam";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date());
  } catch (error) {
    throw businessError("Timezone is not supported", "BUSINESS_TIMEZONE_INVALID");
  }
  return zone;
}

function normalizeBusinessProfile(input = {}, fallback = {}) {
  const businessName = limited(input.business_name ?? input.businessName ?? fallback.business_name, 120);
  if (!businessName) throw businessError("Business name is required", "BUSINESS_NAME_REQUIRED");
  const currency = limited(input.currency ?? fallback.currency ?? "EUR", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw businessError("Currency must be an ISO currency code", "BUSINESS_CURRENCY_INVALID");
  const language = limited(input.language ?? fallback.language ?? "nl", 2).toLowerCase();
  if (!["en", "nl"].includes(language)) throw businessError("Business language must be English or Dutch", "BUSINESS_LANGUAGE_INVALID");
  const invoicePrefix = limited(input.invoice_prefix ?? input.invoicePrefix ?? fallback.invoice_prefix, 12).toUpperCase();
  if (invoicePrefix && !/^[A-Z0-9-]+$/.test(invoicePrefix)) throw businessError("Invoice prefix contains unsupported characters", "BUSINESS_INVOICE_PREFIX_INVALID");
  const logoMediaId = clean(input.logo_media_id ?? input.logoMediaId ?? fallback.logo_media_id) || null;
  const wordmarkMediaId = clean(input.wordmark_media_id ?? input.wordmarkMediaId ?? fallback.wordmark_media_id) || null;
  if (logoMediaId && !UUID_PATTERN.test(logoMediaId)) throw businessError("Logo media reference is invalid", "BUSINESS_LOGO_INVALID");
  if (wordmarkMediaId && !UUID_PATTERN.test(wordmarkMediaId)) throw businessError("Wordmark media reference is invalid", "BUSINESS_WORDMARK_INVALID");
  return {
    business_name: businessName,
    legal_name: limited(input.legal_name ?? input.legalName ?? fallback.legal_name, 180),
    company_number: limited(input.company_number ?? input.companyNumber ?? fallback.company_number, 80),
    vat_number: limited(input.vat_number ?? input.vatNumber ?? fallback.vat_number, 80),
    business_address: limited(input.business_address ?? input.businessAddress ?? fallback.business_address, 2000),
    phone: limited(input.phone ?? fallback.phone, 80),
    business_email: email(input.business_email ?? input.businessEmail ?? fallback.business_email),
    website: safeUrl(input.website ?? fallback.website),
    instagram: safeUrl(input.instagram ?? fallback.instagram),
    tiktok: safeUrl(input.tiktok ?? fallback.tiktok),
    linkedin: safeUrl(input.linkedin ?? fallback.linkedin),
    logo_media_id: logoMediaId,
    wordmark_media_id: wordmarkMediaId,
    logo_url: safeUrl(input.logo_url ?? input.logoUrl ?? fallback.logo_url, { allowPath: true }),
    wordmark_url: safeUrl(input.wordmark_url ?? input.wordmarkUrl ?? fallback.wordmark_url, { allowPath: true }),
    brand_colors: normalizeColors(input.brand_colors ?? input.brandColors ?? fallback.brand_colors ?? []),
    invoice_prefix: invoicePrefix,
    invoice_footer: limited(input.invoice_footer ?? input.invoiceFooter ?? fallback.invoice_footer, 5000),
    business_signature: limited(input.business_signature ?? input.businessSignature ?? fallback.business_signature, 10000),
    timezone: validTimeZone(input.timezone ?? fallback.timezone),
    currency,
    language
  };
}

function normalizeHostname(value) {
  const hostname = clean(value).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!hostname) return "";
  if (hostname.includes("/") || hostname.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) {
    throw businessError("Enter a valid domain without a path", "BUSINESS_DOMAIN_INVALID");
  }
  return hostname;
}

function normalizeDocumentInput(input = {}, fallback = {}) {
  const documentType = limited(input.document_type ?? input.documentType ?? fallback.document_type ?? "custom", 40).toLowerCase();
  if (!DOCUMENT_TYPES.includes(documentType)) throw businessError("Unsupported document type", "DOCUMENT_TYPE_INVALID");
  const title = limited(input.title ?? fallback.title, 160);
  if (!title) throw businessError("Document title is required", "DOCUMENT_TITLE_REQUIRED");
  const language = limited(input.language ?? fallback.language ?? "nl", 2).toLowerCase();
  if (!["en", "nl"].includes(language)) throw businessError("Document language must be English or Dutch", "DOCUMENT_LANGUAGE_INVALID");
  const body = String(input.body ?? fallback.body ?? "").trim().slice(0, 200000);
  const effectiveDate = clean(input.effective_date ?? input.effectiveDate ?? fallback.effective_date) || null;
  if (effectiveDate && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(Date.parse(`${effectiveDate}T12:00:00Z`)))) {
    throw businessError("Effective date is invalid", "DOCUMENT_EFFECTIVE_DATE_INVALID");
  }
  return {
    document_type: documentType,
    title,
    version_label: limited(input.version_label ?? input.versionLabel ?? fallback.version_label ?? "1.0", 40) || "1.0",
    effective_date: effectiveDate,
    language,
    internal_notes: limited(input.internal_notes ?? input.internalNotes ?? fallback.internal_notes, 10000),
    body,
    enabled: input.enabled === undefined ? fallback.enabled !== false : input.enabled === true
  };
}

function normalizeContexts(value) {
  const contexts = (Array.isArray(value) ? value : [value]).map((item) => clean(item).toLowerCase()).filter(Boolean);
  if (contexts.length > POLICY_CONTEXTS.length || contexts.some((item) => !POLICY_CONTEXTS.includes(item))) {
    throw businessError("One or more policy contexts are invalid", "POLICY_CONTEXT_INVALID");
  }
  const safe = [...new Set(contexts)];
  return safe.length ? safe : ["booking"];
}

function policyKey(value) {
  const normalized = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  if (!normalized) throw businessError("Policy key is required", "POLICY_KEY_REQUIRED");
  return normalized;
}

async function revisionedUpdate(context, moduleName, record, expectedRevision, values, action) {
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || expected < 1 || expected !== Number(record.revision)) {
    throw businessError("This record changed in another session. Reload and try again.", "BUSINESS_RECORD_CONFLICT", 409);
  }
  const table = moduleTable(moduleName);
  const rows = await supabaseFetch([
    `${table}?id=eq.${encodeURIComponent(record.id)}`,
    `workspace_id=eq.${encodeURIComponent(context.workspace.id)}`,
    `revision=eq.${expected}`,
    "select=*"
  ].join("&"), {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...values, revision: expected + 1, updated_by: context.user.id })
  });
  const updated = Array.isArray(rows) ? rows[0] : null;
  if (!updated) throw businessError("This record changed in another session. Reload and try again.", "BUSINESS_RECORD_CONFLICT", 409);
  await writeAuditEvent(context, { entityType: moduleName, entityId: updated.id, action, previousState: record, nextState: updated });
  return updated;
}

async function getBusinessBundle(context) {
  const [profiles, domains, emailIdentities, documents, versions, workflows, policies, acceptances, invoiceDocuments] = await Promise.all([
    listScopedRecords(context, "businessProfile", { order: "updated_at.desc", limit: 1 }),
    listScopedRecords(context, "domain", { order: "is_primary.desc,updated_at.desc", limit: 25 }),
    listScopedRecords(context, "emailIdentity", { order: "updated_at.desc", limit: 1 }),
    listScopedRecords(context, "document", { order: "updated_at.desc", limit: 200 }),
    listScopedRecords(context, "documentVersion", { order: "published_at.desc", limit: 200 }),
    listScopedRecords(context, "documentWorkflow", { order: "destination.asc", limit: 200 }),
    listScopedRecords(context, "policy", { order: "display_order.asc,updated_at.desc", limit: 200 }),
    listScopedRecords(context, "policyAcceptance", { order: "accepted_at.desc", limit: 200 }),
    listScopedRecords(context, "invoiceDocument", { order: "created_at.desc", limit: 200 })
  ]);
  return {
    businessProfile: profiles[0] || null,
    domains,
    emailIdentity: emailIdentities[0] || null,
    documents,
    documentVersions: versions,
    documentWorkflows: workflows,
    policies,
    policyAcceptances: acceptances,
    invoiceDocuments
  };
}

async function saveBusinessProfile(context, input) {
  assertRole(context, ["Owner", "Admin"]);
  const records = await listScopedRecords(context, "businessProfile", { limit: 1 });
  const existing = records[0] || null;
  const values = normalizeBusinessProfile(input, existing || {});
  if (!existing) return createScopedRecord(context, "businessProfile", { ...values, updated_by: context.user.id }, { action: "business_profile_created" });
  return revisionedUpdate(context, "businessProfile", existing, input.expected_revision ?? input.expectedRevision, values, "business_profile_updated");
}

async function saveDomain(context, input) {
  assertRole(context, ["Owner", "Admin"]);
  const id = clean(input.domain_id || input.domainId);
  const existing = id ? await getScopedRecord(context, "domain", uuid(id, "BUSINESS_DOMAIN_ID_INVALID")) : null;
  const hostname = normalizeHostname(input.hostname ?? existing?.hostname);
  if (!hostname) throw businessError("Domain is required", "BUSINESS_DOMAIN_REQUIRED");
  const status = limited(input.connection_status ?? input.connectionStatus ?? existing?.connection_status ?? "pending", 20).toLowerCase();
  if (!["verified", "pending", "disconnected"].includes(status)) throw businessError("Domain connection status is invalid", "BUSINESS_DOMAIN_STATUS_INVALID");
  const hostnameChanged = Boolean(existing && hostname !== existing.hostname);
  if (status === "verified" && clean(input.confirmation) !== "VERIFY_DOMAIN_MANUALLY" && (existing?.connection_status !== "verified" || hostnameChanged)) {
    throw businessError("Manual domain verification requires confirmation", "BUSINESS_DOMAIN_VERIFICATION_REQUIRED");
  }
  const values = {
    hostname,
    domain_type: limited(input.domain_type ?? input.domainType ?? existing?.domain_type ?? "custom", 20) === "subdomain" ? "subdomain" : "custom",
    connection_status: hostname ? status : "disconnected",
    verification_status: status === "verified" ? "verified" : (hostname ? "pending" : "not_started"),
    verification_method: status === "verified" ? "manual" : "none",
    ssl_status: status === "verified" ? "active" : (hostname ? "pending" : "not_started"),
    is_primary: input.is_primary === undefined ? existing?.is_primary !== false : input.is_primary === true,
    verified_at: status === "verified" ? existing?.verified_at || new Date().toISOString() : null,
    disconnected_at: status === "disconnected" ? new Date().toISOString() : null,
    verification_metadata: {},
    updated_by: context.user.id
  };
  if (!existing) return createScopedRecord(context, "domain", values, { action: "domain_created" });
  return revisionedUpdate(context, "domain", existing, input.expected_revision ?? input.expectedRevision, values, "domain_updated");
}

async function saveEmailIdentity(context, input) {
  assertRole(context, ["Owner", "Admin"]);
  const records = await listScopedRecords(context, "emailIdentity", { limit: 1 });
  const existing = records[0] || null;
  const businessEmail = email(input.business_email ?? input.businessEmail ?? existing?.business_email);
  const replyToEmail = email(input.reply_to_email ?? input.replyToEmail ?? existing?.reply_to_email);
  const connectionType = limited(input.connection_type ?? input.connectionType ?? existing?.connection_type ?? "other", 40).toLowerCase();
  if (!["google_workspace", "microsoft_365", "smtp", "other"].includes(connectionType)) {
    throw businessError("Email connection type is invalid", "BUSINESS_EMAIL_CONNECTION_INVALID");
  }
  const addressChanged = Boolean(existing && (businessEmail !== existing.business_email || replyToEmail !== existing.reply_to_email));
  const values = {
    business_email: businessEmail,
    reply_to_email: replyToEmail,
    display_name: limited(input.display_name ?? input.displayName ?? existing?.display_name, 160),
    signature: limited(input.signature ?? existing?.signature, 10000),
    connection_type: connectionType,
    verification_status: addressChanged ? "pending" : existing?.verification_status || (businessEmail ? "pending" : "not_started"),
    connection_status: addressChanged ? "pending" : existing?.connection_status || (businessEmail ? "pending" : "disconnected"),
    provider_metadata: {},
    updated_by: context.user.id
  };
  if (!existing) return createScopedRecord(context, "emailIdentity", values, { action: "email_identity_created" });
  return revisionedUpdate(context, "emailIdentity", existing, input.expected_revision ?? input.expectedRevision, values, "email_identity_updated");
}

async function createDocument(context, input) {
  assertRole(context, ["Owner", "Admin", "Editor"], "DOCUMENT_PERMISSION_DENIED");
  const values = normalizeDocumentInput(input);
  if (values.document_type !== "custom") {
    const existing = await listScopedRecords(context, "document", {
      filters: [`document_type=eq.${encodeURIComponent(values.document_type)}`, "status=neq.archived"],
      limit: 1
    });
    if (existing[0]) throw businessError("This standard document already exists", "DOCUMENT_TYPE_EXISTS", 409);
  }
  return createScopedRecord(context, "document", {
    ...values,
    status: "draft",
    revision: 1,
    updated_by: context.user.id
  }, { action: "document_created" });
}

async function saveDocument(context, input) {
  assertRole(context, ["Owner", "Admin", "Editor"], "DOCUMENT_PERMISSION_DENIED");
  const id = uuid(input.document_id || input.documentId, "DOCUMENT_ID_INVALID");
  const existing = await getScopedRecord(context, "document", id);
  if (!existing) throw businessError("Document not found in this workspace", "DOCUMENT_NOT_FOUND", 404);
  const values = normalizeDocumentInput(input, existing);
  const result = await supabaseFetch("rpc/website_os_save_document_draft", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: context.workspace.id,
      p_user_id: context.user.id,
      p_document_id: id,
      p_expected_revision: Number(input.expected_revision ?? input.expectedRevision),
      p_title: values.title,
      p_version_label: values.version_label,
      p_effective_date: values.effective_date,
      p_language: values.language,
      p_internal_notes: values.internal_notes,
      p_body: values.body,
      p_enabled: values.enabled
    })
  });
  const document = Array.isArray(result) ? result[0] : result;
  await writeAuditEvent(context, { entityType: "document", entityId: id, action: "document_draft_saved", previousState: existing, nextState: document });
  return document;
}

async function publishDocument(context, input) {
  assertRole(context, ["Owner", "Admin"], "DOCUMENT_PUBLISH_PERMISSION_DENIED");
  if (clean(input.confirmation) !== "PUBLISH_DOCUMENT") throw businessError("Explicit document publish confirmation is required", "DOCUMENT_PUBLISH_CONFIRMATION_REQUIRED");
  const id = uuid(input.document_id || input.documentId, "DOCUMENT_ID_INVALID");
  const result = await supabaseFetch("rpc/website_os_publish_document", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: context.workspace.id,
      p_user_id: context.user.id,
      p_document_id: id,
      p_expected_revision: Number(input.expected_revision ?? input.expectedRevision)
    })
  });
  const saved = Array.isArray(result) ? result[0] : result;
  await writeAuditEvent(context, { entityType: "document", entityId: id, action: "document_published", nextState: saved?.document || {} });
  return saved;
}

async function rollbackDocument(context, input) {
  assertRole(context, ["Owner", "Admin"], "DOCUMENT_ROLLBACK_PERMISSION_DENIED");
  if (clean(input.confirmation) !== "ROLLBACK_DOCUMENT") throw businessError("Explicit rollback confirmation is required", "DOCUMENT_ROLLBACK_CONFIRMATION_REQUIRED");
  const id = uuid(input.document_id || input.documentId, "DOCUMENT_ID_INVALID");
  const versionId = uuid(input.version_id || input.versionId, "DOCUMENT_VERSION_ID_INVALID");
  const result = await supabaseFetch("rpc/website_os_rollback_document", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: context.workspace.id,
      p_user_id: context.user.id,
      p_document_id: id,
      p_source_version_id: versionId,
      p_expected_revision: Number(input.expected_revision ?? input.expectedRevision)
    })
  });
  const saved = Array.isArray(result) ? result[0] : result;
  await writeAuditEvent(context, { entityType: "document", entityId: id, action: "document_rolled_back", nextState: saved?.document || {}, metadata: { sourceVersionId: versionId } });
  return saved;
}

async function duplicateDocument(context, input) {
  assertRole(context, ["Owner", "Admin", "Editor"], "DOCUMENT_PERMISSION_DENIED");
  const source = await getScopedRecord(context, "document", uuid(input.document_id || input.documentId, "DOCUMENT_ID_INVALID"));
  if (!source) throw businessError("Document not found in this workspace", "DOCUMENT_NOT_FOUND", 404);
  return createScopedRecord(context, "document", {
    document_type: "custom",
    title: `${source.title} copy`.slice(0, 160),
    version_label: "1.0",
    status: "draft",
    enabled: source.enabled,
    effective_date: source.effective_date,
    language: source.language,
    internal_notes: source.internal_notes,
    body: source.body,
    revision: 1,
    updated_by: context.user.id
  }, { action: "document_duplicated" });
}

async function archiveDocument(context, input) {
  assertRole(context, ["Owner", "Admin"], "DOCUMENT_ARCHIVE_PERMISSION_DENIED");
  const id = uuid(input.document_id || input.documentId, "DOCUMENT_ID_INVALID");
  const document = await getScopedRecord(context, "document", id);
  if (!document) throw businessError("Document not found in this workspace", "DOCUMENT_NOT_FOUND", 404);
  const policies = await listScopedRecords(context, "policy", { filters: [`document_id=eq.${encodeURIComponent(id)}`, "enabled=eq.true"], limit: 1 });
  if (policies[0]) throw businessError("Disable or archive the linked policy before archiving this document", "DOCUMENT_POLICY_ACTIVE", 409);
  return updateScopedRecord(context, "document", id, {
    status: "archived",
    enabled: false,
    archived_at: new Date().toISOString(),
    revision: Number(document.revision) + 1,
    updated_by: context.user.id
  }, { action: "document_archived" });
}

async function saveDocumentWorkflows(context, input) {
  assertRole(context, ["Owner", "Admin"], "DOCUMENT_WORKFLOW_PERMISSION_DENIED");
  const id = uuid(input.document_id || input.documentId, "DOCUMENT_ID_INVALID");
  const document = await getScopedRecord(context, "document", id);
  if (!document) throw businessError("Document not found in this workspace", "DOCUMENT_NOT_FOUND", 404);
  const requested = Array.isArray(input.destinations) ? input.destinations : [];
  const destinations = requested.map((item) => typeof item === "string" ? { destination: item, enabled: true, required: false } : item)
    .map((item) => ({
      destination: clean(item.destination).toLowerCase(),
      enabled: item.enabled !== false,
      required: item.required === true
    }))
    .filter((item) => DOCUMENT_DESTINATIONS.includes(item.destination));
  if (destinations.length !== requested.length || new Set(destinations.map((item) => item.destination)).size !== destinations.length) {
    throw businessError("One or more workflow destinations are invalid", "DOCUMENT_WORKFLOW_INVALID");
  }
  await supabaseFetch(`website_os_document_workflows?workspace_id=eq.${encodeURIComponent(context.workspace.id)}&document_id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  if (destinations.length) {
    await supabaseFetch("website_os_document_workflows", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(destinations.map((item) => ({
        workspace_id: context.workspace.id,
        document_id: id,
        ...item,
        created_by: context.user.id,
        updated_by: context.user.id
      })))
    });
  }
  await writeAuditEvent(context, { entityType: "document", entityId: id, action: "document_workflows_updated", metadata: { destinations } });
  return destinations;
}

async function savePolicy(context, input, { create = false } = {}) {
  assertRole(context, ["Owner", "Admin"], "POLICY_PERMISSION_DENIED");
  const documentId = uuid(input.document_id || input.documentId, "POLICY_DOCUMENT_ID_INVALID");
  const document = await getScopedRecord(context, "document", documentId);
  if (!document || document.status === "archived") throw businessError("Policy document is not available in this workspace", "POLICY_DOCUMENT_NOT_FOUND", 404);
  const requirement = limited(input.requirement ?? "optional", 20).toLowerCase();
  const visibility = limited(input.visibility ?? "customer_visible", 30).toLowerCase();
  if (!["required", "optional"].includes(requirement)) throw businessError("Policy requirement is invalid", "POLICY_REQUIREMENT_INVALID");
  if (!["internal", "customer_visible"].includes(visibility)) throw businessError("Policy visibility is invalid", "POLICY_VISIBILITY_INVALID");
  const values = {
    document_id: documentId,
    policy_key: policyKey(input.policy_key || input.policyKey || document.document_type || document.title),
    label: limited(input.label ?? document.title, 160),
    requirement,
    visibility,
    enabled: input.enabled !== false,
    display_order: Math.max(0, Math.min(999, Number(input.display_order ?? input.displayOrder) || 0)),
    acceptance_contexts: normalizeContexts(input.acceptance_contexts ?? input.acceptanceContexts),
    updated_by: context.user.id,
    archived_at: null
  };
  if (!values.label) throw businessError("Policy label is required", "POLICY_LABEL_REQUIRED");
  if (create) {
    const linkedPolicies = await listScopedRecords(context, "policy", {
      filters: [`document_id=eq.${encodeURIComponent(documentId)}`],
      limit: 1
    });
    if (linkedPolicies[0]?.archived_at) {
      return updateScopedRecord(context, "policy", linkedPolicies[0].id, values, { action: "policy_reactivated" });
    }
    return createScopedRecord(context, "policy", values, { action: "policy_created" });
  }
  const id = uuid(input.policy_id || input.policyId, "POLICY_ID_INVALID");
  const existing = await getScopedRecord(context, "policy", id);
  if (!existing) throw businessError("Policy not found in this workspace", "POLICY_NOT_FOUND", 404);
  return updateScopedRecord(context, "policy", id, values, { action: "policy_updated" });
}

async function archivePolicy(context, input) {
  assertRole(context, ["Owner", "Admin"], "POLICY_PERMISSION_DENIED");
  const id = uuid(input.policy_id || input.policyId, "POLICY_ID_INVALID");
  const existing = await getScopedRecord(context, "policy", id);
  if (!existing) throw businessError("Policy not found in this workspace", "POLICY_NOT_FOUND", 404);
  return updateScopedRecord(context, "policy", id, {
    enabled: false,
    archived_at: new Date().toISOString(),
    updated_by: context.user.id
  }, { action: "policy_archived" });
}

async function exportDocument(context, input) {
  assertRole(context, ["Owner", "Admin", "Editor", "Viewer"], "DOCUMENT_EXPORT_PERMISSION_DENIED");
  const id = uuid(input.document_id || input.documentId, "DOCUMENT_ID_INVALID");
  const document = await getScopedRecord(context, "document", id);
  if (!document) throw businessError("Document not found in this workspace", "DOCUMENT_NOT_FOUND", 404);
  let source = document;
  const versionId = clean(input.version_id || input.versionId);
  if (versionId) {
    const version = await getScopedRecord(context, "documentVersion", uuid(versionId, "DOCUMENT_VERSION_ID_INVALID"));
    if (!version || version.document_id !== id) throw businessError("Document version not found", "DOCUMENT_VERSION_NOT_FOUND", 404);
    source = { ...document, ...version };
  }
  const profiles = await listScopedRecords(context, "businessProfile", { limit: 1 });
  const pdf = await buildWebsiteOsDocumentPdf(source, profiles[0] || {});
  await writeAuditEvent(context, { entityType: "document", entityId: id, action: "document_pdf_exported", nextState: source });
  return {
    filename: documentPdfName(source),
    content_type: "application/pdf",
    content_base64: pdf.toString("base64")
  };
}

async function readPublicBookingPolicies(workspaceId) {
  if (!UUID_PATTERN.test(clean(workspaceId))) return [];
  const [policies, documents, versions] = await Promise.all([
    supabaseFetch(`website_os_policies?workspace_id=eq.${encodeURIComponent(workspaceId)}&enabled=eq.true&archived_at=is.null&visibility=eq.customer_visible&select=*&order=display_order.asc`),
    supabaseFetch(`website_os_documents?workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.active&enabled=eq.true&select=*`),
    supabaseFetch(`website_os_document_versions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*`)
  ]);
  const documentMap = new Map((Array.isArray(documents) ? documents : []).map((item) => [item.id, item]));
  const versionMap = new Map((Array.isArray(versions) ? versions : []).map((item) => [item.id, item]));
  return (Array.isArray(policies) ? policies : []).filter((policy) => Array.isArray(policy.acceptance_contexts) && policy.acceptance_contexts.includes("booking"))
    .map((policy) => {
      const document = documentMap.get(policy.document_id);
      const version = document ? versionMap.get(document.published_version_id) : null;
      if (!document || !version) return null;
      return {
        id: policy.id,
        key: policy.policy_key,
        label: policy.label,
        requirement: policy.requirement,
        documentId: document.id,
        title: version.title,
        body: version.body,
        versionId: version.id,
        versionNumber: version.version_number,
        versionLabel: version.version_label,
        effectiveDate: version.effective_date,
        language: version.language
      };
    }).filter(Boolean);
}

async function assertBookingPolicyAcceptances(workspaceId, acceptedIds) {
  const policies = await readPublicBookingPolicies(workspaceId);
  const requested = (Array.isArray(acceptedIds) ? acceptedIds : []).map(clean).filter(Boolean);
  if (requested.length > 32 || requested.some((id) => !UUID_PATTERN.test(id))) {
    throw businessError("One or more policy acceptances are invalid", "POLICY_ACCEPTANCE_INVALID");
  }
  const allowed = new Set(policies.map((policy) => policy.id));
  if (requested.some((id) => !allowed.has(id))) {
    throw businessError("One or more policy acceptances are no longer current", "POLICY_ACCEPTANCE_STALE", 409);
  }
  const accepted = new Set(requested);
  const missing = policies.filter((policy) => policy.requirement === "required" && !accepted.has(policy.id));
  if (missing.length) throw businessError(`Accept ${missing.map((policy) => policy.label).join(", ")} before booking`, "POLICY_REQUIRED_ACCEPTANCE_MISSING");
  return { policies, acceptedIds: policies.filter((policy) => accepted.has(policy.id)).map((policy) => policy.id) };
}

function oneWayHash(value) {
  return clean(value) ? crypto.createHash("sha256").update(clean(value).toLowerCase()).digest("hex") : "";
}

async function recordBookingPolicyAcceptances({ workspaceId, bookingTaskId, name, emailAddress, acceptedPolicyIds, requestFingerprint, userAgent }) {
  if (!acceptedPolicyIds.length) return 0;
  const result = await supabaseFetch("rpc/website_os_record_policy_acceptances", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: workspaceId,
      p_booking_task_id: bookingTaskId,
      p_customer_name: limited(name, 160),
      p_customer_email_hash: oneWayHash(emailAddress),
      p_policy_ids: acceptedPolicyIds,
      p_request_fingerprint: limited(requestFingerprint, 128),
      p_user_agent: limited(userAgent, 500)
    })
  });
  return Number(Array.isArray(result) ? result[0] : result) || 0;
}

async function linkPolicyAcceptancesToCustomer(context, bookingTaskId, clientId) {
  assertRole(context, ["Owner", "Admin"], "POLICY_CLIENT_LINK_PERMISSION_DENIED");
  const taskId = limited(bookingTaskId, 180);
  if (!taskId) throw businessError("Booking reference is required", "POLICY_BOOKING_REQUIRED");
  const customerId = uuid(clientId, "POLICY_CLIENT_ID_INVALID");
  const result = await supabaseFetch("rpc/website_os_link_policy_acceptances_to_client", {
    method: "POST",
    body: JSON.stringify({
      p_workspace_id: context.workspace.id,
      p_user_id: context.user.id,
      p_booking_task_id: taskId,
      p_client_id: customerId
    })
  });
  const linkedCount = Number(Array.isArray(result) ? result[0] : result) || 0;
  if (linkedCount > 0) {
    await writeAuditEvent(context, {
      entityType: "policyAcceptance",
      entityId: customerId,
      action: "policy_acceptances_linked_to_customer",
      metadata: { bookingTaskId: taskId, linkedCount }
    });
  }
  return linkedCount;
}

async function resolveInvoiceDocuments(context, requestedDocumentIds) {
  const [documents, versions, workflows] = await Promise.all([
    listScopedRecords(context, "document", { filters: ["status=eq.active", "enabled=eq.true"], order: "updated_at.desc", limit: 200 }),
    listScopedRecords(context, "documentVersion", { order: "published_at.desc", limit: 200 }),
    listScopedRecords(context, "documentWorkflow", { filters: ["destination=eq.invoice", "enabled=eq.true"], limit: 200 })
  ]);
  const workflowIds = new Set(workflows.map((item) => item.document_id));
  const explicit = Array.isArray(requestedDocumentIds);
  const selectedIds = new Set((explicit ? requestedDocumentIds : [...workflowIds]).map(clean).filter((id) => UUID_PATTERN.test(id)));
  if (explicit && selectedIds.size !== requestedDocumentIds.length) throw businessError("One or more invoice document references are invalid", "INVOICE_DOCUMENT_INVALID");
  const versionMap = new Map(versions.map((item) => [item.id, item]));
  const selected = documents.filter((document) => selectedIds.has(document.id)).map((document) => ({
    document,
    version: versionMap.get(document.published_version_id),
    source: workflowIds.has(document.id) ? "workflow" : "manual"
  })).filter((item) => item.version);
  if (selected.length !== selectedIds.size) throw businessError("Invoice documents must be active and published", "INVOICE_DOCUMENT_NOT_PUBLISHED", 409);
  return selected;
}

async function syncInvoiceDocuments(context, invoice, requestedDocumentIds) {
  const selected = await resolveInvoiceDocuments(context, requestedDocumentIds);
  await supabaseFetch(`website_os_invoice_documents?workspace_id=eq.${encodeURIComponent(context.workspace.id)}&invoice_id=eq.${encodeURIComponent(invoice.id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  if (selected.length) {
    await supabaseFetch("website_os_invoice_documents", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(selected.map((item) => ({
        workspace_id: context.workspace.id,
        invoice_id: invoice.id,
        document_id: item.document.id,
        document_version_id: item.version.id,
        attachment_source: item.source,
        attached_by: context.user.id
      })))
    });
  }
  await writeAuditEvent(context, {
    entityType: "invoice",
    entityId: invoice.id,
    action: "invoice_documents_updated",
    metadata: { documentVersionIds: selected.map((item) => item.version.id) }
  });
  return selected;
}

async function getInvoiceDocumentBundle(context, invoiceId) {
  const id = uuid(invoiceId, "INVOICE_ID_INVALID");
  const links = await listScopedRecords(context, "invoiceDocument", { filters: [`invoice_id=eq.${encodeURIComponent(id)}`], order: "created_at.asc", limit: 100 });
  if (!links.length) return [];
  const [documents, versions] = await Promise.all([
    listScopedRecords(context, "document", { order: "updated_at.desc", limit: 200 }),
    listScopedRecords(context, "documentVersion", { order: "published_at.desc", limit: 200 })
  ]);
  const documentMap = new Map(documents.map((item) => [item.id, item]));
  const versionMap = new Map(versions.map((item) => [item.id, item]));
  return links.map((link) => ({ ...link, document: documentMap.get(link.document_id) || null, version: versionMap.get(link.document_version_id) || null }))
    .filter((item) => item.document && item.version);
}

async function handleWebsiteOsBusinessAction(context, input = {}) {
  const operation = clean(input.business_action || input.businessAction || input.operation || "get").toLowerCase();
  let result = {};
  if (operation === "get") return { operation, ...(await getBusinessBundle(context)) };
  if (operation === "save_identity") result.businessProfile = await saveBusinessProfile(context, input);
  else if (operation === "save_domain") result.domain = await saveDomain(context, input);
  else if (operation === "save_email") result.emailIdentity = await saveEmailIdentity(context, input);
  else if (operation === "create_document") result.document = await createDocument(context, input);
  else if (operation === "save_document") result.document = await saveDocument(context, input);
  else if (operation === "publish_document") result.publish = await publishDocument(context, input);
  else if (operation === "rollback_document") result.rollback = await rollbackDocument(context, input);
  else if (operation === "duplicate_document") result.document = await duplicateDocument(context, input);
  else if (operation === "archive_document") result.document = await archiveDocument(context, input);
  else if (operation === "save_document_workflows") result.destinations = await saveDocumentWorkflows(context, input);
  else if (operation === "create_policy") result.policy = await savePolicy(context, input, { create: true });
  else if (operation === "save_policy") result.policy = await savePolicy(context, input);
  else if (operation === "archive_policy") result.policy = await archivePolicy(context, input);
  else if (operation === "export_document") return { operation, pdf: await exportDocument(context, input) };
  else throw businessError("Unsupported business workspace action", "BUSINESS_ACTION_UNSUPPORTED");
  return { operation, ...result, ...(await getBusinessBundle(context)) };
}

module.exports = {
  DOCUMENT_DESTINATIONS,
  DOCUMENT_TYPES,
  POLICY_CONTEXTS,
  assertBookingPolicyAcceptances,
  getBusinessBundle,
  getInvoiceDocumentBundle,
  handleWebsiteOsBusinessAction,
  linkPolicyAcceptancesToCustomer,
  normalizeBusinessProfile,
  normalizeDocumentInput,
  readPublicBookingPolicies,
  recordBookingPolicyAcceptances,
  resolveInvoiceDocuments,
  syncInvoiceDocuments
};
