function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function escapePdf(value = "") {
  return clean(value).replace(/[^\x20-\x7e]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(cents, currency = "EUR") {
  return `${clean(currency) || "EUR"} ${(Number(cents || 0) / 100).toFixed(2)}`;
}

function text(value, x, y, size = 10, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;
}

function buildPdf(objects) {
  const header = "%PDF-1.4\n";
  const chunks = [];
  const offsets = [0];
  let cursor = Buffer.byteLength(header, "binary");
  objects.forEach((object, index) => {
    offsets.push(cursor);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    cursor += Buffer.byteLength(chunk, "binary");
  });
  const xref = cursor;
  const rows = offsets.map((offset, index) => index === 0
    ? "0000000000 65535 f "
    : `${String(offset).padStart(10, "0")} 00000 n `).join("\n");
  return Buffer.from(`${header}${chunks.join("")}xref\n0 ${objects.length + 1}\n${rows}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`, "binary");
}

function buildWebsiteOsInvoicePdf(invoice = {}) {
  const customer = invoice.customer_details && typeof invoice.customer_details === "object" ? invoice.customer_details : {};
  const items = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  let y = 590;
  const itemRows = [];
  items.slice(0, 14).forEach((item) => {
    itemRows.push(text(clean(item.description).slice(0, 58), 58, y, 9));
    itemRows.push(text(`${item.quantity} x ${money(item.unit_price_cents, invoice.currency)}`, 365, y, 9));
    y -= 18;
  });
  const content = [
    "0.04 0.04 0.04 rg 0 0 595 842 re f",
    "0.93 0.90 0.82 rg 38 38 519 766 re f",
    "0.10 0.10 0.10 rg",
    text("COMMONPL4CE", 58, 775, 13, true),
    text("Invoice", 58, 730, 30, true),
    text(clean(invoice.invoice_number), 58, 700, 11, true),
    text(`Issue date: ${clean(invoice.issue_date)}`, 58, 675, 10),
    text(`Due date: ${clean(invoice.due_date)}`, 58, 658, 10),
    text(`Status: ${clean(invoice.status).toUpperCase()}`, 58, 641, 10),
    text("CUSTOMER", 340, 730, 10, true),
    text(clean(invoice.customer_name), 340, 710, 10),
    text(clean(invoice.customer_company), 340, 693, 10),
    text(clean(invoice.customer_email), 340, 676, 10),
    text(clean(customer.address), 340, 659, 9),
    text(clean(customer.vat_number) ? `VAT: ${clean(customer.vat_number)}` : "", 340, 642, 9),
    text("DESCRIPTION", 58, 616, 10, true),
    ...itemRows,
    "0.45 0.40 0.31 RG 58 300 479 0.8 w 0.8 S",
    text("Subtotal", 330, 274, 10, true), text(money(invoice.subtotal_cents, invoice.currency), 445, 274, 10),
    text(`VAT (${invoice.vat_rate}%)`, 330, 251, 10, true), text(money(invoice.vat_cents, invoice.currency), 445, 251, 10),
    text("Total", 330, 222, 13, true), text(money(invoice.total_cents, invoice.currency), 445, 222, 13, true),
    text(clean(invoice.notes).slice(0, 90), 58, 174, 9),
    text("Powered by DONEOVERNIGHT", 58, 80, 9)
  ].join("\n");
  const stream = `${content}\n`;
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}endstream`
  ]);
}

module.exports = { buildWebsiteOsInvoicePdf };
