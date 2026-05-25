const { clean, parseBody, send, supabaseFetch } = require("../lib/ops");

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    const name = clean(input.name);
    const email = clean(input.email).toLowerCase();
    const projectName = clean(input.project_name || input.company || input.projectName) || "Client request";
    const notes = clean(input.notes);
    if (!name || !isValidEmail(email)) {
      return send(res, 400, { success: false, error: "Please enter a valid email address." });
    }

    const payload = {
      name,
      email,
      company: projectName,
      status: "pending",
      source: "client_invite",
      signup_method: "client_invite",
      marketing_consent: false,
      raw_payload: { notes, project_name: projectName, source: "client_invite" },
      created_at: new Date().toISOString()
    };
    let rows;
    try {
      rows = await supabaseFetch("portal_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      rows = await supabaseFetch("portal_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name,
          email,
          status: "pending",
          source: "client_invite",
          signup_method: "client_invite",
          marketing_consent: false,
          created_at: new Date().toISOString()
        })
      });
    }
    return send(res, 200, { success: true, client: Array.isArray(rows) ? rows[0] : rows });
  } catch (error) {
    return send(res, error.statusCode || 500, {
      success: false,
      error: "Could not submit client request",
      code: error.code || "CLIENT_INVITE_FAILED"
    });
  }
};
