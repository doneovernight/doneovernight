const EMAIL_TIMEOUT_MS = 8_000;
const DEFAULT_INTERNAL_TO = "donovan.vdp@gmail.com";
const DEFAULT_FROM = "COMMONPL4CE powered by DONEOVERNIGHT <ask@doneovernight.com>";
const DEFAULT_REPLY_TO = "ask@doneovernight.com";
const DEFAULT_SITE_ORIGIN = "https://doneovernight.com";

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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getResendConfig(env = process.env) {
  const apiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.CP_BOOKING_FROM || env.TASK_CONFIRMATION_FROM) || DEFAULT_FROM;
  const replyTo = clean(env.CP_BOOKING_REPLY_TO) || DEFAULT_REPLY_TO;
  const internalTo = clean(env.CP_BOOKING_TO) || DEFAULT_INTERNAL_TO;

  return {
    configured: Boolean(apiKey && from),
    apiKey,
    from,
    replyTo,
    internalTo,
    missing: [
      apiKey ? "" : "RESEND_API_KEY",
      from ? "" : "CP_BOOKING_FROM or TASK_CONFIRMATION_FROM"
    ].filter(Boolean)
  };
}

function isProduction(env = process.env) {
  return clean(env.NODE_ENV).toLowerCase() === "production";
}

function resolveSiteOrigin(req) {
  const configured = clean(process.env.CP_SITE_ORIGIN || process.env.SITE_URL || process.env.PUBLIC_SITE_URL);
  if (configured) return configured.replace(/\/+$/, "");

  const host = clean(req?.headers?.host);
  if (host && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(host)) return `https://${host}`;
  return DEFAULT_SITE_ORIGIN;
}

function assetUrl(origin, path) {
  return `${origin}${path}`;
}

function normalizeBooking(input = {}) {
  return {
    name: clean(input.name),
    brandCompany: clean(input.brandCompany || input.brand || input.company),
    email: clean(input.email).toLowerCase(),
    instagram: clean(input.instagram),
    projectType: clean(input.projectType || input.project),
    location: clean(input.location),
    preferredDate: clean(input.preferredDate || input["preferred-date"]),
    budgetRange: clean(input.budgetRange || input.budget),
    notes: clean(input.notes || input.references),
    source: "cp-booker-station",
    submittedAt: clean(input.submittedAt) || new Date().toISOString()
  };
}

function validateBooking(booking) {
  const missing = [];
  [
    ["name", "Name"],
    ["brandCompany", "Brand / company"],
    ["email", "Email"],
    ["projectType", "Project type"],
    ["location", "Location"],
    ["preferredDate", "Preferred date"],
    ["budgetRange", "Budget range"]
  ].forEach(([key, label]) => {
    if (!clean(booking[key])) missing.push(label);
  });

  if (missing.length) {
    return { valid: false, status: 400, error: `Missing required fields: ${missing.join(", ")}.` };
  }

  if (!isValidEmail(booking.email)) {
    return { valid: false, status: 400, error: "Enter a valid email address." };
  }

  return { valid: true };
}

function formatValue(value, fallback = "Not provided") {
  return clean(value) || fallback;
}

function formatBudget(value) {
  const raw = clean(value);
  if (!raw) return "Not provided";
  if (/^€/.test(raw)) return raw;
  const number = raw.replace(/\D/g, "");
  if (!number) return raw;
  return `€${Number(number).toLocaleString("nl-NL")}+`;
}

function detailRows(booking) {
  return [
    ["Name", booking.name],
    ["Brand / company", booking.brandCompany],
    ["Email", booking.email],
    ["Instagram", booking.instagram],
    ["Project type", booking.projectType],
    ["Location", booking.location],
    ["Preferred date", booking.preferredDate],
    ["Budget range", formatBudget(booking.budgetRange)],
    ["References / mood / notes", booking.notes],
    ["Submitted", booking.submittedAt],
    ["Source", booking.source]
  ];
}

