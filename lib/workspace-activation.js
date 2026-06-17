const crypto = require("crypto");

const {
  clean,
  inferWorkspaceSlug,
  normalizeEmail,
  slugify,
  supabaseFetch,
  syncAccessKeyCredential
} = require("./ops");
const { createInvoiceForPayment } = require("./invoices");
const { sendPaymentConfirmationEmail } = require("./email/payment-confirmation-email");

const WORKSPACE_SESSION_DAYS = 21;

function normalizeMoney(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).replace(/[^\d]/g, "");
}

function generateAccessKey() {
  return `DONE-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function hashWorkspaceToken(token) {
  return crypto.createHash("sha256").update(clean(token)).digest("hex");
}

function hasActivationSecret() {
  return Boolean(clean(process.env.WORKSPACE_ACTIVATION_SECRET || process.env.PAYMENT_CONFIRMATION_SECRET));
}

function getExpectedSecret() {
  return clean(process.env.WORKSPACE_ACTIVATION_SECRET || process.env.PAYMENT_CONFIRMATION_SECRET);
}

function getProvidedSecret(req, input = {}) {
  const auth = clean(req.headers.authorization || "");
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return clean(
    input.workspace_activation_secret ||
    input.payment_confirmation_secret ||
    input.webhook_secret ||
    req.headers["x-workspace-activation-secret"] ||
    req.headers["x-payment-confirmation-secret"] ||
    bearer
  );
}

function verifyActivationSecret(req, input = {}) {
  const expected = getExpectedSecret();
  if (!expected) {
    const error = new Error("Workspace activation secret is not configured");
    error.statusCode = 503;
    error.code = "WORKSPACE_ACTIVATION_SECRET_NOT_CONFIGURED";
    throw error;
  }
  const provided = getProvidedSecret(req, input);
  if (!provided || provided !== expected) {
    const error = new Error("Workspace activation is not authorized");
    error.statusCode = 401;
    error.code = "WORKSPACE_ACTIVATION_UNAUTHORIZED";
    throw error;
  }
}

function buildTaskFilter(taskId) {
  return `task_id=eq.${encodeURIComponent(taskId)}`;
}

async function loadTask(taskId) {
  const rows = await supabaseFetch([
    `task_requests?${buildTaskFilter(taskId)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : null;
}

function expectedPaymentAmount(task = {}) {
  return normalizeMoney(
    task.payment_link_amount ||
    task.raw_payload?.payment_link_amount ||
    task.quote_amount ||
    task.raw_payload?.quote_amount ||
    task.raw_payload?.investment_amount
  );
}

function validatePaymentConfirmation(task = {}, input = {}) {
  const taskId = clean(task.task_id || task.taskId || task.id);
  const paymentReference = clean(input.payment_reference || input.paymentReference || input.reference);
  const amountPaid = normalizeMoney(input.amount_paid || input.amountPaid || input.amount || input.paid_amount);
  const expectedAmount = expectedPaymentAmount(task);

  if (!paymentReference) {
    const error = new Error("Payment reference is required");
    error.statusCode = 400;
    error.code = "PAYMENT_REFERENCE_REQUIRED";
    throw error;
  }
  if (!amountPaid) {
    const error = new Error("Amount paid is required");
    error.statusCode = 400;
    error.code = "PAYMENT_AMOUNT_REQUIRED";
    throw error;
  }
  if (!paymentReference.toLowerCase().includes(taskId.toLowerCase())) {
    const error = new Error("Payment reference does not match task");
    error.statusCode = 409;
    error.code = "PAYMENT_REFERENCE_MISMATCH";
    throw error;
  }
  if (expectedAmount && amountPaid !== expectedAmount) {
    const error = new Error("Payment amount does not match execution plan");
    error.statusCode = 409;
    error.code = "PAYMENT_AMOUNT_MISMATCH";
    error.expectedAmount = expectedAmount;
    error.amountPaid = amountPaid;
    throw error;
  }

  return {
    paymentReference,
    amountPaid,
    expectedAmount
  };
}

function isTaskAlreadyActivated(task = {}) {
  const status = clean(task.status).toLowerCase();
  const paymentStatus = clean(task.payment_status).toLowerCase();
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};

  return Boolean(
    ["workspace_active", "project_active", "execution_active"].includes(status) &&
    ["payment_confirmed", "paid"].includes(paymentStatus) &&
    clean(rawPayload.workspace_activated_at)
  );
}

