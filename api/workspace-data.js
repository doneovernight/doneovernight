const crypto = require("crypto");

const ADMIN_AUTH_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const ADMIN_AUTH_TIMEOUT_MS = 10_000;
const SUPABASE_AUTH_TIMEOUT_MS = 10_000;
const DEFAULT_SESSION_DAYS = 21;

const {
  clean,
  findPortalRequest,
  findPortalRequestByIdentifier,
  findPortalRequestById,
  findTasksForWorkspace,
  getCanonicalAccessKeyForPortalRequest,
  getWorkspaceSessionFromRequest,
  hashWorkspaceToken,
  inferWorkspaceSlug,
  isActiveClient,
  normalizeAccessKey,
  parseBody,
  send,
  slugify,
  supabaseFetch,
  WORKSPACE_SESSION_COOKIE,
  workspaceSessionMatchesRequest
} = require("../lib/ops");

async function verifyAdminKey(adminKey) {
  if (!adminKey) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADMIN_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(ADMIN_AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ admin_key: adminKey }),
      signal: controller.signal
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data?.success === true;
  } finally {
    clearTimeout(timeout);
  }
}

function getRequestOrigin(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "doneovernight.com";
  return `${protocol}://${host}`;
}

function getCleanWorkspacePath(req, slug) {
  const cleanSlug = slugify(slug);
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return host === "portal.doneovernight.com" ? `/@${cleanSlug}` : `/workspace/@${cleanSlug}`;
}

function setWorkspaceCookie(res, token, expiresAt) {
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  res.setHeader("Set-Cookie", [
    `${WORKSPACE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; "));
}

function clearWorkspaceCookie(res) {
  res.setHeader("Set-Cookie", [
    `${WORKSPACE_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; "));
}

function getSupabaseAuthConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase auth is not configured");
    error.statusCode = 503;
    error.code = "SUPABASE_AUTH_NOT_CONFIGURED";
    throw error;
  }
  return { url, serviceRoleKey };
}

async function verifySupabaseAccessToken(accessToken) {
  const token = clean(accessToken);
  if (!token) {
    const error = new Error("Google session is required");
    error.statusCode = 400;
    error.code = "GOOGLE_SESSION_REQUIRED";
    throw error;
  }

  const { url, serviceRoleKey } = getSupabaseAuthConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error("Google session could not be verified");
      error.statusCode = 401;
      error.code = "GOOGLE_SESSION_INVALID";
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePortalRequest(input) {
  const byId = await findPortalRequestById(clean(input.portal_request_id || input.portalRequestId));
  if (byId) return byId;
  return findPortalRequest({
    email: clean(input.email).toLowerCase(),
    slug: slugify(input.workspace_slug || input.slug || "")
  });
}

async function createWorkspaceSession(req, input) {
  const portalRequest = await resolvePortalRequest(input);
  if (!portalRequest || !isActiveClient(portalRequest)) {
    const error = new Error("Workspace client is not active");
    error.statusCode = 404;
    throw error;
  }

  const workspaceSlug = inferWorkspaceSlug(portalRequest);
  if (!workspaceSlug) {
    const error = new Error("Workspace slug could not be resolved");
    error.statusCode = 400;
    throw error;
  }

  const days = Math.min(30, Math.max(1, Number(input.expires_in_days || input.expiresInDays || DEFAULT_SESSION_DAYS)));
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseFetch("workspace_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      portal_request_id: String(portalRequest.id || ""),
      email: clean(portalRequest.email).toLowerCase(),
      workspace_slug: workspaceSlug,
      token_hash: hashWorkspaceToken(rawToken),
      expires_at: expiresAt
    })
  });

  const path = `${getCleanWorkspacePath(req, workspaceSlug)}?token=${encodeURIComponent(rawToken)}`;
  return {
    session: Array.isArray(rows) ? rows[0] : rows,
    link: path,
    absoluteLink: `${getRequestOrigin(req)}${path}`,
    expiresAt,
    workspaceSlug
  };
}