function renderRows(rows) {
  return rows
    .filter(([, value]) => clean(value))
    .map(([label, value]) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.12);color:#8d8d8d;font-size:11px;letter-spacing:2px;text-transform:uppercase;vertical-align:top;width:38%;">${escapeHtml(label)}</td>
        <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.12);color:#f6f1e8;font-size:14px;line-height:1.55;vertical-align:top;">${escapeHtml(value)}</td>
      </tr>
    `).join("");
}

function renderPhotoStrip(origin) {
  const images = [
    assetUrl(origin, "/assets/common-place/fullscreen/slide-01-opening.jpg"),
    assetUrl(origin, "/assets/common-place/fullscreen/slide-02-yellow.jpg"),
    assetUrl(origin, "/assets/common-place/fullscreen/slide-05-duo.jpg")
  ];

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:34px;">
      <tr>
        ${images.map((src) => `
          <td width="33.333%" style="padding-right:6px;vertical-align:top;">
            <img src="${src}" alt="" width="168" style="display:block;width:100%;height:180px;object-fit:cover;border:0;">
          </td>
        `).join("")}
      </tr>
    </table>
  `;
}

function buildEmailShell({ origin, preview, children }) {
  const logoUrl = assetUrl(origin, "/assets/common-place/final/wordmark.png");
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(preview)}</title>
    </head>
    <body style="margin:0;background:#080806;color:#f6f1e8;font-family:Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preview)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#080806;">
        <tr>
          <td align="center" style="padding:34px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:620px;">
              <tr>
                <td style="padding:0 0 34px;">
                  <img src="${logoUrl}" alt="COMMONPL4CE" width="260" style="display:block;width:260px;max-width:72%;height:auto;border:0;">
                </td>
              </tr>
              ${children}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function buildClientEmail(booking, origin) {
  const rows = [
    ["Project type", booking.projectType],
    ["Brand / company", booking.brandCompany],
    ["Location", booking.location],
    ["Preferred date", booking.preferredDate],
    ["Budget range", formatBudget(booking.budgetRange)],
    booking.notes ? ["References / mood / notes", booking.notes] : null
  ].filter(Boolean);

  const html = buildEmailShell({
    origin,
    preview: "COMMONPL4CE booking request received.",
    children: `
      <tr>
        <td style="padding:0 0 18px;color:#8d8d8d;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Request received</td>
      </tr>
      <tr>
        <td style="padding:0 0 18px;color:#f6f1e8;font-family:Georgia,serif;font-size:31px;line-height:1.08;">COMMONPL4CE booking request received</td>
      </tr>
      <tr>
        <td style="padding:0 0 26px;color:#c9c1b4;font-size:15px;line-height:1.75;">
          Hi ${escapeHtml(booking.name)},<br><br>
          Your request has been received. We&rsquo;ll review the project details and get back to you with availability, direction and next steps as soon as possible.
          This is a request confirmation, not a confirmed shoot booking.
        </td>
      </tr>
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            ${renderRows(rows)}
          </table>
          ${renderPhotoStrip(origin)}
        </td>
      </tr>
    `
  });

  const text = [
    "COMMONPL4CE",
    "",
    "COMMONPL4CE booking request received",
    "",
    `Hi ${booking.name},`,
    "",
    "Your request has been received. We'll review the project details and get back to you with availability, direction and next steps as soon as possible.",
    "This is a request confirmation, not a confirmed shoot booking.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`)
  ].join("\n");

  return {
    to: booking.email,
    subject: "COMMONPL4CE booking request received",
    html,
    text
  };
}

