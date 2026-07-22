const PDFDocument = require("pdfkit");

const BODY_FONT = require.resolve("@fontsource/inter/files/inter-latin-ext-400-normal.woff");
const BOLD_FONT = require.resolve("@fontsource/inter/files/inter-latin-ext-600-normal.woff");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function documentPdfName(document = {}) {
  const base = clean(document.title || "document")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
  return `${base}-v${clean(document.version_label || document.version_number || "draft")}.pdf`;
}

function buildWebsiteOsDocumentPdf(document = {}, business = {}) {
  return new Promise((resolve, reject) => {
    const businessName = clean(business.business_name) || "COMMONPL4CE";
    const doc = new PDFDocument({
      size: "A4",
      margin: 58,
      bufferPages: true,
      pdfVersion: "1.4",
      info: { Title: clean(document.title), Author: businessName }
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("Inter", BODY_FONT);
    doc.registerFont("InterBold", BOLD_FONT);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 58;
    const contentWidth = pageWidth - 116;

    function decoratePage() {
      doc.save().rect(0, 0, pageWidth, pageHeight).fill("#0a0a0a");
      doc.roundedRect(36, 36, pageWidth - 72, pageHeight - 72, 4).fill("#f2ecde");
      doc.restore();
      doc.font("InterBold").fontSize(9).fillColor("#171717").text(businessName.toUpperCase(), left, 62);
      doc.font("Inter").fontSize(8).fillColor("#716b60").text("Powered by DONEOVERNIGHT", left, pageHeight - 66);
    }

    function addPage() {
      doc.addPage({ size: "A4", margin: 58 });
      decoratePage();
      doc.y = 92;
    }

    decoratePage();
    doc.font("InterBold").fontSize(26).fillColor("#171717").text(clean(document.title), left, 108, { width: contentWidth });
    doc.moveDown(0.6);
    doc.font("Inter").fontSize(9).fillColor("#716b60");
    const meta = [
      `Version ${clean(document.version_label || document.version_number || "draft")}`,
      clean(document.effective_date) ? `Effective ${clean(document.effective_date)}` : "",
      clean(document.language) ? clean(document.language).toUpperCase() : ""
    ].filter(Boolean).join(" · ");
    doc.text(meta, { width: contentWidth });
    doc.moveDown(2);

    const paragraphs = clean(document.body).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (!paragraphs.length) paragraphs.push("No document body has been added yet.");
    paragraphs.forEach((paragraph) => {
      const needed = doc.heightOfString(paragraph, { width: contentWidth, lineGap: 3 }) + 18;
      if (doc.y + needed > pageHeight - 92) addPage();
      doc.font("Inter").fontSize(10).fillColor("#272727").text(paragraph, { width: contentWidth, lineGap: 3 });
      doc.moveDown(1);
    });

    const footer = clean(business.invoice_footer);
    if (footer) {
      if (doc.y + 55 > pageHeight - 92) addPage();
      doc.moveDown(1);
      doc.font("Inter").fontSize(8).fillColor("#716b60").text(footer, { width: contentWidth });
    }
    doc.end();
  });
}

module.exports = { buildWebsiteOsDocumentPdf, documentPdfName };