async function redeemWorkspaceSession(req, res, input) {
  const token = clean(input.token);
  if (!token) {
    const error = new Error("Workspace token is required");
    error.statusCode = 400;
    throw error;
  }

  const tokenHash = hashWorkspaceToken(token);
  const now = new Date().toISOString();
  const rows = await supabaseFetch([
    `workspace_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`,
    "revoked_at=is.null",
    `expires_at=gt.${encodeURIComponent(now)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const session = Array.isArray(rows) ? rows[0] : null;
  if (!session) {
    const error = new Error("Workspace link is invalid or expired");
    error.statusCode = 401;
    throw error;
  }

  const portalRequest = await findPortalRequest({
    email: session.email,
    slug: session.workspace_slug
  });
  if (!portalRequest || !isActiveClient(portalRequest)) {
    const error = new Error("Workspace access is pending");
    error.statusCode = 403;
    throw error;
  }

  await supabaseFetch(`workspace_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: now })
  });

  setWorkspaceCookie(res, token, session.expires_at);
  const workspaceSlug = inferWorkspaceSlug(portalRequest) || session.workspace_slug;
  return {
    redirectTo: getCleanWorkspacePath(req, workspaceSlug),
    workspace: {
      slug: workspaceSlug,
      email: portalRequest.email || session.email,
      name: portalRequest.name || "",
      company: portalRequest.company || portalRequest.raw_payload?.project_name || ""
    }
  };
}

async function createWorkspaceSessionForPortalRequest(req, res, portalRequest) {
  const workspaceSlug = inferWorkspaceSlug(portalRequest);
  if (!workspaceSlug) {
    const error = new Error("Workspace slug could not be resolved");
    error.statusCode = 400;
    throw error;
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseFetch("workspace_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      portal_request_id: String(portalRequest.id || ""),
      email: clean(portalRequest.email).toLowerCase(),
      workspace_slug: workspaceSlug,
      token_hash: hashWorkspaceToken(rawToken),
      expires_at: expiresAt
    })
  });

  setWorkspaceCookie(res, rawToken, expiresAt);
  return {
    redirectTo: getCleanWorkspacePath(req, workspaceSlug),
    workspace: {
      slug: workspaceSlug,
      email: portalRequest.email || "",
      name: portalRequest.name || "",
      username: portalRequest.username || "",
      company: portalRequest.company || portalRequest.raw_payload?.project_name || ""
    }
  };
}

async function accessWorkspaceWithKey(req, res, input) {
  const identifier = clean(input.identifier || input.email || input.username || "").toLowerCase().replace(/^@+/, "");
  const accessKey = normalizeAccessKey(input.access_key || input.accessKey);
  if (!identifier || !accessKey) {
    const error = new Error("Workspace identifier and access key are required");
    error.statusCode = 400;
    throw error;
  }

  const portalRequest = await findPortalRequestByIdentifier(identifier);
  const canonicalAccessKey = portalRequest ? await getCanonicalAccessKeyForPortalRequest(portalRequest) : "";

  if (!portalRequest || !isActiveClient(portalRequest) || canonicalAccessKey !== accessKey) {
    const error = new Error("Workspace access could not be verified");
    error.statusCode = 401;
    throw error;
  }

  return createWorkspaceSessionForPortalRequest(req, res, portalRequest);
}

async function accessWorkspaceWithGoogle(req, res, input) {
  const user = await verifySupabaseAccessToken(input.access_token || input.accessToken);
  const email = clean(user.email).toLowerCase();
  if (!email) {
    const error = new Error("Google account email could not be verified");
    error.statusCode = 401;
    error.code = "GOOGLE_EMAIL_REQUIRED";
    throw error;
  }

  const portalRequest = await findPortalRequest({ email });
  if (!portalRequest || !isActiveClient(portalRequest)) {
    const error = new Error("No active workspace found for this account.");
    error.statusCode = 404;
    error.code = "GOOGLE_WORKSPACE_NOT_FOUND";
    throw error;
  }

  return createWorkspaceSessionForPortalRequest(req, res, portalRequest);
}

