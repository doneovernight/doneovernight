const INVOICE_STATUSES = Object.freeze(["draft", "sent", "paid", "overdue", "cancelled", "credited"]);
const STATUS_TRANSITIONS = Object.freeze({
  draft: new Set(["sent", "cancelled"]),
  sent: new Set(["paid", "overdue", "cancelled", "credited"]),
  overdue: new Set(["paid", "cancelled", "credited"]),
  paid: new Set(["credited"]),
  cancelled: new Set(),
  credited: new Set()
});

function invoiceError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseMoneyToCents(value, field = "amount") {
  if (Number.isInteger(value) && value >= 0) return value;
  const normalized = clean(String(value ?? ""))
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw invoiceError(`Invalid ${field}`, "INVOICE_AMOUNT_INVALID");
  return Math.round(amount * 100);
}

function normalizeDate(value, field) {
  const date = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    throw invoiceError(`Invalid ${field}`, "INVOICE_DATE_INVALID");
  }
  return date;
}

function normalizeLineItems(value) {
  if (!Array.isArray(value) || !value.length || value.length > 25) {
    throw invoiceError("Invoice requires 1 to 25 line items", "INVOICE_LINE_ITEMS_INVALID");
  }
  return value.map((item, index) => {
    const description = clean(item?.description);
    const quantity = Number(item?.quantity);
    const unitPriceCents = parseMoneyToCents(item?.unit_price_cents ?? item?.unitPriceCents ?? item?.unit_price ?? item?.unitPrice, `line item ${index + 1} unit price`);
    if (!description || description.length > 240) throw invoiceError(`Invalid line item ${index + 1} description`, "INVOICE_LINE_ITEM_DESCRIPTION_INVALID");
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10_000) throw invoiceError(`Invalid line item ${index + 1} quantity`, "INVOICE_LINE_ITEM_QUANTITY_INVALID");
    const roundedQuantity = Math.round(quantity * 100) / 100;
    const lineTotalCents = Math.round(roundedQuantity * unitPriceCents);
    return {
      description,
      quantity: roundedQuantity,
      unit_price_cents: unitPriceCents,
      line_total_cents: lineTotalCents
    };
  });
}

function calculateInvoiceTotals(lineItems, vatRate) {
  const rate = Number(vatRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw invoiceError("VAT rate must be between 0 and 100", "INVOICE_VAT_INVALID");
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.line_total_cents, 0);
  if (subtotalCents <= 0) throw invoiceError("Invoice subtotal must be greater than zero", "INVOICE_SUBTOTAL_INVALID");
  const vatCents = Math.round(subtotalCents * rate / 100);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents, vatRate: Math.round(rate * 100) / 100 };
}

function normalizeInvoiceInput(input = {}, booking = {}, customer = {}) {
  const customerName = clean(input.customer_name || input.customerName || customer.name || booking.name);
  const customerEmail = clean(input.customer_email || input.customerEmail || customer.email || booking.email).toLowerCase();
  const customerCompany = clean(input.customer_company || input.customerCompany || customer.company || booking.brandCompany);
  if (!customerName) throw invoiceError("Customer name is required", "INVOICE_CUSTOMER_NAME_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw invoiceError("A valid customer email is required", "INVOICE_CUSTOMER_EMAIL_INVALID");
  const invoiceNumber = clean(input.invoice_number || input.invoiceNumber);
  if (invoiceNumber && !/^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/.test(invoiceNumber)) {
    throw invoiceError("Invoice number contains unsupported characters", "INVOICE_NUMBER_INVALID");
  }
  const lineItems = normalizeLineItems(input.line_items || input.lineItems);
  const totals = calculateInvoiceTotals(lineItems, input.vat_rate ?? input.vatRate ?? 21);
  const issueDate = normalizeDate(input.issue_date || input.issueDate, "issue date");
  const dueDate = normalizeDate(input.due_date || input.dueDate, "due date");
  if (dueDate < issueDate) throw invoiceError("Due date cannot be before issue date", "INVOICE_DUE_DATE_INVALID");
  return {
    booking_task_id: clean(booking.taskId || booking.task_id || booking.id) || null,
    client_id: clean(customer.id) || null,
    invoice_number: invoiceNumber || null,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_company: customerCompany,
    customer_details: {
      address: clean(input.customer_address || input.customerAddress || customer.billing_address),
      phone: clean(input.customer_phone || input.customerPhone || customer.phone),
      vat_number: clean(input.customer_vat_number || input.customerVatNumber || customer.vat_number)
    },
    line_items: lineItems,
    currency: "EUR",
    subtotal_cents: totals.subtotalCents,
    vat_rate: totals.vatRate,
    vat_cents: totals.vatCents,
    total_cents: totals.totalCents,
    status: "draft",
    payment_status: "unpaid",
    issue_date: issueDate,
    due_date: dueDate,
    notes: clean(input.notes || input.invoice_notes || input.invoiceNotes)
  };
}

function buildInvoiceStatusPatch(invoice = {}, nextStatus, now = new Date().toISOString()) {
  const current = clean(invoice.status).toLowerCase();
  const next = clean(nextStatus).toLowerCase();
  if (!INVOICE_STATUSES.includes(next)) throw invoiceError("Invalid invoice status", "INVOICE_STATUS_INVALID");
  if (current === next) return { status: next, updated_by: undefined };
  if (!STATUS_TRANSITIONS[current]?.has(next)) {
    throw invoiceError(`Invoice cannot move from ${current || "unknown"} to ${next}`, "INVOICE_STATUS_TRANSITION_INVALID", 409);
  }
  const patch = { status: next };
  if (next === "sent") {
    patch.payment_status = "unpaid";
    patch.sent_at = invoice.sent_at || now;
  } else if (next === "overdue") {
    patch.payment_status = "unpaid";
    patch.overdue_at = now;
  } else if (next === "paid") {
    patch.payment_status = "paid";
    patch.paid_at = now;
  } else if (next === "cancelled") {
    patch.payment_status = "cancelled";
    patch.cancelled_at = now;
  } else if (next === "credited") {
    patch.payment_status = "credited";
    patch.credited_at = now;
  }
  return patch;
}

function summarizeInvoices(invoices = []) {
  const active = invoices.filter((invoice) => !["cancelled", "credited"].includes(invoice.status));
  const invoiced = invoices.filter((invoice) => ["sent", "paid", "overdue"].includes(invoice.status));
  const paid = invoices.filter((invoice) => invoice.status === "paid" && invoice.payment_status === "paid");
  return {
    connected: true,
    invoiceCount: invoices.length,
    activeCount: active.length,
    paidCount: paid.length,
    invoicedCents: invoiced.reduce((sum, invoice) => sum + Number(invoice.subtotal_cents || 0), 0),
    paidCents: paid.reduce((sum, invoice) => sum + Number(invoice.subtotal_cents || 0), 0),
    revenueCents: paid.reduce((sum, invoice) => sum + Number(invoice.subtotal_cents || 0), 0),
    accountingRule: "invoiced_and_paid_subtotals_excluding_vat"
  };
}

module.exports = {
  INVOICE_STATUSES,
  STATUS_TRANSITIONS,
  buildInvoiceStatusPatch,
  calculateInvoiceTotals,
  normalizeInvoiceInput,
  normalizeLineItems,
  parseMoneyToCents,
  summarizeInvoices
};