function workspaceSlugForTask(task = {}, email = "") {
  return slugify(
    task.raw_payload?.workspace_slug ||
    task.workspace_slug ||
    task.name ||
    task.raw_payload?.name ||
    email
  );
}

function projectTitleForTask(task = {}) {
  return clean(
    task.quote_note ||
    task.raw_payload?.quote_note ||
    task.task_summary ||
    task.task_description ||
    task.raw_payload?.task_summary ||
    task.raw_payload?.task_description ||
    task.task_id
  );
}

function mergeRawPayload(rawPayload = {}, patch = {}) {
  const current = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  return {
    ...current,
    ...patch
  };
}

function upsertByKey(items = [], nextItem = {}, keyName = "task_id") {
  const key = clean(nextItem[keyName]);
  return [
    nextItem,
    ...items.filter((item) => clean(item[keyName]) !== key)
  ].slice(0, 50);
}

function upsertProject(rawPayload = {}, project = {}) {
  const current = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const projects = Array.isArray(current.projects) ? current.projects : [];
  return {
    ...current,
    projects: upsertByKey(projects, project, "task_id")
  };
}

function upsertInvoice(rawPayload = {}, invoice = {}) {
  const current = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const invoices = Array.isArray(current.invoices) ? current.invoices : [];
  return {
    ...current,
    invoices: upsertByKey(invoices, invoice, "invoice_number")
  };
}

function isClientWorkspaceRecord(record = {}) {
  const source = clean(record.source || record.raw_payload?.source).toLowerCase();
  const signupMethod = clean(record.signup_method || record.raw_payload?.signup_method).toLowerCase();
  return source !== "operator_apply" && signupMethod !== "operator_apply" && !source.startsWith("operator_");
}

async function findClientWorkspaceByEmail(email = "") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const rows = await supabaseFetch([
    `portal_requests?email=eq.${encodeURIComponent(normalizedEmail)}`,
    "select=*",
    "order=created_at.desc",
    "limit=20"
  ].join("&"));
  return (Array.isArray(rows) ? rows : []).find(isClientWorkspaceRecord) || null;
}

function invoiceSummary(invoice = {}) {
  if (!invoice?.invoice_number) return null;
  return {
    invoice_number: clean(invoice.invoice_number),
    invoice_pdf_url: clean(invoice.invoice_pdf_url),
    invoice_created_at: clean(invoice.invoice_created_at),
    invoice_amount: clean(invoice.invoice_amount),
    currency: clean(invoice.currency) || "EUR",
    payment_reference: clean(invoice.payment_reference),
    task_id: clean(invoice.task_id),
    status: "paid"
  };
}

