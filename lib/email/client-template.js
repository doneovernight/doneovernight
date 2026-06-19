const LOGO_URL = "https://doneovernight.com/brand/doneovernight-neutral.png";
const LOGO_DARK_URL = "https://doneovernight.com/brand/doneovernight-white.png";
const LOGO_LIGHT_URL = "https://doneovernight.com/brand/doneovernight-black.png";
const DEFAULT_REPLY_TO = "ask@doneovernight.com";
const DEFAULT_FOOTER =
  "DONEOVERNIGHT | Overnight execution for websites, automations, brand systems, funnels, and operational fixes.";

// Permanent rule: all client-facing DONEOVERNIGHT emails must use this renderer.
// Do not create alternate quote, payment, delivery, recovery, or referral email designs.
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

function normalizeList(items = []) {
  return (Array.isArray(items) ? items : [items]).map(clean).filter(Boolean);
}

function renderTextBlock(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function buildClientEmail({
  subject,
  preheader,
  statusLabel = "DONEOVERNIGHT",
  title,
  greetingName = "",
  intro,
  lead = "",
  bullets = [],
  rows = [],
  body = [],
  taskLabel = "DON REFERENCE",
  taskDescription = "",
  showTaskBlock = true,
  attachmentsDisplay = "",
  infoCards = [],
  showInfoCards = true,
  ctaLabel = "",
  ctaUrl = "",
  secondaryCtaLabel = "",
  secondaryCtaUrl = "",
  replyTo = DEFAULT_REPLY_TO,
  footer = DEFAULT_FOOTER,
  footerMeta = ""
} = {}) {
  const safeSubject = clean(subject) || "DONEOVERNIGHT";
  const safeTitle = clean(title) || safeSubject;
  const safeIntro = clean(intro);
  const safeLead = clean(lead);
  const safeStatusLabel = clean(statusLabel) || "DONEOVERNIGHT";
  const safeGreetingName = clean(greetingName);
  const safePreheader = clean(preheader) || safeTitle;
  const safeRows = normalizeRows(rows);
  const safeBullets = normalizeList(bullets);
  const bodyLines = normalizeList(body);
  const safeInfoCards = normalizeRows(infoCards.length ? infoCards : safeRows);
  const safeTaskLabel = clean(taskLabel) || "DON REFERENCE";
  const safeTaskDescription = clean(taskDescription) || safeRows.find((row) => /^reference$/i.test(row.label))?.value || safeSubject;
  const shouldShowTaskBlock = showTaskBlock !== false && Boolean(safeTaskDescription);
  const safeAttachmentsDisplay = clean(attachmentsDisplay);
  const safeCtaLabel = clean(ctaLabel);
  const safeCtaUrl = clean(ctaUrl);
  const safeSecondaryCtaLabel = clean(secondaryCtaLabel);
  const safeSecondaryCtaUrl = clean(secondaryCtaUrl);
  const safeReplyTo = clean(replyTo) || DEFAULT_REPLY_TO;
  const safeFooter = clean(footer) || DEFAULT_FOOTER;
  const safeFooterMeta = clean(footerMeta);

  const bulletHtml = safeBullets.length ? `
                        <ul style="
                          padding-left:22px;
                          margin-top:18px;
                          margin-bottom:0;
                          color:#d0d0d0;
                          line-height:2;
                        ">
                          ${safeBullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                        </ul>` : "";

  const bodyHtml = bodyLines.length ? `
                        <br><br>
                        ${bodyLines.map(renderTextBlock).join("<br><br>")}` : "";

  const attachmentHtml = safeAttachmentsDisplay ? `
                <tr>
                  <td style="padding:24px 52px 0 52px;">
                    <div style="
                      background:#101010;
                      border:1px solid rgba(255,255,255,0.06);
                      border-radius:18px;
                      padding:22px;
                    ">
                      <div style="
                        color:#7d7d7d;
                        font-size:11px;
                        letter-spacing:3px;
                        text-transform:uppercase;
                        margin-bottom:12px;
                        font-weight:600;
                      ">
                        Attachments
                      </div>
                      <div style="
                        color:#ffffff;
                        font-size:15px;
                        line-height:1.8;
                        word-break:break-word;
                      ">
                        ${renderTextBlock(safeAttachmentsDisplay)}
                      </div>
                    </div>
                  </td>
                </tr>` : "";

  const cardOne = safeInfoCards[0] || { label: "Secure Review", value: "Ready" };
  const cardTwo = safeInfoCards[1] || { label: "Review Window", value: "Open" };
  const cardsHtml = showInfoCards === false ? "" : `
                <tr>
                  <td style="padding:32px 52px 0 52px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="50%" style="padding-right:10px;vertical-align:top;">
                          <div style="
                            background:#101010;
                            border:1px solid rgba(255,255,255,0.06);
                            border-radius:18px;
                            padding:22px;
                          ">
                            <div style="
                              color:#7d7d7d;
                              font-size:11px;
                              letter-spacing:3px;
                              text-transform:uppercase;
                              margin-bottom:12px;
                              font-weight:600;
                            ">
                              ${escapeHtml(cardOne.label)}
                            </div>
                            <div style="
                              color:#ffffff;
                              font-size:24px;
                              font-weight:600;
                            ">
                              ${escapeHtml(cardOne.value)}
                            </div>
                          </div>
                        </td>
                        <td width="50%" style="padding-left:10px;vertical-align:top;">
                          <div style="
                            background:#101010;
                            border:1px solid rgba(255,255,255,0.06);
                            border-radius:18px;
                            padding:22px;
                          ">
                            <div style="
                              color:#7d7d7d;
                              font-size:11px;
                              letter-spacing:3px;
                              text-transform:uppercase;
                              margin-bottom:12px;
                              font-weight:600;
                            ">
                              ${escapeHtml(cardTwo.label)}
                            </div>
                            <div style="
                              color:#ffffff;
                              font-size:24px;
                              font-weight:600;
                            ">
                              ${escapeHtml(cardTwo.value)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
  const taskBlockHtml = shouldShowTaskBlock ? `
                <tr>
                  <td style="padding:42px 52px 0 52px;">
                    <div style="
                      border-top:1px solid rgba(255,255,255,0.06);
                      padding-top:36px;
                    ">
                      <div style="
                        color:#7d7d7d;
                        font-size:11px;
                        letter-spacing:4px;
                        text-transform:uppercase;
                        margin-bottom:18px;
                        font-weight:600;
                      ">
                        ${escapeHtml(safeTaskLabel)}
                      </div>
                      <div style="
                        background:#111111;
                        border:1px solid rgba(255,255,255,0.06);
                        border-radius:18px;
                        padding:26px;
                        color:#f5f5f5;
                        font-size:17px;
                        line-height:1.9;
                        white-space:pre-wrap;
                        word-break:break-word;
                      ">
                        ${renderTextBlock(safeTaskDescription)}
                      </div>
                    </div>
                  </td>
                </tr>` : "";

  const text = [
    "DONEOVERNIGHT",
    "",
    safeTitle,
    "",
    safeGreetingName ? `Hi ${safeGreetingName},` : null,
    safeGreetingName ? "" : null,
    safeIntro,
    safeLead ? "" : null,
    safeLead || null,
    safeBullets.length ? "" : null,
    ...safeBullets.map((item) => `- ${item}`),
    shouldShowTaskBlock ? "" : null,
    shouldShowTaskBlock ? `${safeTaskLabel}: ${safeTaskDescription}` : null,
    ...(shouldShowTaskBlock ? safeRows.flatMap(({ label, value }) => [`${label}: ${value}`]) : []),
    shouldShowTaskBlock && safeRows.length ? "" : null,
    ...bodyLines.flatMap((line) => ["", line]),
    safeCtaUrl && safeCtaLabel ? "" : null,
    safeCtaUrl && safeCtaLabel ? `${safeCtaLabel}: ${safeCtaUrl}` : null,
    safeSecondaryCtaUrl && safeSecondaryCtaLabel ? "" : null,
    safeSecondaryCtaUrl && safeSecondaryCtaLabel ? `${safeSecondaryCtaLabel}: ${safeSecondaryCtaUrl}` : null,
    "",
    "DONEOVERNIGHT",
    safeFooterMeta || null,
    safeFooter
  ].filter((line) => line !== null && line !== "").join("\n");

  const html = `
    <html>
      <body style="margin:0;padding:0;background:#050505;font-family:Arial,sans-serif;color:#f5f5f5;">
        <div style="
          display:none;
          max-height:0;
          overflow:hidden;
          opacity:0;
          color:transparent;
          mso-hide:all;
        ">
          ${escapeHtml(safePreheader)}
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="
          background:#050505;
          padding:40px 20px;
        ">
          <tr>
            <td align="center">
              <table width="640" cellpadding="0" cellspacing="0" border="0" style="
                width:640px;
                max-width:640px;
                background:#0b0b0b;
                border:1px solid #1a1a1a;
                border-radius:28px;
                overflow:hidden;
              ">
                <tr>
                  <td align="center" style="
                    padding:52px 42px 20px 42px;
                    background:#0b0b0b;
                  ">
                    <picture>
                      <source srcset="${escapeHtml(LOGO_DARK_URL)}" media="(prefers-color-scheme: dark)" />
                      <source srcset="${escapeHtml(LOGO_LIGHT_URL)}" media="(prefers-color-scheme: light)" />
                      <img
                        src="${escapeHtml(LOGO_URL)}"
                        alt="DONEOVERNIGHT"
                        width="240"
                        style="
                          display:block;
                          width:240px;
                          max-width:100%;
                          height:auto;
                          border:0;
                          outline:none;
                          text-decoration:none;
                          -ms-interpolation-mode:bicubic;
                        "
                      />
                    </picture>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 52px;">
                    <div style="
                      background:#111111;
                      border:1px solid rgba(255,255,255,0.06);
                      border-radius:22px;
                      padding:34px;
                    ">
                      <div style="
                        color:#7ee2b8;
                        font-size:11px;
                        letter-spacing:4px;
                        text-transform:uppercase;
                        margin-bottom:18px;
                        font-weight:600;
                      ">
                        ${escapeHtml(safeStatusLabel)}
                      </div>
                      <div style="
                        font-size:46px;
                        line-height:1.05;
                        font-weight:700;
                        color:#ffffff;
                        letter-spacing:-1px;
                        margin-bottom:22px;
                      ">
                        ${escapeHtml(safeTitle)}
                      </div>
                      <div style="
                        font-size:18px;
                        line-height:1.9;
                        color:#b7b7b7;
                      ">
                        ${safeGreetingName ? `Hi ${escapeHtml(safeGreetingName)},<br><br>` : ""}
                        ${safeIntro ? renderTextBlock(safeIntro) : ""}
                        ${safeLead ? `<br><br>${renderTextBlock(safeLead)}` : ""}
                        ${bodyHtml}
                        ${bulletHtml}
                      </div>
                    </div>
                  </td>
                </tr>
                ${taskBlockHtml}
                ${attachmentHtml}
                ${cardsHtml}
                ${(safeCtaUrl && safeCtaLabel) || (safeSecondaryCtaUrl && safeSecondaryCtaLabel) ? `
                <tr>
                  <td style="padding:42px 52px;">
                    ${safeCtaUrl && safeCtaLabel ? `
                    <a
                      href="${escapeHtml(safeCtaUrl)}"
                      style="
                        display:block;
                        background:#d6b36a;
                        color:#050505;
                        text-decoration:none;
                        text-align:center;
                        padding:20px;
                        border-radius:999px;
                        font-size:14px;
                        font-weight:700;
                        letter-spacing:3px;
                        text-transform:uppercase;
                      "
                    >
                      ${escapeHtml(safeCtaLabel)}
                    </a>
                    ` : ""}
                    ${safeSecondaryCtaUrl && safeSecondaryCtaLabel ? `
                    <a
                      href="${escapeHtml(safeSecondaryCtaUrl)}"
                      style="
                        display:block;
                        color:#d6b36a;
                        text-decoration:none;
                        text-align:center;
                        padding:18px 20px;
                        border-radius:999px;
                        border:1px solid rgba(214,179,106,0.36);
                        font-size:13px;
                        font-weight:700;
                        letter-spacing:3px;
                        text-transform:uppercase;
                        margin-top:${safeCtaUrl && safeCtaLabel ? "14px" : "0"};
                      "
                    >
                      ${escapeHtml(safeSecondaryCtaLabel)}
                    </a>
                    ` : ""}
                  </td>
                </tr>` : ""}
                <tr>
                  <td style="
                    border-top:1px solid rgba(255,255,255,0.06);
                    padding:28px 52px 42px 52px;
                    color:#707070;
                    font-size:12px;
                    line-height:2;
                    letter-spacing:2px;
                    text-transform:uppercase;
                    background:#0b0b0b;
                  ">
                    ${safeFooterMeta ? `${escapeHtml(safeFooterMeta)}<br>` : ""}
                    ${escapeHtml(safeFooter)}<br>
                    Replies go to ${escapeHtml(safeReplyTo)}.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
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
  LOGO_DARK_URL,
  LOGO_LIGHT_URL,
  buildClientEmail,
  clean,
  escapeHtml
};
