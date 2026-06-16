const LOGO_URL = "https://doneovernight.com/brand/doneovernight-white.png";
const DEFAULT_REPLY_TO = "ask@doneovernight.com";
const DEFAULT_FOOTER =
  "Overnight execution for websites, automations, brand systems, funnels, and operational fixes.";

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRows(rows = []) {
  return rows
    .filter(Boolean)
    .map((row) => Array.isArray(row)
      ? { label: clean(row[0]), value: clean(row[1]) }
      : { label: clean(row.label), value: clean(row.value) })
    .filter((row) => row.label && row.value);
}

function buildClientEmail({
  subject,
  preheader,
  title,
  intro,
  rows = [],
  body = [],
  ctaLabel = "",
  ctaUrl = "",
  replyTo = DEFAULT_REPLY_TO,
  footer = DEFAULT_FOOTER
} = {}) {
  const safeSubject = clean(subject) || "DONEOVERNIGHT";
  const safeTitle = clean(title) || safeSubject;
  const safeIntro = clean(intro);
  const safePreheader = clean(preheader) || safeTitle;
  const safeRows = normalizeRows(rows);
  const bodyLines = (Array.isArray(body) ? body : [body]).map(clean).filter(Boolean);
  const safeCtaLabel = clean(ctaLabel);
  const safeCtaUrl = clean(ctaUrl);
  const safeReplyTo = clean(replyTo) || DEFAULT_REPLY_TO;
  const safeFooter = clean(footer) || DEFAULT_FOOTER;

  const detailRows = safeRows.map(({ label, value }) => `
    <tr>
      <td style="padding:8px 0;color:rgba(245,241,234,.54);font-size:12px;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#f5f1ea;font-size:14px;text-align:right">${escapeHtml(value)}</td>
    </tr>
  `).join("");

  const bodyHtml = bodyLines
    .map((line, index) => `<p style="margin:0 0 ${index === bodyLines.length - 1 ? "24px" : "14px"};color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">${escapeHtml(line)}</p>`)
    .join("");

  const text = [
    "DONEOVERNIGHT",
    "",
    safeTitle,
    "",
    ...safeRows.flatMap(({ label, value }) => [`${label}: ${value}`]),
    safeRows.length ? "" : null,
    safeIntro,
    ...bodyLines.flatMap((line) => ["", line]),
    safeCtaUrl && safeCtaLabel ? "" : null,
    safeCtaUrl && safeCtaLabel ? `${safeCtaLabel}: ${safeCtaUrl}` : null,
    "",
    "DONEOVERNIGHT",
    safeFooter
  ].filter((line) => line !== null && line !== "").join("\n");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(safeSubject)}</title>
      </head>
      <body style="margin:0;padding:0;background:#050608;color:#f5f1ea;font-family:Inter,Arial,sans-serif">
        <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0">${escapeHtml(safePreheader)}</div>
        <main style="max-width:560px;margin:0 auto;padding:44px 24px">
          <section style="border:1px solid rgba(233,196,138,.22);border-radius:8px;background:rgba(245,241,234,.035);padding:32px 28px">
            <p style="margin:0 0 24px"><img src="${escapeHtml(LOGO_URL)}" width="168" alt="DONEOVERNIGHT" style="display:block;width:168px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none"></p>
            <h1 style="margin:0 0 18px;color:#f5f1ea;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.12;font-weight:400">${escapeHtml(safeTitle)}</h1>
            ${safeIntro ? `<p style="margin:0 0 22px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">${escapeHtml(safeIntro)}</p>` : ""}
            ${safeRows.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-top:1px solid rgba(245,241,234,.12);border-bottom:1px solid rgba(245,241,234,.12)">${detailRows}</table>` : ""}
            ${bodyHtml}
            ${safeCtaUrl && safeCtaLabel ? `<p style="margin:0 0 24px"><a href="${escapeHtml(safeCtaUrl)}" style="display:inline-block;padding:13px 18px;border:1px solid rgba(233,196,138,.4);border-radius:999px;color:#e9c48a;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(safeCtaLabel)}</a></p>` : ""}
            <p style="margin:0;color:rgba(245,241,234,.58);font-size:13px;line-height:1.7">DONEOVERNIGHT<br>${escapeHtml(safeFooter)}</p>
          </section>
          <p style="margin:18px 0 0;color:rgba(245,241,234,.42);font-size:12px;line-height:1.6">Replies go to ${escapeHtml(safeReplyTo)}.</p>
        </main>
      </body>
    </html>
  `;

  return {
    subject: safeSubject,
    text,
    html,
    safeDetails: Object.fromEntries(safeRows.map(({ label, value }) => [label, value])),
    logoUrl: LOGO_URL
  };
}

module.exports = {
  LOGO_URL,
  buildClientEmail,
  clean,
  escapeHtml
};