async function patchWorkspaceInvoice(workspace = {}, invoice = {}) {
  const summary = invoiceSummary(invoice);
  if (!workspace?.id || !summary) return null;
  const rawPayload = upsertInvoice(workspace.raw_payload, summary);
  const rows = await supabaseFetch(`portal_requests?id=eq.${encodeURIComponent(workspace.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      raw_payload: rawPayload,
      updated_at: new Date().toISOString()
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function findOrCreateWorkspace(task = {}, input = {}) {
  const email = normalizeEmail(input.client_email || input.email || task.email || task.raw_payload?.email);
  if (!email) {
    const error = new Error("Client email is required");
    error.statusCode = 400;
    error.code = "CLIENT_EMAIL_REQUIRED";
    throw error;
  }

  const now = new Date().toISOString();
  const existing = await findClientWorkspaceByEmail(email);
  const accessKey = clean(existing?.access_key) || generateAccessKey();
  const workspaceSlug = inferWorkspaceSlug(existing || {}) || workspaceSlugForTask(task, email);
  const taskId = clean(task.task_id || task.taskId || task.id);
  const project = {
    task_id: taskId,
    title: projectTitleForTask(task),
    status: "project_active",
    payment_status: "payment_confirmed",
    activated_at: now
  };

  if (existing?.id) {
    const updatedRawPayload = upsertProject(existing.raw_payload, project);
    const rows = await supabaseFetch(`portal_requests?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: existing.name || task.name || task.raw_payload?.name || "",
        company: existing.company || task.company || task.raw_payload?.company || "",
        workspace_slug: workspaceSlug,
        access_key: accessKey,
        credentials_issued_at: existing.credentials_issued_at || now,
        status: "active",
        intake_task_id: existing.intake_task_id || taskId,
        raw_payload: updatedRawPayload,
        updated_at: now
      })
    });
    const workspace = Array.isArray(rows) ? rows[0] : rows;
    await syncAccessKeyCredential(workspace, accessKey).catch(() => null);
    return {
      workspace,
      workspaceSlug,
      accessKey,
      reused: true,
      project
    };
  }

  const rawPayload = upsertProject({
    task_id: taskId,
    source: "workspace_activation",
    workspace_slug: workspaceSlug
  }, project);
  const rows = await supabaseFetch("portal_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      email,
      name: clean(task.name || task.raw_payload?.name),
      username: workspaceSlug,
      company: clean(task.company || task.raw_payload?.company),
      workspace_slug: workspaceSlug,
      access_key: accessKey,
      credentials_issued_at: now,
      status: "active",
      source: "payment_activation",
      signup_method: "payment_confirmation",
      marketing_consent: false,
      intake_task_id: taskId,
      raw_payload: rawPayload,
      created_at: now,
      updated_at: now
    })
  });
  const workspace = Array.isArray(rows) ? rows[0] : rows;
  await syncAccessKeyCredential(workspace, accessKey).catch(() => null);
  return {
    workspace,
    workspaceSlug,
    accessKey,
    reused: false,
    project
  };
}

async function createWorkspaceSession(workspace = {}, workspaceSlug = "") {
  const email = normalizeEmail(workspace.email);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + WORKSPACE_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseFetch("workspace_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      portal_request_id: String(workspace.id || ""),
      email,
      workspace_slug: workspaceSlug,
      token_hash: hashWorkspaceToken(rawToken),
      expires_at: expiresAt
    })
  });
  return {
    token: rawToken,
    expiresAt,
    path: `/workspace/@${workspaceSlug}?token=${encodeURIComponent(rawToken)}`,
    url: `https://portal.doneovernight.com/workspace/@${workspaceSlug}?token=${encodeURIComponent(rawToken)}`
  };
}

