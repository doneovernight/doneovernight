const crypto = require("crypto");
const { clean, normalizeEmail, supabaseFetch } = require("./ops");

const PAYMENT_RECORDS_TABLE = "payment_records";
const DEFAULT_CURRENCY = "EUR";

function normalizeMoney(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).replace(/[^\d]/g, "");
}

function centsFromAmount(value) {
  const normalized = normalizeMoney(value);
  if (!normalized) return 0;
  return Number.parseInt(normalized, 10) * 100;
}

function formatCurrency(cents = 0, currency = DEFAULT_CURRENCY) {
  const amount = Number(cents || 0) / 100;
  return `${clean(currency) || DEFAULT_CURRENCY} ${amount.toFixed(2)}`;
}

function hashInvoiceToken(token = "") {
  return crypto.createHash("sha256").update(clean(token)).digest("hex");
}

function pdfEscape(value = "") {
  return clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function splitLines(value = "", maxLength = 72) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawText(lines, { x, y, size = 10, leading = 14, bold = false } = {}) {
  return lines.map((line, index) => {
    const font = bold ? "F2" : "F1";
    const nextY = y - index * leading;
    return `BT /${font} ${size} Tf ${x} ${nextY} Td (${pdfEscape(line)}) Tj ET`;
  }).join("\n");
}

function buildPdf(objects) {
  const header = "%PDF-1.4\n";
  const body = [];
  const offsets = [0];
  let cursor = header.length;

  objects.forEach((object, index) => {
    offsets.push(cursor);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    body.push(chunk);
    cursor += chunk.length;
  });

  const xrefOffset = cursor;
  const xrefRows = offsets.map((offset, index) => {
    if (index === 0) return "0000000000 65535 f ";
    return `${String(offset).padStart(10, "0")} 00000 n `;
  }).join("\n");
  const trailer = [
    `xref`,
    `0 ${objects.length + 1}`,
    xrefRows,
    `trailer`,
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref`,
    String(xrefOffset),
    `%%EOF`
  ].join("\n");

  return Buffer.from(`${header}${body.join("")}${trailer}`, "binary");
}

function buildInvoicePdf(invoice = {}) {
  const yStart = 790;
  const currency = clean(invoice.currency) || DEFAULT_CURRENCY;
  const rows = [
    ["Invoice Number", invoice.invoice_number],
    ["Issue Date", invoice.issue_date],
    ["Payment Date", invoice.payment_date],
    ["Reference", invoice.task_id],
    ["Payment Status", "PAID"],
    ["Payment Reference", invoice.payment_reference],
    ["Provider Reference", invoice.provider_reference || invoice.payment_reference]
  ];
  const clientLines = [
    clean(invoice.client_name) || "Client",
    clean(invoice.client_company),
    clean(invoice.client_email),
    clean(invoice.billing_details)
  ].filter(Boolean);
  const descriptionLines = splitLines(clean(invoice.description) || "Execution Plan", 58);
  const content = [
    "0.05 0.05 0.05 rg 0 0 595 842 re f",
    "0.93 0.88 0.78 rg 42 42 511 758 re f",
    "0.10 0.10 0.10 rg",
    drawText(["DONEOVERNIGHT®"], { x: 60, y: yStart, size: 14, bold: true }),
    drawText(["Invoice"], { x: 60, y: 752, size: 32, bold: true, leading: 36 }),
    drawText(rows.map(([label, value]) => `${label}: ${value || "-"}`), { x: 60, y: 702, size: 10, leading: 16 }),
    drawText(["SELLER", "DONEOVERNIGHT®", "Email: ask@doneovernight.com", "Website: doneovernight.com"], { x: 60, y: 560, size: 10, leading: 15, bold: false }),
    drawText(["CLIENT", ...clientLines], { x: 330, y: 560, size: 10, leading: 15 }),
    drawText(["DESCRIPTION", ...descriptionLines], { x: 60, y: 450, size: 10, leading: 15 }),
    "0.72 0.60 0.38 RG 60 338 475 0.8 w 0.8 S",
    drawText(["Subtotal", "VAT", "Total", "Currency"], { x: 60, y: 314, size: 11, leading: 22, bold: true }),
    drawText([
      formatCurrency(invoice.subtotal_cents, currency),
      formatCurrency(invoice.vat_cents, currency),
      formatCurrency(invoice.total_cents, currency),
      currency
    ], { x: 430, y: 314, size: 11, leading: 22 }),
    "0.72 0.60 0.38 RG 60 214 475 0.8 w 0.8 S",
    drawText(["PAID"], { x: 60, y: 186, size: 18, bold: true }),
    drawText(["DONEOVERNIGHT®", "Overnight execution."], { x: 60, y: 92, size: 10, leading: 15 })
  ].join("\n");
  const stream = `${content}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}endstream`
  ];
  return buildPdf(objects);
}

function getVatRate() {
  const raw = clean(process.env.INVOICE_VAT_RATE || "0").replace(",", ".");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function invoiceDescriptionForTask(task = {}) {
  return clean(
    task.quote_deliverables ||
    task.raw_payload?.quote_deliverables ||
    task.raw_payload?.deliverables ||
    task.quote_note ||
    task.raw_payload?.quote_note ||
    task.task_summary ||
    task.task_description ||
    task.raw_payload?.task_summary ||
    task.raw_payload?.task_description ||
    "Execution Plan"
  );
}

function getExistingInvoiceSnapshot(task = {}, payment = {}) {
  const raw = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const invoices = Array.isArray(raw.invoices) ? raw.invoices : [];
  const paymentReference = clean(payment.paymentReference || payment.payment_reference);
  const amountPaid = normalizeMoney(payment.amountPaid || payment.amount_paid);
  return invoices.find((invoice) => (
    clean(invoice.payment_reference) === paymentReference &&
    normalizeMoney(invoice.invoice_amount || invoice.total_amount || invoice.amount_paid) === amountPaid
  )) || null;
}

async function insertPaymentRecord(snapshot = {}, tokenHash = "") {
  const payload = {
    task_id: snapshot.task_id,
    client_email: snapshot.client_email,
    client_name: snapshot.client_name,
    workspace_id: snapshot.workspace_id,
    invoice_amount: snapshot.invoice_amount,
    currency: snapshot.currency,
    payment_reference: snapshot.payment_reference,
    provider_reference: snapshot.provider_reference,
    invoice_pdf_url: snapshot.invoice_pdf_url,
    invoice_download_token_hash: tokenHash,
    status: "paid",
    invoice_snapshot: snapshot,
    raw_payload: {
      source: "workspace_activation",
      immutable: true
    }
  };
  const rows = await supabaseFetch(PAYMENT_RECORDS_TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function findPaymentRecordByReference(paymentReference = "") {
  const reference = clean(paymentReference);
  if (!reference) return null;
  const rows = await supabaseFetch([
    `${PAYMENT_RECORDS_TABLE}?payment_reference=eq.${encodeURIComponent(reference)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : null;
}

async function createInvoiceForPayment({ task = {}, workspace = {}, payment = {}, workspaceUrl = "" } = {}) {
  const existing = getExistingInvoiceSnapshot(task, payment);
  if (existing?.invoice_number) {
    const pdf = buildInvoicePdf(existing);
    return {
      configured: true,
      created: false,
      reused: true,
      invoice: existing,
      pdf,
      attachment: {
        filename: `${existing.invoice_number}.pdf`,
        content_type: "application/pdf",
        content_base64: pdf.toString("base64")
      }
    };
  }

  const existingRecord = await findPaymentRecordByReference(payment.paymentReference || payment.payment_reference);
  if (existingRecord?.invoice_number && existingRecord.invoice_snapshot) {
    const invoice = existingRecord.invoice_snapshot;
    const pdf = buildInvoicePdf(invoice);
    return {
      configured: true,
      created: false,
      reused: true,
      invoice,
      pdf,
      attachment: {
        filename: `${invoice.invoice_number}.pdf`,
        content_type: "application/pdf",
        content_base64: pdf.toString("base64")
      }
    };
  }

  const now = new Date().toISOString();
  const currency = clean(task.currency || task.raw_payload?.currency || DEFAULT_CURRENCY) || DEFAULT_CURRENCY;
  const totalCents = centsFromAmount(payment.amountPaid || payment.amount_paid);
  const vatRate = getVatRate();
  const subtotalCents = vatRate > 0 ? Math.round(totalCents / (1 + vatRate / 100)) : totalCents;
  const vatCents = totalCents - subtotalCents;
  const taskId = clean(task.task_id || task.taskId || task.id);
  const email = normalizeEmail(task.email || task.client_email || task.raw_payload?.email);
  const token = crypto.randomBytes(24).toString("base64url");
  const invoice = {
    invoice_number: "",
    invoice_created_at: now,
    issue_date: now.slice(0, 10),
    payment_date: now.slice(0, 10),
    invoice_amount: String(totalCents / 100),
    subtotal_cents: subtotalCents,
    vat_cents: vatCents,
    total_cents: totalCents,
    vat_rate: vatRate,
    currency,
    payment_status: "PAID",
    payment_reference: clean(payment.paymentReference || payment.payment_reference),
    provider_reference: clean(payment.provider_reference || payment.providerReference || payment.paymentReference || payment.payment_reference),
    task_id: taskId,
    client_email: email,
    client_name: clean(task.name || task.raw_payload?.name),
    client_company: clean(task.company || task.raw_payload?.company),
    billing_details: clean(task.billing_details || task.raw_payload?.billing_details),
    workspace_id: clean(workspace.id),
    workspace_url: workspaceUrl,
    description: invoiceDescriptionForTask(task),
    seller: {
      name: "DONEOVERNIGHT®",
      email: "ask@doneovernight.com",
      website: "doneovernight.com"
    }
  };

  let record;
  try {
    record = await insertPaymentRecord(invoice, hashInvoiceToken(token));
  } catch (error) {
    error.code = error.code || "PAYMENT_RECORD_INSERT_FAILED";
    throw error;
  }

  const invoiceNumber = clean(record.invoice_number);
  if (!invoiceNumber) {
    const error = new Error("Invoice number was not generated");
    error.code = "INVOICE_NUMBER_NOT_GENERATED";
    error.statusCode = 500;
    throw error;
  }

  const invoicePdfUrl = `https://doneovernight.com/api/invoice-download?task_id=${encodeURIComponent(taskId)}&invoice_number=${encodeURIComponent(invoiceNumber)}&token=${encodeURIComponent(token)}`;
  const finalInvoice = {
    ...invoice,
    id: record.id || "",
    invoice_number: invoiceNumber,
    invoice_pdf_url: invoicePdfUrl
  };
  await supabaseFetch(`${PAYMENT_RECORDS_TABLE}?id=eq.${encodeURIComponent(record.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      invoice_pdf_url: invoicePdfUrl,
      invoice_snapshot: finalInvoice
    })
  }).catch(() => null);

  const pdf = buildInvoicePdf(finalInvoice);
  return {
    configured: true,
    created: true,
    reused: false,
    invoice: finalInvoice,
    pdf,
    attachment: {
      filename: `${invoiceNumber}.pdf`,
      content_type: "application/pdf",
      content_base64: pdf.toString("base64")
    }
  };
}

async function loadInvoiceForDownload({ taskId = "", invoiceNumber = "", token = "" } = {}) {
  const rows = await supabaseFetch([
    `${PAYMENT_RECORDS_TABLE}?task_id=eq.${encodeURIComponent(clean(taskId))}`,
    `invoice_number=eq.${encodeURIComponent(clean(invoiceNumber))}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record || !token || hashInvoiceToken(token) !== clean(record.invoice_download_token_hash)) {
    const error = new Error("Invoice not found");
    error.statusCode = 404;
    error.code = "INVOICE_NOT_FOUND";
    throw error;
  }
  return {
    record,
    invoice: record.invoice_snapshot || {
      ...record,
      invoice_number: record.invoice_number,
      task_id: record.task_id
    }
  };
}

async function handleInvoiceDownloadRequest(req, res) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`);
  const taskId = clean(url.searchParams.get("task_id"));
  const invoiceNumber = clean(url.searchParams.get("invoice_number"));
  const token = clean(url.searchParams.get("token"));
  const { invoice } = await loadInvoiceForDownload({ taskId, invoiceNumber, token });
  const pdf = buildInvoicePdf(invoice);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoice_number}.pdf"`);
  res.end(pdf);
}

module.exports = {
  buildInvoicePdf,
  createInvoiceForPayment,
  handleInvoiceDownloadRequest,
  normalizeMoney,
  formatCurrency
};