function buildInternalEmail(booking, origin, internalTo = DEFAULT_INTERNAL_TO) {
  const subjectName = booking.brandCompany || booking.name;
  const testRoutingHtml = `
      <tr>
        <td style="padding:0 0 22px;">
          <div style="border:1px solid rgba(255,255,255,.22);padding:14px 16px;color:#f6f1e8;font-size:12px;line-height:1.6;letter-spacing:1.8px;text-transform:uppercase;">
            <strong>TEST ROUTING ACTIVE</strong><br>
            Destination: ${escapeHtml(internalTo)}
          </div>
        </td>
      </tr>
    `;
  const html = buildEmailShell({
    origin,
    preview: `New COMMONPL4CE booking request — ${subjectName}`,
    children: `
      ${testRoutingHtml}
      <tr>
        <td style="padding:0 0 18px;color:#8d8d8d;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">New booking request</td>
      </tr>
      <tr>
        <td style="padding:0 0 26px;color:#f6f1e8;font-family:Georgia,serif;font-size:30px;line-height:1.08;">${escapeHtml(subjectName)}</td>
      </tr>
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
            ${renderRows(detailRows(booking))}
          </table>
        </td>
      </tr>
    `
  });

  const text = [
    "COMMONPL4CE",
    "",
    "TEST ROUTING ACTIVE",
    `Destination: ${internalTo}`,
    "",
    `New COMMONPL4CE booking request — ${subjectName}`,
    "",
    ...detailRows(booking).map(([label, value]) => `${label}: ${formatValue(value)}`)
  ].join("\n");

  return {
    to: internalTo,
    subject: `New COMMONPL4CE booking request — ${subjectName}`,
    html,
    text
  };
}

async function sendResendEmail(email, config, tags = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        reply_to: email.replyTo || config.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        tags
      })
    });

    const responseText = await response.text().catch(() => "");
    let responseJson = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      responseJson = null;
    }

    if (!response.ok) {
      const error = new Error(responseJson?.message || responseJson?.name || "RESEND_EMAIL_FAILED");
      error.statusCode = response.status;
      throw error;
    }

    return { sent: true, id: responseJson?.id || null };
  } finally {
    clearTimeout(timeout);
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (error) {
      return Promise.resolve(null);
    }
  }

  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 50_000) {
        raw = "";
        req.destroy();
        resolve(null);
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  const input = await parseBody(req);
  if (!input) {
    return send(res, 400, { success: false, error: "Invalid JSON payload." });
  }

  const booking = normalizeBooking(input);
  const validation = validateBooking(booking);
  if (!validation.valid) {
    return send(res, validation.status, { success: false, error: validation.error });
  }

  const config = getResendConfig();
  const origin = resolveSiteOrigin(req);
  const clientEmail = buildClientEmail(booking, origin);
  const internalEmail = buildInternalEmail(booking, origin, config.internalTo);
  internalEmail.replyTo = booking.email || config.replyTo;

  if (!config.configured) {
    if (!isProduction()) {
      console.info("CP booking preview mode", {
        source: booking.source,
        submittedAt: booking.submittedAt,
        client: {
          to: clientEmail.to,
          subject: clientEmail.subject
        },
        internal: {
          to: internalEmail.to,
          subject: internalEmail.subject,
          replyTo: internalEmail.replyTo
        },
        missing: config.missing
      });

      return send(res, 200, {
        success: true,
        previewMode: true,
        booking: { source: booking.source, submittedAt: booking.submittedAt },
        emails: {
          client: "preview",
          internal: "preview"
        },
        preview: {
          client: {
            to: clientEmail.to,
            subject: clientEmail.subject
          },
          internal: {
            to: internalEmail.to,
            subject: internalEmail.subject,
            replyTo: internalEmail.replyTo
          }
        }
      });
    }

    return send(res, 503, {
      success: false,
      error: "Email service is not configured.",
      missing: config.missing
    });
  }

  try {
    const [clientResult, internalResult] = await Promise.all([
      sendResendEmail(clientEmail, config, [
        { name: "category", value: "cp_client_confirmation" },
        { name: "source", value: booking.source }
      ]),
      sendResendEmail(internalEmail, config, [
        { name: "category", value: "cp_internal_notification" },
        { name: "source", value: booking.source }
      ])
    ]);

    return send(res, 200, {
      success: true,
      booking: { source: booking.source, submittedAt: booking.submittedAt },
      emails: { client: clientResult.sent, internal: internalResult.sent }
    });
  } catch (error) {
    console.error("CP booking email failed", error);
    return send(res, error.statusCode || 502, {
      success: false,
      error: "Request could not be sent. Please try again."
    });
  }
};