async function patchTaskActivation(task = {}, activation = {}) {
  const now = new Date().toISOString();
  const taskId = clean(task.task_id || task.taskId || task.id);
  let rawPayload = mergeRawPayload(task.raw_payload, {
    payment_confirmed_at: activation.paymentConfirmedAt || now,
    payment_reference: activation.paymentReference,
    amount_paid: activation.amountPaid,
    workspace_activated_at: now,
    workspace_status: "workspace_active",
    project_status: "project_active",
    project_active_at: now,
    workspace_slug: activation.workspaceSlug,
    workspace_id: activation.workspaceId,
    workspace_reused: activation.workspaceReused,
    activation_event: "payment_confirmed_workspace_active"
  });
  const invoice = invoiceSummary(activation.invoice);
  if (invoice) {
    rawPayload = upsertInvoice(rawPayload, invoice);
    rawPayload = mergeRawPayload(rawPayload, {
      invoice_number: invoice.invoice_number,
      invoice_pdf_url: invoice.invoice_pdf_url,
      invoice_created_at: invoice.invoice_created_at,
      invoice_amount: invoice.invoice_amount,
      invoice_status: "paid"
    });
  }
  const fullPatch = {
    status: "workspace_active",
    payment_status: "payment_confirmed",
    paid_at: activation.paymentConfirmedAt || now,
    started_at: now,
    workspace_status: "workspace_active",
    raw_payload: rawPayload,
    updated_at: now
  };

  const attempts = [
    fullPatch,
    {
      status: fullPatch.status,
      payment_status: fullPatch.payment_status,
      paid_at: fullPatch.paid_at,
      started_at: fullPatch.started_at,
      raw_payload: rawPayload,
      updated_at: now
    },
    {
      status: fullPatch.status,
      payment_status: fullPatch.payment_status,
      raw_payload: rawPayload,
      updated_at: now
    }
  ];

  let lastError;
  for (const patch of attempts) {
    try {
      const rows = await supabaseFetch(`task_requests?task_id=eq.${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch)
      });
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function createWorkspaceActivityEvents({ task, workspaceSlug, email, paymentReference, amountPaid, invoice, paymentEmail }) {
  const taskId = clean(task.task_id || task.taskId || task.id);
  const events = [
    {
      title: "Payment confirmed",
      message: `Payment confirmed for ${taskId}.`,
      event_type: "payment_confirmed"
    },
    invoice?.invoice_number ? {
      title: "Invoice generated",
      message: `Invoice ${invoice.invoice_number} generated for ${taskId}.`,
      event_type: "invoice_generated"
    } : null,
    paymentEmail?.delivered && invoice?.invoice_number ? {
      title: "Invoice delivered",
      message: `Invoice ${invoice.invoice_number} delivered to the client.`,
      event_type: "invoice_delivered"
    } : null,
    {
      title: "Workspace activated",
      message: `Workspace activated for ${taskId}.`,
      event_type: "workspace_activated"
    },
    {
      title: "Project started",
      message: `Project started for ${taskId}.`,
      event_type: "project_started"
    }
  ].filter(Boolean);

  const results = [];
  for (const event of events) {
    const metadata = {
      payment_reference: paymentReference,
      amount_paid: amountPaid,
      invoice_number: invoice?.invoice_number || "",
      invoice_pdf_url: invoice?.invoice_pdf_url || "",
      activation_source: "payment_confirmation"
    };
    const messagePayload = {
      workspace_slug: workspaceSlug,
      task_id: taskId,
      email,
      author_role: "system",
      message_type: event.event_type,
      message: event.message,
      metadata
    };
    const updateEventPayload = {
      workspace_slug: workspaceSlug,
      task_id: taskId,
      record_table: "workspace_messages",
      event_type: event.event_type,
      title: event.title,
      metadata
    };
    const messageResult = await supabaseFetch("workspace_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(messagePayload)
    }).then((rows) => ({ ok: true, table: "workspace_messages", row: Array.isArray(rows) ? rows[0] : rows }))
      .catch((error) => ({ ok: false, table: "workspace_messages", reason: error.code || error.message }));
    results.push(messageResult);

    const realtimeResult = await supabaseFetch("workspace_update_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(updateEventPayload)
    }).then(() => ({ ok: true, table: "workspace_update_events" }))
      .catch((error) => ({ ok: false, table: "workspace_update_events", reason: error.code || error.message }));
    results.push(realtimeResult);
  }

  return results;
}

async function activateWorkspace(req, input = {}) {
  verifyActivationSecret(req, input);

  const taskId = clean(input.task_id || input.taskId || input.operational_id);
  if (!taskId) {
    const error = new Error("Task id is required");
    error.statusCode = 400;
    error.code = "TASK_ID_REQUIRED";
    throw error;
  }

  const task = await loadTask(taskId);
  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    error.code = "TASK_NOT_FOUND";
    throw error;
  }

  const email = normalizeEmail(input.client_email || input.email || task.email || task.raw_payload?.email);
  const payment = validatePaymentConfirmation(task, input);
  const now = new Date().toISOString();
  const alreadyActive = isTaskAlreadyActivated(task);

  const workspaceActivation = await findOrCreateWorkspace(task, { ...input, client_email: email });
  if (alreadyActive) {
    return {
      task,
      taskId,
      workspace: workspaceActivation.workspace,
      workspaceSlug: workspaceActivation.workspaceSlug,
      workspaceReused: true,
      project: workspaceActivation.project,
      session: {
        token: "",
        expiresAt: "",
        path: `/workspace/@${workspaceActivation.workspaceSlug}`,
        url: `https://portal.doneovernight.com/workspace/@${workspaceActivation.workspaceSlug}`
      },
      payment,
      alreadyActive: true,
      activityEvents: [],
      activationEmail: {
        configured: false,
        sent: false,
        delivered: false,
        reason: "already_active",
        provider: "none"
      }
    };
  }

  const session = await createWorkspaceSession(workspaceActivation.workspace, workspaceActivation.workspaceSlug);
  const invoiceResult = await createInvoiceForPayment({
    task,
    workspace: workspaceActivation.workspace,
    payment,
    workspaceUrl: session.url
  });
  if (invoiceResult.invoice?.invoice_number) {
    const patchedWorkspace = await patchWorkspaceInvoice(workspaceActivation.workspace, invoiceResult.invoice)
      .catch(() => null);
    if (patchedWorkspace) workspaceActivation.workspace = patchedWorkspace;
  }
  const updatedTask = await patchTaskActivation(task, {
    paymentReference: payment.paymentReference,
    amountPaid: payment.amountPaid,
    paymentConfirmedAt: now,
    workspaceSlug: workspaceActivation.workspaceSlug,
    workspaceId: workspaceActivation.workspace?.id || "",
    workspaceReused: workspaceActivation.reused,
    invoice: invoiceResult.invoice
  });

  const paymentEmail = await sendPaymentConfirmationEmail(updatedTask, {
    email,
    name: workspaceActivation.workspace?.name || updatedTask.name || "",
    workspace_url: session.url
  }, invoiceResult).catch((error) => ({
    configured: false,
    sent: false,
    delivered: false,
    reason: "failed",
    provider: "none",
    error: error.code || "PAYMENT_CONFIRMATION_EMAIL_FAILED"
  }));

  const activityEvents = await createWorkspaceActivityEvents({
    task: updatedTask,
    workspaceSlug: workspaceActivation.workspaceSlug,
    email,
    paymentReference: payment.paymentReference,
    amountPaid: payment.amountPaid,
    invoice: invoiceResult.invoice,
    paymentEmail
  });

  return {
    task: updatedTask,
    taskId,
    workspace: workspaceActivation.workspace,
    workspaceSlug: workspaceActivation.workspaceSlug,
    workspaceReused: workspaceActivation.reused,
    project: workspaceActivation.project,
    session,
    payment,
    invoice: invoiceResult,
    alreadyActive,
    activityEvents,
    paymentEmail,
    activationEmail: paymentEmail
  };
}