function normalizeTaskStatus(status = "") {
  const key = clean(status).toLowerCase();
  if (key === "new") return "request_received";
  if (key === "quoted" || key === "quote_sent") return "execution_plan_ready";
  if (key === "paid") return "payment_confirmed";
  return key;
}

function taskId(task = {}) {
  return clean(task.task_id || task.taskId || task.id);
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function formatInvestment(value = "") {
  const cleaned = clean(value);
  if (!cleaned) return "";
  if (/€|eur/i.test(cleaned)) return cleaned;
  const normalized = cleaned.replace(/\s+/g, "");
  if (/^\d+([.,]\d{1,2})?$/.test(normalized)) return `€${normalized}`;
  return cleaned;
}

function projectDisplayTitle(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const explicit = firstClean(
    task.project_title,
    rawPayload.project_title,
    task.execution_plan_title,
    rawPayload.execution_plan_title,
    task.title,
    rawPayload.title
  );
  if (explicit) return explicit;

  const source = clean(
    task.task_summary ||
      task.task_description ||
      rawPayload.task_summary ||
      rawPayload.task_description ||
      rawPayload.submitted_request
  ).toLowerCase();

  if (/landing|landings?page|conversion|conversie/.test(source)) return "Landing Page Optimization";
  if (/crm|hubspot|pipedrive|client|klant/.test(source) && /automation|automatisering|workflow|flow/.test(source)) return "CRM & Automation Build";
  if (/automation|automatisering|onboarding|workflow|flow/.test(source)) return "Automation System Build";
  if (/brand|branding|identity|logo/.test(source)) return "Brand System Build";
  if (/website|site|web/.test(source)) return "Website Conversion Upgrade";
  return "Active Execution Project";
}

function taskTitle(task = {}) {
  return clean(
    task.task_summary ||
      task.task_description ||
      task.taskSummary ||
      task.raw_payload?.task_summary ||
      task.raw_payload?.task_description ||
      task.raw_payload?.submitted_request ||
      "Active project"
  );
}

function isPaidOrActiveTask(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const status = normalizeTaskStatus(task.status || rawPayload.status);
  const paymentStatus = normalizeTaskStatus(task.payment_status || rawPayload.payment_status);
  const workspaceStatus = normalizeTaskStatus(task.workspace_status || rawPayload.workspace_status);
  const projectStatus = normalizeTaskStatus(task.project_status || rawPayload.project_status);
  return ["paid", "payment_confirmed"].includes(paymentStatus) ||
    ["payment_confirmed", "operators_assigned", "workspace_active", "project_active", "execution_active", "queued", "in_progress", "delivery_prep", "delivered", "completed"].includes(status) ||
    ["workspace_active", "active"].includes(workspaceStatus) ||
    ["project_active", "execution_active", "active"].includes(projectStatus) ||
    rawPayload.workspace_active === true;
}

function clientStatus(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const status = normalizeTaskStatus(task.status || rawPayload.status);
  const paymentStatus = normalizeTaskStatus(task.payment_status || rawPayload.payment_status);
  const workspaceActive = rawPayload.workspace_active === true || normalizeTaskStatus(rawPayload.workspace_activation_status) === "active";

  if (status === "completed") return "Completed";
  if (status === "delivered") return "Delivered";
  if (["project_active", "execution_active", "queued", "in_progress", "delivery_prep"].includes(status)) return "Project active";
  if (status === "operators_assigned") return "Execution scheduled";
  if (workspaceActive || paymentStatus === "paid" || paymentStatus === "payment_confirmed" || status === "payment_confirmed") return "Project active";
  if (status === "needs_info" || status === "waiting_for_client_information") return "Waiting for client information";
  if (["execution_plan_ready", "awaiting_start", "awaiting_payment", "payment_returned", "verification_pending"].includes(status)) return "Execution plan ready";
  return "Request received";
}

function currentNextStep(task = {}) {
  const status = clientStatus(task);
  if (status === "Delivered") return "Review the delivered work when it is ready in your workspace.";
  if (status === "Completed") return "This project is complete.";
  if (status === "Execution scheduled") return "DONEOVERNIGHT is preparing the execution pass.";
  if (status === "Project active") return "Execution is underway. This workspace remains synchronized with DONEOVERNIGHT Operations.";
  if (status === "Waiting for client information") return "Reply by email with the requested information.";
  return "DONEOVERNIGHT is reviewing the project details.";
}

function safeInvoices(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const direct = task.invoice_number || rawPayload.invoice_number
    ? [{
        invoice_number: clean(task.invoice_number || rawPayload.invoice_number),
        invoice_amount: clean(task.invoice_amount || rawPayload.invoice_amount),
        invoice_created_at: clean(task.invoice_created_at || rawPayload.invoice_created_at),
        invoice_pdf_url: clean(task.invoice_pdf_url || rawPayload.invoice_pdf_url),
        status: clean(task.invoice_status || rawPayload.invoice_status || "paid")
      }]
    : [];
  const fromRaw = Array.isArray(rawPayload.invoices) ? rawPayload.invoices : [];
  const seen = new Set();
  return [...direct, ...fromRaw].map((invoice) => ({
    invoice_number: clean(invoice.invoice_number),
    invoice_amount: clean(invoice.invoice_amount),
    invoice_created_at: clean(invoice.invoice_created_at),
    invoice_pdf_url: clean(invoice.invoice_pdf_url),
    status: clean(invoice.status || "paid")
  })).filter((invoice) => {
    if (!invoice.invoice_number || seen.has(invoice.invoice_number)) return false;
    seen.add(invoice.invoice_number);
    return true;
  });
}

function safeAssetList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return null;
    return {
      title: clean(item.title || item.label || item.name || item.filename || item.file_name),
      name: clean(item.name || item.filename || item.file_name),
      url: clean(item.url || item.href || item.file_url || item.download_url || item.delivery_link),
      created_at: clean(item.created_at || item.uploaded_at || item.delivered_at || item.timestamp),
      type: clean(item.type || item.file_type || item.mime_type),
      size: clean(item.size || item.file_size)
    };
  }).filter((item) => item && (item.title || item.name || item.url));
}

