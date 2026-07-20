const PDFDocument = require("pdfkit");

const BODY_FONT = require.resolve("@fontsource/inter/files/inter-latin-ext-400-normal.woff");
const BOLD_FONT = require.resolve("@fontsource/inter/files/inter-latin-ext-600-normal.woff");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function money(cents, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: clean(currency) || "EUR"
  }).format(Number(cents || 0) / 100);
}

function buildWebsiteOsInvoicePdf(invoice = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const business = options.businessProfile && typeof options.businessProfile === "object" ? options.businessProfile : {};
    const attachedDocuments = Array.isArray(options.documents) ? options.documents.filter((item) => item?.document && item?.version) : [];
    const businessName = clean(business.business_name) || "COMMONPL4CE";
    const doc = new PDFDocument({ size: "A4", margin: 54, bufferPages: true, pdfVersion: "1.4", info: {
      Title: `${businessName} factuur ${clean(invoice.invoice_number)}`,
      Author: businessName
    } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.registerFont("Inter", BODY_FONT);
    doc.registerFont("InterBold", BOLD_FONT);
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 54;
    const right = pageWidth - 54;
    const customer = invoice.customer_details && typeof invoice.customer_details === "object" ? invoice.customer_details : {};
    const items = Array.isArray(invoice.line_items) ? invoice.line_items : [];

    function pageBackground() {
      doc.save().rect(0, 0, pageWidth, pageHeight).fill("#0a0a0a");
      doc.roundedRect(36, 36, pageWidth - 72, pageHeight - 72, 4).fill("#eee6d5");
      doc.restore().fillColor("#171717");
    }

    function footer() {
      doc.font("Inter").fontSize(8).fillColor("#6f685d")
        .text("Powered by DONEOVERNIGHT", left, pageHeight - 67, { width: right - left });
      if (clean(business.invoice_footer)) {
        doc.text(clean(business.invoice_footer).slice(0, 240), left, pageHeight - 55, { width: right - left, align: "right" });
      }
    }

    function addPage() {
      doc.addPage({ size: "A4", margin: 54 });
      pageBackground();
      footer();
      doc.font("InterBold").fontSize(9).fillColor("#171717").text(`FACTUUR ${clean(invoice.invoice_number)}`, left, 62);
      return 92;
    }

    function addDocumentPage(label = "DOCUMENT") {
      doc.addPage({ size: "A4", margin: 54 });
      pageBackground();
      footer();
      doc.font("InterBold").fontSize(9).fillColor("#171717").text(label, left, 62);
      return 98;
    }

    pageBackground();
    footer();
    doc.font("InterBold").fontSize(11).text(businessName.toUpperCase(), left, 62);
    doc.fontSize(28).text("Factuur", left, 105);
    doc.font("Inter").fontSize(10).text(clean(invoice.invoice_number), left, 143);
    doc.text(`Factuurdatum: ${clean(invoice.issue_date)}`, left, 166);
    doc.text(`Vervaldatum: ${clean(invoice.due_date)}`, left, 182);
    doc.text(`Status: ${clean(invoice.status).toUpperCase()}`, left, 198);

    doc.font("InterBold").fontSize(9).text("KLANT", 332, 107);
    doc.font("Inter").fontSize(9);
    [invoice.customer_name, invoice.customer_company, invoice.customer_email, customer.address,
      clean(customer.vat_number) ? `BTW: ${clean(customer.vat_number)}` : ""]
      .filter((value) => clean(value))
      .forEach((value) => doc.text(clean(value), 332, doc.y + 5, { width: right - 332 }));

    let y = 252;
    const descriptionWidth = 285;
    const amountX = 420;
    doc.font("InterBold").fontSize(9).text("OMSCHRIJVING", left, y).text("BEDRAG", amountX, y, { width: right - amountX, align: "right" });
    y += 20;

    items.forEach((item) => {
      const description = clean(item.description) || "Regel";
      const lineHeight = Math.max(22, doc.heightOfString(description, { width: descriptionWidth }) + 10);
      if (y + lineHeight > pageHeight - 170) {
        y = addPage();
        doc.font("InterBold").fontSize(9).text("OMSCHRIJVING", left, y).text("BEDRAG", amountX, y, { width: right - amountX, align: "right" });
        y += 20;
      }
      doc.font("Inter").fontSize(9).text(description, left, y, { width: descriptionWidth });
      doc.text(`${Number(item.quantity || 0)} × ${money(item.unit_price_cents, invoice.currency)}`, amountX, y, { width: right - amountX, align: "right" });
      y += lineHeight;
      doc.strokeColor("#c9c0ad").lineWidth(0.5).moveTo(left, y - 5).lineTo(right, y - 5).stroke();
    });

    if (y > pageHeight - 260) y = addPage();
    y += 20;
    const totalsX = 328;
    doc.font("Inter").fontSize(9).text("Subtotaal", totalsX, y).text(money(invoice.subtotal_cents, invoice.currency), amountX, y, { width: right - amountX, align: "right" });
    y += 20;
    doc.text(`BTW (${Number(invoice.vat_rate || 0)}%)`, totalsX, y).text(money(invoice.vat_cents, invoice.currency), amountX, y, { width: right - amountX, align: "right" });
    y += 28;
    doc.font("InterBold").fontSize(12).text("Totaal", totalsX, y).text(money(invoice.total_cents, invoice.currency), amountX, y, { width: right - amountX, align: "right" });
    y += 46;

    if (clean(invoice.notes)) {
      const notesHeight = doc.heightOfString(clean(invoice.notes), { width: right - left });
      if (y + notesHeight > pageHeight - 90) y = addPage();
      doc.font("InterBold").fontSize(9).text("NOTITIES", left, y);
      doc.font("Inter").fontSize(9).text(clean(invoice.notes), left, y + 17, { width: right - left });
    }

    if (attachedDocuments.length) {
      y = addDocumentPage("APPLICABLE DOCUMENTS");
      doc.font("InterBold").fontSize(18).fillColor("#171717").text("Documents included with this invoice", left, y, { width: right - left });
      y = doc.y + 18;
      attachedDocuments.forEach(({ version }) => {
        doc.font("Inter").fontSize(9).fillColor("#272727")
          .text(`${clean(version.title)} · version ${clean(version.version_label || version.version_number)}`, left, y, { width: right - left });
        y = doc.y + 8;
      });

      attachedDocuments.forEach(({ version }) => {
        y = addDocumentPage("INCLUDED DOCUMENT");
        doc.font("InterBold").fontSize(22).fillColor("#171717").text(clean(version.title), left, y, { width: right - left });
        doc.moveDown(0.5);
        doc.font("Inter").fontSize(8).fillColor("#6f685d").text([
          `Version ${clean(version.version_label || version.version_number)}`,
          clean(version.effective_date) ? `Effective ${clean(version.effective_date)}` : ""
        ].filter(Boolean).join(" · "), { width: right - left });
        doc.moveDown(1.5);
        const paragraphs = clean(version.body).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
        paragraphs.forEach((paragraph) => {
          const requiredHeight = doc.heightOfString(paragraph, { width: right - left, lineGap: 3 }) + 15;
          if (doc.y + requiredHeight > pageHeight - 92) {
            addDocumentPage("INCLUDED DOCUMENT");
            doc.y = 96;
          }
          doc.font("Inter").fontSize(9).fillColor("#272727").text(paragraph, { width: right - left, lineGap: 3 });
          doc.moveDown(0.8);
        });
      });
    }

    doc.end();
  });
}

module.exports = { buildWebsiteOsInvoicePdf };
