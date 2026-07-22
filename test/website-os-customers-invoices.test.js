const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { duplicateCustomer, normalizeCustomerInput } = require("../lib/website-os-customers");
const { buildWebsiteOsInvoicePdf } = require("../lib/website-os-invoice-pdf");
const { normalizeInvoiceInput, summarizeInvoices } = require("../lib/website-os-invoices");

test("customer normalization provides stable duplicate identities", () => {
  const customer = normalizeCustomerInput({
    name: "Romy Client",
    company: "Studio North B.V.",
    email: " HELLO@STUDIO.NORTH ",
    phone: "+31 6 12345678",
    billing_address: "Keizersgracht 1, Amsterdam",
    vat_number: "NL123456789B01"
  });
  assert.equal(customer.normalized_email, "hello@studio.north");
  assert.equal(customer.normalized_company, "studionorthbv");
  assert.equal(duplicateCustomer([{ id: "one", ...customer }], { ...customer, name: "Another contact" }).id, "one");
});

test("invoice from a persisted customer retains customer and booking links", () => {
  const invoice = normalizeInvoiceInput({
    line_items: [{ description: "Campaign photography", quantity: 2, unit_price: "750" }],
    vat_rate: 21,
    issue_date: "2026-07-19",
    due_date: "2026-08-02",
    notes: "Usage included"
  }, { taskId: "DON-2026-00001" }, {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Romy Client",
    email: "client@example.com",
    company: "Studio North",
    billing_address: "Amsterdam",
    vat_number: "NL123"
  });
  assert.equal(invoice.client_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(invoice.booking_task_id, "DON-2026-00001");
  assert.equal(invoice.subtotal_cents, 150000);
  assert.equal(invoice.total_cents, 181500);
  assert.equal(invoice.notes, "Usage included");
});

test("Website OS invoice PDF is a downloadable valid PDF payload", async () => {
  const pdf = await buildWebsiteOsInvoicePdf({
    invoice_number: "CP-2026-00001",
    issue_date: "2026-07-19",
    due_date: "2026-08-02",
    status: "draft",
    customer_name: "Romy Client",
    customer_email: "client@example.com",
    customer_company: "Studio North",
    customer_details: { address: "Amsterdam", vat_number: "NL123" },
    line_items: [{ description: "Campaign photography", quantity: 1, unit_price_cents: 100000, line_total_cents: 100000 }],
    subtotal_cents: 100000,
    vat_rate: 21,
    vat_cents: 21000,
    total_cents: 121000,
    currency: "EUR"
  });
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.ok(pdf.length > 1000);
});

test("migration and runtime contracts complete persistent customer and invoice modules", () => {
  const root = path.resolve(__dirname, "..");
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/060_website_os_customers_invoice_completion.sql"), "utf8");
  const api = fs.readFileSync(path.join(root, "api/admin-update-task.js"), "utf8");
  const readApi = fs.readFileSync(path.join(root, "api/admin-tasks.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "admin/website-os/commonpl4ce/index.html"), "utf8");
  assert.match(migration, /create table if not exists public\.website_os_clients/);
  assert.match(migration, /create table if not exists public\.website_os_client_bookings/);
  assert.match(migration, /normalized_email/);
  assert.match(migration, /website_os_invoices_workspace_number_idx/);
  assert.match(migration, /status in \('draft', 'sent', 'paid', 'overdue', 'cancelled', 'credited'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(api, /commonpl4ce_customer_action/);
  assert.match(api, /assertCustomerRole\(current\)/);
  assert.match(api, /getScopedRecord\(current, "client"/);
  assert.match(api, /Customer not found in this workspace/);
  assert.match(api, /MARK_INVOICE_SENT/);
  assert.match(api, /buildWebsiteOsInvoicePdf/);
  assert.match(readApi, /customerBookings/);
  assert.match(ui, /data-create-customer-for/);
  assert.match(ui, /data-download-invoice/);
  assert.match(ui, /Invoiced and paid totals/);
});

test("production revenue excludes drafts, cancellations and credits", () => {
  const summary = summarizeInvoices([
    { status: "draft", payment_status: "unpaid", subtotal_cents: 50000 },
    { status: "sent", payment_status: "unpaid", subtotal_cents: 100000 },
    { status: "paid", payment_status: "paid", subtotal_cents: 200000 },
    { status: "cancelled", payment_status: "cancelled", subtotal_cents: 300000 },
    { status: "credited", payment_status: "credited", subtotal_cents: 400000 }
  ]);
  assert.equal(summary.invoicedCents, 300000);
  assert.equal(summary.paidCents, 200000);
});

test("customer and invoice repository reads cannot cross workspace scope", async () => {
  const repositoryPath = require.resolve("../lib/website-os-repository");
  const opsPath = require.resolve("../lib/ops");
  const originalOps = require.cache[opsPath];
  const requests = [];
  require.cache[opsPath] = {
    id: opsPath,
    filename: opsPath,
    loaded: true,
    exports: {
      clean: (value) => String(value || "").trim(),
      supabaseFetch: async (request) => {
        requests.push(request);
        return [];
      }
    }
  };
  delete require.cache[repositoryPath];
  try {
    const { getScopedRecord, listScopedRecords } = require(repositoryPath);
    const context = { workspace: { id: "workspace-a" }, user: { id: "owner-a" } };
    await getScopedRecord(context, "client", "11111111-1111-4111-8111-111111111111");
    await listScopedRecords(context, "invoice");
    assert.equal(requests.length, 2);
    assert.ok(requests.every((request) => String(request).includes("workspace_id=eq.workspace-a")));
    assert.ok(requests.every((request) => !String(request).includes("workspace-b")));
  } finally {
    delete require.cache[repositoryPath];
    if (originalOps) require.cache[opsPath] = originalOps;
    else delete require.cache[opsPath];
  }
});
