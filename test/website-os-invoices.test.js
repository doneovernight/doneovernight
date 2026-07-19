const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildInvoiceStatusPatch,
  normalizeInvoiceInput,
  summarizeInvoices
} = require("../lib/website-os-invoices");

test("normalizes line items and calculates VAT in cents", () => {
  const invoice = normalizeInvoiceInput({
    customer_name: "Romy Client",
    customer_email: "client@example.com",
    line_items: [
      { description: "Shoot", quantity: 1, unit_price: "1000.00" },
      { description: "Usage", quantity: 2, unit_price: "125.50" }
    ],
    vat_rate: 21,
    issue_date: "2026-07-19",
    due_date: "2026-08-02"
  }, { taskId: "DON-2026-00001" });

  assert.equal(invoice.subtotal_cents, 125100);
  assert.equal(invoice.vat_cents, 26271);
  assert.equal(invoice.total_cents, 151371);
  assert.equal(invoice.status, "draft");
  assert.equal(invoice.payment_status, "unpaid");
});

test("recognizes revenue only from paid subtotals excluding VAT", () => {
  const summary = summarizeInvoices([
    { status: "paid", payment_status: "paid", subtotal_cents: 100000, total_cents: 121000 },
    { status: "sent", payment_status: "unpaid", subtotal_cents: 50000, total_cents: 60500 },
    { status: "overdue", payment_status: "unpaid", subtotal_cents: 30000, total_cents: 36300 },
    { status: "cancelled", payment_status: "cancelled", subtotal_cents: 90000, total_cents: 108900 }
  ]);

  assert.equal(summary.revenueCents, 100000);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.accountingRule, "paid_subtotal_excluding_vat");
});

test("enforces safe invoice lifecycle transitions", () => {
  const sent = buildInvoiceStatusPatch({ status: "draft" }, "sent", "2026-07-19T10:00:00.000Z");
  assert.equal(sent.status, "sent");
  assert.equal(sent.payment_status, "unpaid");
  assert.equal(sent.sent_at, "2026-07-19T10:00:00.000Z");

  const paid = buildInvoiceStatusPatch({ status: "sent" }, "paid", "2026-07-20T10:00:00.000Z");
  assert.equal(paid.payment_status, "paid");
  assert.equal(paid.paid_at, "2026-07-20T10:00:00.000Z");

  assert.throws(
    () => buildInvoiceStatusPatch({ status: "paid" }, "cancelled"),
    (error) => error.code === "INVOICE_STATUS_TRANSITION_INVALID" && error.statusCode === 409
  );
});

test("rejects invalid invoice totals and dates", () => {
  assert.throws(() => normalizeInvoiceInput({
    customer_name: "Client",
    customer_email: "client@example.com",
    line_items: [{ description: "Shoot", quantity: 1, unit_price: "0" }],
    vat_rate: 21,
    issue_date: "2026-07-19",
    due_date: "2026-07-18"
  }, { taskId: "DON-2026-00001" }), (error) => error.code === "INVOICE_SUBTOTAL_INVALID");
});

test("migration and APIs enforce workspace scope, auth, and duplicate protection", () => {
  const root = path.resolve(__dirname, "..");
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/059_website_os_invoices.sql"), "utf8");
  const updateApi = fs.readFileSync(path.join(root, "api/admin-update-task.js"), "utf8");
  const readApi = fs.readFileSync(path.join(root, "api/admin-tasks.js"), "utf8");

  assert.match(migration, /workspace_id uuid not null references public\.website_os_workspaces/);
  assert.match(migration, /website_os_invoices_booking_active_unique_idx/);
  assert.match(migration, /where status <> 'cancelled' and allow_duplicate = false/);
  assert.match(migration, /enable row level security/);
  assert.match(updateApi, /requireWebsiteOsSession\(req, \{\s*slug: "cp"/);
  assert.match(updateApi, /assertInvoiceRole\(current, \["Owner", "Admin"\]\)/);
  assert.match(updateApi, /Booking not found in this workspace/);
  assert.match(readApi, /listScopedRecords\(authorized\.current, "invoice"/);
});
