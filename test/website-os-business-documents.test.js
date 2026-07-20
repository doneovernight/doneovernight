const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  normalizeBusinessProfile,
  normalizeDocumentInput
} = require("../lib/website-os-business");
const { buildWebsiteOsDocumentPdf, documentPdfName } = require("../lib/website-os-document-pdf");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("migration creates workspace-scoped business identity and document records", () => {
  const migration = read("supabase/migrations/065_website_os_business_documents.sql");
  [
    "website_os_business_profiles",
    "website_os_domains",
    "website_os_email_identities",
    "website_os_documents",
    "website_os_document_versions",
    "website_os_document_workflows",
    "website_os_policies",
    "website_os_policy_acceptances",
    "website_os_invoice_documents"
  ].forEach((table) => {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  });
  assert.match(migration, /workspace_id uuid not null references public\.website_os_workspaces\(id\)/);
  assert.match(migration, /unique \(workspace_id, booking_task_id, policy_id, document_version_id\)/);
  assert.match(migration, /unique \(invoice_id, document_version_id\)/);
  assert.match(migration, /website_os_documents_standard_type_idx/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all privileges on table public\.%I from anon, authenticated/);
  assert.doesNotMatch(migration, /drop table|truncate table|delete from public\./i);
});

test("document RPCs enforce roles, workspace scope, revisions and immutable versions", () => {
  const migration = read("supabase/migrations/065_website_os_business_documents.sql");
  assert.match(migration, /website_os_save_document_draft/);
  assert.match(migration, /role in \('Owner', 'Admin', 'Editor'\)/);
  assert.match(migration, /workspace_id = p_workspace_id for update/);
  assert.match(migration, /current_document\.revision <> p_expected_revision/);
  assert.match(migration, /website_os_publish_document/);
  assert.match(migration, /insert into public\.website_os_document_versions/);
  assert.match(migration, /website_os_rollback_document/);
  assert.match(migration, /source_version_id/);
  assert.match(migration, /website_os_record_policy_acceptances/);
  assert.match(migration, /website_os_workspace_id = p_workspace_id and task_id = p_booking_task_id/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(migration, /website_os_link_policy_acceptances_to_client/);
  assert.match(migration, /website_os_client_bookings[\s\S]*booking_task_id = p_booking_task_id and client_id = p_client_id/);
  assert.match(migration, /set client_id = p_client_id[\s\S]*client_id is null/);
  assert.match(migration, /POLICY_ACCEPTANCE_ALREADY_LINKED/);
  assert.match(migration, /revoke insert, update, delete on table public\.website_os_document_versions from service_role/);
  assert.match(migration, /revoke insert, update, delete on table public\.website_os_policy_acceptances from service_role/);
});

test("business profile and document validation reject unsafe values", () => {
  const profile = normalizeBusinessProfile({
    business_name: "COMMONPL4CE",
    business_email: "book@commonpl4ce.com",
    website: "https://doneovernight.com/cp",
    instagram: "https://instagram.com/commonpl4ce",
    brand_colors: ["#060606", "#EEE6D5"],
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    language: "nl",
    invoice_prefix: "CP"
  });
  assert.equal(profile.business_name, "COMMONPL4CE");
  assert.deepEqual(profile.brand_colors, ["#060606", "#EEE6D5"]);
  assert.throws(() => normalizeBusinessProfile({ business_name: "CP", website: "javascript:alert(1)" }), (error) => error.code === "BUSINESS_URL_INVALID");
  assert.throws(() => normalizeBusinessProfile({ business_name: "CP", brand_colors: ["beige"] }), (error) => error.code === "BUSINESS_COLORS_INVALID");
  assert.throws(() => normalizeDocumentInput({ document_type: "custom", title: "" }), (error) => error.code === "DOCUMENT_TITLE_REQUIRED");
  assert.match(read("lib/website-os-business.js"), /POLICY_CONTEXT_INVALID/);
  assert.match(read("lib/website-os-business.js"), /new Set\(destinations\.map/);
});

test("admin APIs require Website OS sessions and expose scoped document contracts", () => {
  const updateApi = read("api/admin-update-task.js");
  const readApi = read("api/admin-tasks.js");
  const repository = read("lib/website-os-repository.js");
  assert.match(updateApi, /isCommonplaceBusinessActionRequest/);
  assert.match(updateApi, /authContext\.mode !== "website_os"/);
  assert.match(updateApi, /handleWebsiteOsBusinessAction\(authContext\.current, input\)/);
  assert.match(updateApi, /syncInvoiceDocuments/);
  assert.match(updateApi, /getInvoiceDocumentBundle/);
  assert.match(updateApi, /selectedDocumentIds === undefined[\s\S]*getInvoiceDocumentBundle\(current, updated\.id\)/);
  assert.match(updateApi, /linkPolicyAcceptancesToCustomer\(current, booking\.taskId, customer\.id\)/);
  assert.match(readApi, /listScopedRecords\(authorized\.current, "invoiceDocument"/);
  assert.match(repository, /businessProfile: "website_os_business_profiles"/);
  assert.match(repository, /policyAcceptance: "website_os_policy_acceptances"/);
  assert.match(read("lib/website-os-business.js"), /policy_reactivated/);
});

test("public booking policy flow records versions without raw email or IP", () => {
  const api = read("api/task-submit.js");
  const business = read("lib/website-os-business.js");
  const cp = read("cp/index.html");
  const book = read("cp-book/index.html");
  assert.match(api, /commonpl4ce_policies/);
  assert.match(api, /validateCommonplacePublicRequest/);
  assert.match(api, /assertBookingPolicyAcceptances/);
  assert.match(api, /recordBookingPolicyAcceptances/);
  assert.match(business, /website_os_record_policy_acceptances/);
  assert.doesNotMatch(read("supabase/migrations/065_website_os_business_documents.sql"), /\bip_address\b/i);
  [cp, book].forEach((page) => {
    assert.match(page, /name=['"]booking-policy['"]/);
    assert.match(page, /policy_acceptances:/);
    assert.match(page, /commonpl4ce_policies=1/);
  });
  assert.match(book, /source:\s*'commonpl4ce_booker'/);
  assert.match(book, /intakeVersion:\s*'commonpl4ce_booker_v1'/);
});

test("Website OS exposes complete document, policy, identity and invoice attachment controls", () => {
  const ui = read("admin/website-os/commonpl4ce/index.html");
  assert.match(ui, /data-view-target="documents"/);
  assert.match(ui, /id="businessIdentityForm"/);
  assert.match(ui, /id="businessDomainForm"/);
  assert.match(ui, /id="businessEmailForm"/);
  assert.match(ui, /data-business-tab-target="documents"/);
  assert.match(ui, /data-business-tab-target="policies"/);
  assert.match(ui, /data-publish-business-document/);
  assert.match(ui, /data-rollback-business-document/);
  assert.match(ui, /Automatic workflow attachments/);
  assert.match(ui, /id="invoiceDocumentChoices"/);
  assert.match(ui, /document_ids: invoiceDocumentIdsFromForm\(\)/);
  assert.match(ui, /state\.businessPolicyAcceptances/);
  assert.match(ui, /min-height: 44px/);
});

test("Business Documents default flow uses presets, focused editing and progressive disclosure", () => {
  const ui = read("admin/website-os/commonpl4ce/index.html");
  ["booking_policy", "cancellation_policy", "invoice_terms", "service_agreement", "custom"].forEach((preset) => {
    assert.match(ui, new RegExp(`data-document-preset=["']${preset}["']`));
  });
  assert.match(ui, /grid-template-columns: minmax\(250px, \.62fr\) minmax\(0, 1\.38fr\)/);
  assert.doesNotMatch(ui, /grid-template-columns: minmax\(220px, \.72fr\) minmax\(360px, 1\.25fr\) minmax\(280px, \.9fr\)/);
  assert.match(ui, /Document title/);
  assert.match(ui, /Document content/);
  assert.match(ui, /BUSINESS_SIMPLE_DESTINATIONS/);
  assert.match(ui, /<details class="business-advanced">/);
  assert.match(ui, /Version reference/);
  assert.match(ui, /Additional workflow destinations/);
  assert.match(ui, /id="advancedBusinessDocumentType"/);
  assert.match(ui, /id="addBusinessDocument"/);
  assert.match(ui, /data-open-document-preview/);
  assert.match(ui, /id="businessDocumentPreviewDialog"[^>]*hidden[^>]*aria-hidden="true"[^>]*inert/);
});

test("Policy manager hides technical defaults and opens acceptance evidence on demand", () => {
  const ui = read("admin/website-os/commonpl4ce/index.html");
  ["Required during booking", "Optional during booking", "Include with invoice", "Internal only"].forEach((label) => assert.match(ui, new RegExp(label)));
  assert.match(ui, /data-open-policy-acceptances/);
  assert.match(ui, /id="businessAcceptanceDialog"[^>]*hidden[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(ui, /data-toggle-business-policy/);
  assert.match(ui, /System acceptance evidence/);
  assert.match(ui, /evidence\.includes\("controlled"\) && evidence\.includes\("policy"\)/);
  assert.match(ui, /state\.documentStatusFilter = "active"/);
  assert.match(ui, /state\.documentStatusFilter = preferredDocument\.status/);
  assert.doesNotMatch(ui, /name="policy_key"/);
  assert.match(ui, /policy_key: policy\.policy_key/);
  assert.match(read("lib/website-os-business.js"), /policy_key: policyKey\(input\.policy_key \|\| input\.policyKey \|\| document\.document_type \|\| document\.title\)/);
});

test("Business Documents mobile flow uses one task at a time and sticky primary actions", () => {
  const ui = read("admin/website-os/commonpl4ce/index.html");
  assert.match(ui, /data-mobile-screen="list"/);
  assert.match(ui, /document-workspace\[data-mobile-screen="list"\] \.document-editor-pane/);
  assert.match(ui, /document-workspace\[data-mobile-screen="editor"\] \.document-library-pane/);
  assert.match(ui, /\.document-sticky-actions[\s\S]*position: fixed/);
  assert.match(ui, /min-height: 44px/);
});

test("business document PDF is branded and downloadable", async () => {
  const pdf = await buildWebsiteOsDocumentPdf({
    title: "Booking Policy",
    version_label: "1.0",
    effective_date: "2026-07-20",
    language: "nl",
    body: "First paragraph.\n\nSecond paragraph."
  }, {
    business_name: "COMMONPL4CE",
    invoice_footer: "COMMONPL4CE · Amsterdam"
  });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
  assert.equal(documentPdfName({ title: "Booking Policy", version_label: "1.0" }), "booking-policy-v1.0.pdf");
});

test("all affected inline scripts parse", () => {
  ["admin/website-os/commonpl4ce/index.html", "cp/index.html", "cp-book/index.html"].forEach((file) => {
    const html = read(file);
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((match) => !/src=|application\/json|application\/ld\+json/i.test(match[1]))
      .map((match) => match[2]);
    scripts.forEach((script, index) => assert.doesNotThrow(() => new Function(script), `${file} inline script ${index + 1}`));
  });
});