function lifecycleEventsForTask(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const events = [
    ["Request received", task.created_at || task.createdAt || rawPayload.created_at],
    ["Review started", rawPayload.review_started_at || (["under_review", "review_in_progress"].includes(normalizeTaskStatus(task.status)) ? task.updated_at : "")],
    ["Execution plan sent", rawPayload.execution_plan_sent_at || task.quoted_at],
    ["Payment confirmed", rawPayload.payment_confirmed_at || task.paid_at || rawPayload.paid_at],
    ["Workspace activated", rawPayload.workspace_activated_at || rawPayload.workspace_active_at],
    ["Project started", rawPayload.project_started_at || rawPayload.workspace_activated_at || task.started_at],
    ["Delivery preparing", rawPayload.delivery_preparing_at || (normalizeTaskStatus(task.status) === "delivery_prep" ? task.updated_at : "")],
    ["Delivered", task.delivered_at || rawPayload.delivered_at]
  ];
  return events
    .filter((event) => clean(event[1]))
    .map(([label, timestamp]) => ({ label, timestamp: clean(timestamp) }));
}

function safeUpdatesForTask(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const events = Array.isArray(rawPayload.admin_activity_events) ? rawPayload.admin_activity_events : [];
  const clientFacingPattern = /(payment|workspace|project|started|information|delivery|delivered|message|file|invoice|operator|assigned)/i;
  const blockedPattern = /(execution plan sent|quote|review|webhook|test|debug|token|payment link|bunq|provider)/i;
  const fromAdmin = events.map((event) => ({
    title: clean(event.title || event.message || event.event_type || "Workspace updated"),
    timestamp: clean(event.created_at || event.at || event.timestamp),
    type: clean(event.event_type || event.type || "activity")
  })).filter((event) => {
    if (!event.title || blockedPattern.test(event.title)) return false;
    return clientFacingPattern.test(`${event.title} ${event.type}`);
  });

  const fromLifecycle = lifecycleEventsForTask(task)
    .filter((event) => !["Review started", "Execution plan sent"].includes(event.label))
    .map((event) => ({
      title: event.label,
      timestamp: event.timestamp,
      type: "lifecycle"
    }));

  const seen = new Set();
  return [...fromAdmin, ...fromLifecycle]
    .filter((event) => event.title && event.timestamp)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .filter((event) => {
      const key = `${event.title}:${event.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 7);
}

function safeTaskSnapshot(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  return {
    id: clean(task.id),
    task_id: taskId(task),
    task_summary: taskTitle(task),
    display_title: projectDisplayTitle(task),
    task_description: clean(task.task_description || rawPayload.task_description || rawPayload.submitted_request),
    status: normalizeTaskStatus(task.status || rawPayload.status),
    client_status: clientStatus(task),
    payment_status: normalizeTaskStatus(task.payment_status || rawPayload.payment_status),
    source: clean(task.source || rawPayload.source),
    deadline: clean(task.deadline || rawPayload.deadline),
    created_at: clean(task.created_at || task.createdAt || rawPayload.created_at),
    updated_at: clean(task.updated_at || rawPayload.updated_at),
    quoted_at: clean(task.quoted_at || rawPayload.quoted_at),
    paid_at: clean(task.paid_at || rawPayload.paid_at),
    started_at: clean(task.started_at || rawPayload.started_at),
    delivered_at: clean(task.delivered_at || rawPayload.delivered_at),
    completed_at: clean(task.completed_at || rawPayload.completed_at),
    quote_amount: formatInvestment(firstClean(
      task.quote_amount,
      rawPayload.quote_amount,
      rawPayload.investment_amount,
      rawPayload.investment,
      rawPayload.approved_amount,
      rawPayload.amount_paid,
      task.invoice_amount,
      rawPayload.invoice_amount,
      rawPayload.payment_link_amount,
      rawPayload.payment_amount
    )),
    quote_note: clean(task.quote_note || rawPayload.quote_note || rawPayload.scope_note),
    delivery_eta: clean(task.delivery_eta || rawPayload.delivery_eta || rawPayload.timeline),
    delivery_link: ["delivered", "completed"].includes(normalizeTaskStatus(task.status)) ? clean(task.delivery_link || rawPayload.delivery_link) : "",
    raw_payload: {
      invoices: safeInvoices(task),
      admin_activity_events: safeUpdatesForTask(task),
      workspace_active: rawPayload.workspace_active === true,
      workspace_activation_status: clean(rawPayload.workspace_activation_status),
      workspace_activated_at: clean(rawPayload.workspace_activated_at),
      payment_confirmed_at: clean(rawPayload.payment_confirmed_at),
      execution_plan_sent_at: clean(rawPayload.execution_plan_sent_at),
      client_locale: clean(rawPayload.client_locale || rawPayload.language || rawPayload.preferred_language || rawPayload.lang),
      files: safeAssetList(rawPayload.files),
      uploaded_files: safeAssetList(rawPayload.uploaded_files),
      file_uploads: safeAssetList(rawPayload.file_uploads),
      attachments: safeAssetList(rawPayload.attachments),
      deliverables: safeAssetList(rawPayload.deliverables),
      completed_outputs: safeAssetList(rawPayload.completed_outputs),
      delivery_files: safeAssetList(rawPayload.delivery_files),
      referral_count: clean(rawPayload.referral_count ?? rawPayload.referrals_count ?? rawPayload.referrals),
      referral_conversions: clean(rawPayload.referral_conversions ?? rawPayload.conversions),
      reward_balance: clean(rawPayload.reward_balance ?? rawPayload.referral_reward_balance)
    }
  };
}

function primaryWorkspaceTask(tasks = []) {
  const sorted = [...tasks].sort((a, b) => {
    const aActive = isPaidOrActiveTask(a) ? 1 : 0;
    const bActive = isPaidOrActiveTask(b) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
  });
  return sorted[0] || null;
}

function buildProjectRoom(tasks = []) {
  const primary = primaryWorkspaceTask(tasks);
  if (!primary) {
    return {
      active_project: null,
      lifecycle_events: [],
      latest_updates: [],
      invoices: [],
      delivered_work: [],
      other_requests: []
    };
  }
  const activeProject = safeTaskSnapshot(primary);
  activeProject.current_next_step = currentNextStep(primary);
  return {
    active_project: activeProject,
    lifecycle_events: lifecycleEventsForTask(primary),
    latest_updates: safeUpdatesForTask(primary),
    invoices: safeInvoices(primary),
    delivered_work: ["delivered", "completed"].includes(normalizeTaskStatus(primary.status))
      ? [{
          task_id: taskId(primary),
          title: taskTitle(primary),
          delivered_at: clean(primary.delivered_at || primary.raw_payload?.delivered_at),
          delivery_link: clean(primary.delivery_link || primary.raw_payload?.delivery_link)
        }]
      : [],
    other_requests: tasks
      .filter((task) => taskId(task) !== taskId(primary))
      .slice(0, 6)
      .map(safeTaskSnapshot)
  };
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    if (req.method === "POST") {
      const input = await parseBody(req);
      const action = clean(input.action || "redeem");

      if (action === "create") {
        const authorized = await verifyAdminKey(clean(input.admin_key || input.adminKey || req.headers["x-admin-key"]));
        if (!authorized) return send(res, 401, { success: false, error: "Admin access denied" });
        const result = await createWorkspaceSession(req, input);
        return send(res, 200, { success: true, ...result });
      }

      if (action === "redeem") {
        const result = await redeemWorkspaceSession(req, res, input);
        return send(res, 200, { success: true, ...result });
      }

      if (action === "access") {
        const result = await accessWorkspaceWithKey(req, res, input);
        return send(res, 200, { success: true, ...result });
      }

      if (action === "google_access") {
        const result = await accessWorkspaceWithGoogle(req, res, input);
        return send(res, 200, { success: true, authMethod: "google", ...result });
      }

      if (action === "logout") {
        clearWorkspaceCookie(res);
        return send(res, 200, { success: true, redirectTo: "/portal" });
      }

      return send(res, 400, { success: false, error: "Unsupported workspace session action" });
    }

    const url = new URL(req.url, `https://${req.headers.host || "doneovernight.com"}`);
    const slug = slugify(url.searchParams.get("slug") || "");
    const email = clean(url.searchParams.get("email") || "").toLowerCase();
    const session = await getWorkspaceSessionFromRequest(req);

    if (!session || !workspaceSessionMatchesRequest(session, { email, slug })) {
      return send(res, 401, {
        success: false,
        status: "private",
        error: "Private workspace access required",
        code: "WORKSPACE_SESSION_REQUIRED"
      });
    }

    const portalRequest = await findPortalRequest({
      email: session.email,
      slug: session.workspace_slug
    });

    if (!portalRequest || !isActiveClient(portalRequest)) {
      return send(res, 200, {
        success: false,
        status: portalRequest?.status || "pending",
        error: "Workspace not found or access pending",
        code: "WORKSPACE_ACCESS_PENDING"
      });
    }

    const workspaceSlug = inferWorkspaceSlug(portalRequest);
    const tasks = await findTasksForWorkspace({ email: portalRequest.email, slug: workspaceSlug });
    const safeTasks = (Array.isArray(tasks) ? tasks : []).map(safeTaskSnapshot);
    const projectRoom = buildProjectRoom(tasks);
    return send(res, 200, {
      success: true,
      workspace: {
        id: portalRequest.id || "",
        slug: workspaceSlug,
        name: portalRequest.name || "",
        email: portalRequest.email || "",
        username: portalRequest.username || "",
        company: portalRequest.company || portalRequest.raw_payload?.project_name || "",
        status: portalRequest.status || "active"
      },
      activeProject: projectRoom.active_project,
      projectRoom,
      tasks: safeTasks
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }
    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }
    return send(res, error.statusCode || 500, {
      success: false,
      error: error.statusCode && error.statusCode < 500 ? error.message : "Could not load workspace",
      code: error.code || "WORKSPACE_DATA_FAILED"
    });
  }
};