function buildWorkspaceActivationResponse(result) {
  return {
    success: true,
    task_id: result.taskId,
    status: "workspace_active",
    payment_status: "payment_confirmed",
    workspace: {
      id: result.workspace?.id || "",
      slug: result.workspaceSlug,
      reused: result.workspaceReused,
      status: result.workspace?.status || "active"
    },
    project: result.project,
    workspace_url: result.session.url,
    invoice: {
      configured: result.invoice?.configured !== false,
      created: result.invoice?.created === true,
      reused: result.invoice?.reused === true,
      invoice_number: result.invoice?.invoice?.invoice_number || "",
      invoice_pdf_url: result.invoice?.invoice?.invoice_pdf_url || "",
      attachment: result.invoice?.attachment?.filename || ""
    },
    paymentEmail: result.paymentEmail,
    activationEmail: result.activationEmail,
    activity: {
      attempted: result.activityEvents.length,
      stored: result.activityEvents.filter((event) => event.ok).length,
      events: result.activityEvents.map((event) => ({
        table: event.table,
        ok: event.ok,
        reason: event.reason || ""
      }))
    },
    idempotent: result.alreadyActive
  };
}

function buildWorkspaceActivationError(error) {
  return {
    statusCode: error.statusCode || 500,
    payload: {
      success: false,
      error: error.statusCode && error.statusCode < 500 ? error.message : "Could not activate workspace",
      code: error.code || "WORKSPACE_ACTIVATION_FAILED",
      ...(error.expectedAmount ? { expected_amount: error.expectedAmount } : {}),
      ...(error.amountPaid ? { amount_paid: error.amountPaid } : {}),
      configured: hasActivationSecret()
    }
  };
}

module.exports = {
  activateWorkspace,
  buildWorkspaceActivationError,
  buildWorkspaceActivationResponse,
  normalizeMoney,
  validatePaymentConfirmation
};
