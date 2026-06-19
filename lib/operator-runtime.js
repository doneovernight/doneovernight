const crypto = require("crypto");

const { clean, supabaseFetch } = require("./ops");

const OPERATOR_SESSION_COOKIE = "don_operator_session";
const RESERVED_HANDLES = new Set(["apply", "login", "admin", "api", "auth", "settings", "help", "support", "system"]);
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,30}$/;

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    if (key) cookies[key] = value;
    return cookies;
  }, {});
}

function hashOperatorToken(token) {
  return crypto.createHash("sha256").update(clean(token)).digest("hex");
}

function normalizeHandle(rawHandle = "") {
  const segment = clean(decodeURIComponent(String(rawHandle).split("/").filter(Boolean)[0] || rawHandle));
  const withoutAt = segment.replace(/^@+/, "").toLowerCase();
  if (!HANDLE_PATTERN.test(withoutAt)) {
    const error = new Error("Invalid operator handle");
    error.statusCode = 400;
    error.code = "INVALID_OPERATOR_HANDLE";
    throw error;
  }
  if (RESERVED_HANDLES.has(withoutAt)) {
    const error = new Error("Reserved operator handle");
    error.statusCode = 404;
    error.code = "RESERVED_OPERATOR_HANDLE";
    throw error;
  }
  return withoutAt;
}

function coerceHandle(value = "") {
  const handle = clean(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 31);
  if (!HANDLE_PATTERN.test(handle) || RESERVED_HANDLES.has(handle)) return "";
  return handle;
}

function legacyUsernameHandle(profile = {}) {
  const username = coerceHandle(profile.username);
  if (!username || username === "operator") return "";
  return username;
}

function canonicalProfileHandle(profile = {}) {
  return coerceHandle(profile.handle)
    || coerceHandle(profile.handle_normalized)
    || legacyUsernameHandle(profile)
    || coerceHandle(String(profile.email || "").split("@")[0]);
}

function operatorHandlePath(profile = {}) {
  const handle = canonicalProfileHandle(profile);
  return handle ? `/@${encodeURIComponent(handle)}` : "/";
}

async function safeRows(path) {
  try {
    const rows = await supabaseFetch(path);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

async function findOperatorByHandle(handle) {
  const normalizedRows = await safeRows([
    `operator_profiles?handle_normalized=eq.${encodeURIComponent(handle)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  if (normalizedRows[0]) return normalizedRows[0];

  const rows = await safeRows([
    `operator_profiles?handle=eq.${encodeURIComponent(handle)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  if (rows[0]) return rows[0];

  const legacyRows = await safeRows([
    `operator_profiles?username=eq.${encodeURIComponent(handle)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  if (legacyRows[0]) return legacyRows[0];

  const fallbackRows = await safeRows("operator_profiles?select=*&order=created_at.desc&limit=500");
  return fallbackRows.find((profile) => {
    const canonicalHandle = coerceHandle(profile.handle);
    const username = coerceHandle(profile.username);
    const emailHandle = coerceHandle(String(profile.email || "").split("@")[0]);
    return canonicalHandle === handle || username === handle || emailHandle === handle;
  }) || null;
}

async function getAuthenticatedOperator(req) {
  const token = parseCookies(req)[OPERATOR_SESSION_COOKIE];
  if (!token) return null;

  const now = new Date().toISOString();
  const sessions = await safeRows([
    `operator_sessions?token_hash=eq.${encodeURIComponent(hashOperatorToken(token))}`,
    "revoked_at=is.null",
    `expires_at=gt.${encodeURIComponent(now)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const session = sessions[0];
  if (!session?.operator_profile_id) return null;

  const profiles = await safeRows([
    `operator_profiles?id=eq.${encodeURIComponent(session.operator_profile_id)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  const profile = profiles[0];
  if (!profile || clean(profile.status).toLowerCase() !== "active") return null;

  supabaseFetch(`operator_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: now })
  }).catch(() => {});

  return { session, profile };
}

function operatorDisplayName(profile = {}) {
  return clean(profile.display_name || profile.full_name || profile.name || profile.handle || profile.username || String(profile.email || "").split("@")[0]);
}

function cleanInstagramHandle(value) {
  return clean(value)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/g, "")
    .replace(/[^a-z0-9._]/gi, "")
    .slice(0, 40);
}

function parsePublicLinks(value) {
  const raw = clean(value);
  if (!raw) return { portfolio: "", instagram: "" };
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return {
        portfolio: clean(parsed.portfolio),
        instagram: cleanInstagramHandle(parsed.instagram)
      };
    } catch (error) {
      return { portfolio: raw, instagram: "" };
    }
  }
  return { portfolio: raw, instagram: "" };
}

function profileLinksFromRecord(profile = {}) {
  const parsed = parsePublicLinks(profile.portfolio_url || profile.portfolio);
  return {
    portfolio: clean(profile.portfolio || parsed.portfolio),
    instagram: cleanInstagramHandle(profile.instagram_handle || profile.instagram || parsed.instagram)
  };
}

function publicOperator(profile = {}, lastActiveAt = null) {
  const handle = canonicalProfileHandle(profile);
  const publicLinks = profileLinksFromRecord(profile);
  const rawPayload = profile.raw_payload && typeof profile.raw_payload === "object" ? profile.raw_payload : {};
  const availability = normalizeOperatorAvailability(rawPayload.operator_availability || rawPayload.availability_status || rawPayload.availability);
  return {
    id: profile.id || null,
    display_name: operatorDisplayName(profile),
    handle,
    email: profile.email || "",
    timezone: clean(profile.timezone) || "Europe/Amsterdam",
    role: clean(profile.role_type || profile.role) || "Operator",
    bio: clean(profile.bio || profile.public_bio) || "DONEOVERNIGHT operator.",
    portfolio: publicLinks.portfolio,
    instagram: publicLinks.instagram,
    public_links: publicLinks,
    avatar_url: clean(profile.avatar_url || profile.profile_image),
    accent_tint: clean(profile.accent_tint),
    status: clean(profile.status).toLowerCase() || "pending",
    operator_availability: availability.value,
    operator_availability_label: availability.label,
    operator_availability_updated_at: rawPayload.operator_availability_updated_at || null,
    operator_progression: normalizeOperatorProgression(rawPayload.operator_progression || rawPayload.progression),
    last_active_at: lastActiveAt || profile.last_active_at || profile.updated_at || profile.created_at || null
  };
}

function rawPayloadOf(record = {}) {
  return record.raw_payload && typeof record.raw_payload === "object" ? record.raw_payload : {};
}

function fallbackOperatorActivity(profile = {}) {
  const raw = rawPayloadOf(profile);
  const rows = [
    ...(Array.isArray(raw.operator_runtime_activity) ? raw.operator_runtime_activity : []),
    ...(Array.isArray(raw.operator_messages) ? raw.operator_messages : []),
    ...(Array.isArray(raw.operator_support_pings) ? raw.operator_support_pings : [])
  ];
  const handle = canonicalProfileHandle(profile);
  return rows
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      ...item,
      id: item.id || `profile_activity_${index}`,
      operator_profile_id: item.operator_profile_id || profile.id || "",
      operator_handle: clean(item.operator_handle || item.operator_slug || handle),
      created_at: item.created_at || item.sent_at || item.updated_at || profile.updated_at || profile.created_at,
      updated_at: item.updated_at || item.created_at || item.sent_at || profile.updated_at || profile.created_at,
      raw_payload: {
        ...(item.raw_payload && typeof item.raw_payload === "object" ? item.raw_payload : {}),
        profile_raw_payload_fallback: true
      }
    }));
}

function normalizeOperatorAvailability(value) {
  const normalized = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  const labels = {
    available: "Available",
    busy: "Busy",
    offline: "Offline",
    always_available: "Always Available"
  };
  const key = Object.prototype.hasOwnProperty.call(labels, normalized) ? normalized : "always_available";
  return { value: key, label: labels[key] };
}

function normalizeOperatorProgression(value = {}) {
  const progression = value && typeof value === "object" ? value : {};
  const level = Math.max(1, Math.min(100, Number(progression.level || progression.operator_level || 1) || 1));
  const progress = Math.max(0, Math.min(100, Number(progression.progress || progression.progress_percent || progression.progress_to_next || 0) || 0));
  const tiers = [
    { name: "Observer", level: 1 },
    { name: "Operator", level: 10 },
    { name: "Partner Operator", level: 25 },
    { name: "Execution Partner", level: 40 },
    { name: "Senior Partner", level: 60 },
    { name: "Growth Partner", level: 80 },
    { name: "Elite Partner", level: 100 }
  ];
  const currentTier = [...tiers].reverse().find((tier) => level >= tier.level) || tiers[0];
  const nextTier = tiers.find((tier) => level < tier.level) || null;
  return {
    level,
    tier: clean(progression.tier || progression.operator_tier) || currentTier.name,
    progress,
    next_level: Math.min(100, level + 1),
    next_tier: nextTier ? nextTier.name : "Elite Partner",
    tracked: true
  };
}

function getRuntimeHour(timezone) {
  let hour = new Date().getUTCHours();
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      hourCycle: "h23",
      timeZone: timezone || "Europe/Amsterdam"
    }).format(new Date()));
  } catch (error) {
    hour = new Date().getUTCHours();
  }
  return hour;
}

function getGreeting({ name, handle, timezone, runtime, isOwner }) {
  const hour = getRuntimeHour(timezone);
  const state = runtime?.state || {};
  const identity = clean(name) || (handle ? `@${handle}` : "operator");
  const hasDelivery = state.next_delivery_label && state.next_delivery_label !== "No delivery window";
  const revisions = Number(state.revisions_pending || 0);
  const activeTasks = Number(state.active_tasks || 0);

  if (!isOwner) return `Operator layer: @${handle || "operator"}.`;
  if (hour < 5) return "Late hours.";
  if (hour < 12) return `Good morning, ${identity}.`;
  if (hour < 18) {
    if (revisions) return `Good afternoon, @${handle || identity}.`;
    return `Good afternoon, ${identity}.`;
  }
  if (activeTasks || revisions || hasDelivery) return `Good evening, ${identity}.`;
  return `Good evening, ${identity}.`;
}

function getGreetingDetail({ timezone, runtime, isOwner, operatorName = "" }) {
  const hour = getRuntimeHour(timezone);
  const state = runtime?.state || {};
  const activeTasks = Number(state.active_tasks || 0);
  const revisions = Number(state.revisions_pending || 0);
  const unread = Number(state.unread_messages || 0);
  const hasDelivery = state.next_delivery_label && state.next_delivery_label !== "No delivery window";

  if (!isOwner) return "Public operator preview.";
  if (hour < 5) return "Operator layer remains active.";
  if (revisions) return `${revisions} ${revisions === 1 ? "revision" : "revisions"} awaiting review.`;
  if (unread) return `${unread} unread ${unread === 1 ? "client update" : "client updates"}.`;
  if (activeTasks) return `${activeTasks} active ${activeTasks === 1 ? "task" : "tasks"} in motion.`;
  if (hour >= 18 && !hasDelivery) return "No active deliveries tonight.";
  if (clean(operatorName)) return "Operations routing is standing by.";
  return "Operations are standing by.";
}

function statusGroup(value) {
  const status = clean(value).toLowerCase();
  if (["revision_requested", "revision requested", "revision", "changes_requested", "changes requested", "awaiting_revision", "awaiting revision"].includes(status)) return "revision";
  if (["queued", "in_progress", "in progress", "delivery_prep", "delivery prep", "review_pending", "review pending", "new", "awaiting_operator", "awaiting operator"].includes(status)) return "active";
  if (["quoted", "awaiting_payment", "awaiting payment", "verification_pending", "verification pending"].includes(status)) return "pending";
  if (["delivered", "completed"].includes(status)) return "delivered";
  if (["approved"].includes(status)) return "approved";
  if (["archived"].includes(status)) return "archived";
  return status || "pending";
}

function sentenceCase(value, fallback = "") {
  const raw = clean(value || fallback).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

function taskReferenceOf(task = {}) {
  const raw = rawPayloadOf(task);
  return clean(task.task_id || task.taskId || task.reference || raw.task_id || raw.taskId || raw.reference || task.id);
}

function taskWorkspaceSlug(task = {}) {
  const raw = rawPayloadOf(task);
  return clean(task.workspace_slug || task.client_workspace_slug || raw.workspace_slug || raw.client_workspace_slug || raw.slug);
}

function getTaskAttachments(task = {}) {
  const raw = rawPayloadOf(task);
  const sources = [
    task.attachments,
    raw.attachments,
    raw.uploaded_files,
    raw.files,
    raw.file_uploads
  ];
  const byKey = new Map();
  sources.flatMap((source) => Array.isArray(source) ? source : []).forEach((attachment) => {
    if (!attachment) return;
    const item = typeof attachment === "string" ? { name: attachment } : attachment;
    const name = clean(item.name || item.filename || item.title || "Attachment");
    const url = clean(item.url || item.signed_url || item.file_url || item.download_url || item.href);
    const key = `${name}:${url}:${clean(item.path || item.storage_path)}`;
    if (!name || byKey.has(key)) return;
    byKey.set(key, {
      name,
      mime_type: clean(item.mime_type || item.type),
      size: item.size || null,
      url
    });
  });
  return Array.from(byKey.values()).slice(0, 8);
}

function operatorDeskOf(task = {}) {
  const raw = rawPayloadOf(task);
  return raw.operator_execution_desk && typeof raw.operator_execution_desk === "object" ? raw.operator_execution_desk : {};
}

function messageTaskReference(message = {}) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  return clean(message.task_id || message.taskId || metadata.task_id || metadata.taskId || metadata.operation || metadata.reference);
}

function messageBelongsToTask(message = {}, task = {}) {
  const ref = taskReferenceOf(task);
  const messageRef = messageTaskReference(message);
  if (ref && messageRef && ref === messageRef) return true;
  const slug = taskWorkspaceSlug(task);
  return Boolean(slug && clean(message.workspace_slug) === slug);
}

function summarizeOperatorDesk(task = {}) {
  const desk = operatorDeskOf(task);
  return {
    updates: Array.isArray(desk.updates) ? desk.updates.slice(0, 5) : [],
    execution_plans: Array.isArray(desk.execution_plans) ? desk.execution_plans.slice(0, 5) : [],
    deliverables: Array.isArray(desk.deliverables) ? desk.deliverables.slice(0, 5) : [],
    ready_for_admin_review: desk.ready_for_admin_review === true,
    ready_for_admin_review_at: desk.ready_for_admin_review_at || "",
    last_operator_action: desk.last_operator_action || null
  };
}

function summarizeTaskForOperator(task = {}, { timezone, messages = [], activity = [] } = {}) {
  const raw = rawPayloadOf(task);
  const reference = taskReferenceOf(task);
  const workspaceSlug = taskWorkspaceSlug(task);
  const taskMessages = messages.filter((message) => messageBelongsToTask(message, task));
  const taskActivity = activity.filter((item) => {
    const activityRef = clean(item.task_reference || item.don_reference || item.task_id || item.raw_payload?.task_reference);
    const activitySlug = clean(item.workspace_slug || item.raw_payload?.workspace_slug);
    return (reference && activityRef && reference === activityRef) || (workspaceSlug && activitySlug === workspaceSlug);
  });
  return {
    id: reference,
    task_id: reference,
    reference,
    title: clean(task.task_summary || task.task_description || raw.task_summary || raw.task_description || raw.title) || "Assigned task",
    client_name: clean(task.name || raw.name || raw.client_name) || workspaceSlug || "Assigned client",
    client_email: clean(task.email || raw.email || raw.client_email),
    workspace_slug: workspaceSlug,
    status: sentenceCase(task.status || raw.status || "pending"),
    scope: clean(task.quote_note || raw.quote_note || raw.scope || task.task_description || raw.task_description || task.task_summary || raw.task_summary),
    timeline: clean(task.delivery_eta || raw.delivery_eta || task.deadline || raw.deadline),
    deadline: task.deadline ? formatRuntimeTime(task.deadline, timezone) : clean(raw.deadline || raw.timeline || "No deadline"),
    investment: clean(task.quote_amount || raw.quote_amount || raw.approved_amount || raw.client_budget || task.client_budget),
    source: clean(task.source || raw.source || "workspace"),
    attachments: getTaskAttachments(task),
    client_updates: taskMessages
      .filter((message) => {
        const role = clean(message.author_role || message.sender_role).toLowerCase();
        return role && role !== "operator";
      })
      .slice(0, 5)
      .map((message) => ({
        id: message.id || "",
        title: message.subject || message.message_type || "Client update",
        detail: clean(message.message || message.body || message.content).slice(0, 180),
        created_at: formatRuntimeTime(message.created_at, timezone),
        unread: !message.read_at
      })),
    operator_updates: taskActivity.slice(0, 5).map((item) => ({
      id: item.id || "",
      title: item.title || item.activity_type || "Operator update",
      detail: clean(item.body || item.message || item.detail).slice(0, 180),
      created_at: formatRuntimeTime(item.created_at, timezone)
    })),
    operator_execution_desk: summarizeOperatorDesk(task)
  };
}

function formatMoney(value, currency = "EUR") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatRuntimeTime(value, timezone = "Europe/Amsterdam") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || "Europe/Amsterdam"
    }).format(date);
  } catch (error) {
    return date.toISOString();
  }
}

function deadlineTime(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function relativeActivity(value) {
  if (!value) return "Awaiting first activity";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Awaiting first activity";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 2) return "Active just now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Active ${days}d ago`;
}

function operationalState({ isOwner, activeTasks, revisions, activeAssignments, nextDeadline, lastActiveAt }) {
  if (!isOwner) return "Public preview";
  if (revisions.length) return "Awaiting revision";
  if (activeTasks.length) return "In delivery flow";
  if (activeAssignments.length) return "Idle";
  if (!lastActiveAt) return "Operator layer synchronized";
  if (Date.now() - new Date(lastActiveAt).getTime() > 1000 * 60 * 60 * 24 * 14) return "Unavailable";
  if (nextDeadline && nextDeadline !== "No delivery window") return "Online";
  return "Idle";
}

function presenceMessage({ isOwner, activeAssignments, activeTasks, revisions, unreadMessages, lastActiveAt }) {
  if (!isOwner) return "Private runtime unlocks after verified operator access.";
  if (revisions.length) return "Revision pressure detected. Operations routing is standing by.";
  if (unreadMessages.length) return "Client movement is waiting inside the operator layer.";
  if (activeTasks.length) return "Delivery flow is active. Runtime state is synchronized.";
  if (!activeAssignments.length) return "No movement yet. The overnight layer remains ready.";
  if (!lastActiveAt) return "Operator layer synchronized. Awaiting first runtime signal.";
  const age = Date.now() - new Date(lastActiveAt).getTime();
  if (Number.isFinite(age) && age < 1000 * 60 * 60 * 24 * 5) {
    return "Operations appreciate consistency.";
  }
  return "Still reviewing the layer? Operations routing is standing by.";
}

async function loadAssignments(profile) {
  const candidates = [profile.operator_id, profile.id].filter(Boolean);
  const legacyGroups = await Promise.all(candidates.map((id) => safeRows([
    `operator_workspace_assignments?operator_id=eq.${encodeURIComponent(id)}`,
    "select=*",
    "order=created_at.desc",
    "limit=25"
  ].join("&"))));
  const canonicalFilters = [
    profile.id ? `operator_assignments?operator_profile_id=eq.${encodeURIComponent(profile.id)}&select=*&order=updated_at.desc&limit=50` : "",
    profile.id ? `operator_assignments?assigned_operator_id=eq.${encodeURIComponent(profile.id)}&select=*&order=updated_at.desc&limit=50` : "",
    profile.operator_id ? `operator_assignments?operator_id=eq.${encodeURIComponent(profile.operator_id)}&select=*&order=updated_at.desc&limit=50` : "",
    canonicalProfileHandle(profile) ? `operator_assignments?operator_handle=eq.${encodeURIComponent(canonicalProfileHandle(profile))}&select=*&order=updated_at.desc&limit=50` : ""
  ].filter(Boolean);
  const canonicalGroups = await Promise.all(canonicalFilters.map((path) => safeRows(path)));
  const canonical = canonicalGroups.flat().map((assignment) => ({
    ...assignment,
    source: "operator_assignments",
    operator_profile_id: assignment.operator_profile_id || assignment.assigned_operator_id || profile.id,
    workspace_slug: clean(assignment.workspace_slug || assignment.client_workspace_slug || assignment.slug),
    client_name: clean(assignment.client_name || assignment.client || assignment.company || assignment.brand),
    task_title: clean(assignment.task_title || assignment.title || assignment.scope_title || "Assigned task"),
    task_type: clean(assignment.task_type || assignment.service_type || assignment.category || "Execution"),
    operational_state: clean(assignment.operational_state || assignment.status || "awaiting_operator"),
    revision_state: clean(assignment.revision_state || "Revision clear"),
    delivery_state: clean(assignment.delivery_state || "Standing by"),
    payout_value: assignment.payout_value ?? assignment.payout_amount ?? assignment.amount ?? null,
    due_at: assignment.due_at || assignment.due_date || assignment.deadline || null
  }));
  const legacy = legacyGroups.flat().map((assignment) => ({
    ...assignment,
    source: "operator_workspace_assignments",
    operator_profile_id: profile.id,
    client_name: clean(assignment.client_name || assignment.company || assignment.workspace_slug),
    task_title: clean(assignment.task_title || "Workspace assignment"),
    task_type: clean(assignment.task_type || "Execution"),
    operational_state: clean(assignment.operational_state || assignment.relationship_status || "active"),
    revision_state: clean(assignment.revision_state || "Revision clear"),
    delivery_state: clean(assignment.delivery_state || "Standing by"),
    payout_value: assignment.payout_value ?? null,
    due_at: assignment.due_at || assignment.deadline || null
  }));
  return [...canonical, ...legacy].filter((assignment, index, rows) => {
    const key = assignment.id || `${assignment.source}:${assignment.workspace_slug}:${assignment.portal_request_id || assignment.task_title}`;
    return key && rows.findIndex((row) => (row.id || `${row.source}:${row.workspace_slug}:${row.portal_request_id || row.task_title}`) === key) === index;
  });
}

async function loadAssignmentActivity(profile, assignments) {
  const assignmentIds = assignments.map((assignment) => clean(assignment.id)).filter(Boolean);
  const slugs = assignments.map((assignment) => clean(assignment.workspace_slug)).filter(Boolean);
  const paths = [
    profile.id ? `assignment_activity?operator_profile_id=eq.${encodeURIComponent(profile.id)}&select=*&order=created_at.desc&limit=80` : "",
    profile.id ? `operator_runtime_activity?operator_profile_id=eq.${encodeURIComponent(profile.id)}&select=*&order=created_at.desc&limit=80` : "",
    canonicalProfileHandle(profile) ? `operator_runtime_activity?operator_handle=eq.${encodeURIComponent(canonicalProfileHandle(profile))}&select=*&order=created_at.desc&limit=80` : ""
  ].filter(Boolean);
  const groups = await Promise.all(paths.map((path) => safeRows(path)));
  const rows = [...groups.flat(), ...fallbackOperatorActivity(profile)];
  return rows.filter((item) => {
    const assignmentId = clean(item.assignment_id);
    const slug = clean(item.workspace_slug);
    return !assignmentIds.length && !slugs.length
      ? clean(item.operator_profile_id) === clean(profile.id) || clean(item.operator_handle) === canonicalProfileHandle(profile)
      : assignmentIds.includes(assignmentId) || slugs.includes(slug) || clean(item.operator_profile_id) === clean(profile.id);
  });
}

async function loadAssignmentRevisions(profile, assignments) {
  const assignmentIds = assignments.map((assignment) => clean(assignment.id)).filter(Boolean);
  const slugs = assignments.map((assignment) => clean(assignment.workspace_slug)).filter(Boolean);
  const rows = profile.id
    ? await safeRows(`assignment_revisions?operator_profile_id=eq.${encodeURIComponent(profile.id)}&select=*&order=updated_at.desc&limit=80`)
    : [];
  return rows.filter((item) => {
    const assignmentId = clean(item.assignment_id);
    const slug = clean(item.workspace_slug);
    return assignmentIds.includes(assignmentId) || slugs.includes(slug) || clean(item.operator_profile_id) === clean(profile.id);
  });
}

async function loadOperatorClientRelationships(profile) {
  const paths = [
    profile.id ? `operator_client_relationships?operator_profile_id=eq.${encodeURIComponent(profile.id)}&select=*&order=updated_at.desc&limit=50` : "",
    profile.operator_id ? `operator_client_relationships?operator_id=eq.${encodeURIComponent(profile.operator_id)}&select=*&order=updated_at.desc&limit=50` : "",
    canonicalProfileHandle(profile) ? `operator_client_relationships?operator_handle=eq.${encodeURIComponent(canonicalProfileHandle(profile))}&select=*&order=updated_at.desc&limit=50` : ""
  ].filter(Boolean);
  const groups = await Promise.all(paths.map((path) => safeRows(path)));
  return groups.flat().filter((relationship, index, rows) => {
    const key = relationship.id || `${relationship.operator_profile_id}:${relationship.client_id}:${relationship.workspace_slug}`;
    return key && rows.findIndex((row) => (row.id || `${row.operator_profile_id}:${row.client_id}:${row.workspace_slug}`) === key) === index;
  });
}

function assignmentMatchesSlug(assignment, slug) {
  return clean(assignment.workspace_slug) && clean(assignment.workspace_slug) === clean(slug);
}

function isTerminalAssignment(assignment) {
  return ["archived", "delivered", "completed"].includes(statusGroup(assignment.operational_state || assignment.status));
}

async function loadRuntimeData(profile, isOwner) {
  const assignments = isOwner ? await loadAssignments(profile) : [];
  const relationships = isOwner ? await loadOperatorClientRelationships(profile) : [];
  const activity = isOwner ? await loadAssignmentActivity(profile, assignments) : [];
  const assignmentRevisions = isOwner ? await loadAssignmentRevisions(profile, assignments) : [];
  const activeAssignments = assignments.filter((item) => {
    const relationship = clean(item.relationship_status || "active").toLowerCase();
    return relationship === "active" && !isTerminalAssignment(item);
  });
  const activeRelationships = relationships.filter((item) => !["archived", "revoked", "inactive"].includes(clean(item.relationship_status || "linked").toLowerCase()));
  const assignmentSlugs = activeAssignments.map((item) => clean(item.workspace_slug)).filter(Boolean);
  const relationshipSlugs = activeRelationships.map((item) => clean(item.workspace_slug)).filter(Boolean);
  const runtimeSlugs = [...new Set([...assignmentSlugs, ...relationshipSlugs])];
  const timezone = clean(profile.timezone) || "Europe/Amsterdam";
  const lastActiveAt = profile.last_active_at || profile.updated_at || profile.created_at || null;
  const availability = normalizeOperatorAvailability(profile.raw_payload?.operator_availability || profile.raw_payload?.availability_status || profile.raw_payload?.availability);

  const [messages, quotes, tasks] = isOwner ? await Promise.all([
    safeRows("workspace_messages?select=*&order=created_at.desc&limit=100"),
    safeRows("workspace_quotes?select=*&order=created_at.desc&limit=100"),
    safeRows("task_requests?select=*&order=created_at.desc&limit=100")
  ]) : [[], [], []];

  const scopedMessages = runtimeSlugs.length
    ? messages.filter((message) => runtimeSlugs.includes(clean(message.workspace_slug)))
    : [];
  const scopedQuotes = runtimeSlugs.length
    ? quotes.filter((quote) => runtimeSlugs.includes(clean(quote.workspace_slug)))
    : [];
  const scopedTasks = runtimeSlugs.length
    ? tasks.filter((task) => {
      const rawSlug = clean(task.workspace_slug || task.raw_payload?.workspace_slug || task.raw_payload?.slug);
      return runtimeSlugs.includes(rawSlug);
    })
    : [];
  const taskForAssignment = (assignment = {}) => {
    const assignmentRef = clean(assignment.task_id || assignment.task_reference || assignment.don_reference || assignment.reference);
    const assignmentSlug = clean(assignment.workspace_slug);
    return scopedTasks.find((task) => {
      const taskRef = taskReferenceOf(task);
      const slug = taskWorkspaceSlug(task);
      return (assignmentRef && taskRef && assignmentRef === taskRef) || (assignmentSlug && slug === assignmentSlug);
    }) || null;
  };

  const assignmentActiveTasks = activeAssignments.filter((assignment) => statusGroup(assignment.operational_state || assignment.status) === "active");
  const assignmentRevisionRows = activeAssignments.filter((assignment) => statusGroup(assignment.revision_state) === "revision");
  const revisionRows = assignmentRevisions.filter((revision) => !revision.resolved_at && statusGroup(revision.revision_state || revision.status) === "revision");
  const activeTasks = [...scopedTasks.filter((task) => statusGroup(task.status) === "active"), ...assignmentActiveTasks];
  const revisions = [...scopedTasks.filter((task) => statusGroup(task.status) === "revision"), ...assignmentRevisionRows, ...revisionRows];
  const approvals = scopedTasks.filter((task) => ["quoted", "awaiting_payment", "verification_pending"].includes(clean(task.status).toLowerCase()));
  const pendingTasks = [...scopedTasks.filter((task) => ["active", "pending", "revision"].includes(statusGroup(task.status))), ...activeAssignments.filter((assignment) => !isTerminalAssignment(assignment))];
  const deliveries = [
    ...scopedTasks.filter((task) => ["delivery_prep", "delivered", "completed"].includes(clean(task.status).toLowerCase())),
    ...activeAssignments.filter((assignment) => /delivery|delivered|approved/i.test(`${assignment.delivery_state} ${assignment.operational_state}`))
  ];
  const unreadWorkspaceMessages = scopedMessages.filter((message) => {
    const role = clean(message.author_role || message.sender_role || message.role).toLowerCase();
    return role && role !== "operator" && !message.read_at;
  });
  const unreadActivity = activity.filter((item) => {
    const role = clean(item.actor_role).toLowerCase();
    return item.unread_for_operator === true || (!item.read_at && role && role !== "operator");
  });
  const unreadMessages = [...unreadWorkspaceMessages, ...unreadActivity];
  const pendingRevenue = scopedQuotes
    .filter((quote) => !["paid", "completed"].includes(clean(quote.status).toLowerCase()))
    .reduce((sum, quote) => sum + Number(quote.amount || 0), 0)
    + activeAssignments.reduce((sum, assignment) => sum + Number(assignment.payout_value || 0), 0);
  const paidRevenue = scopedQuotes
    .filter((quote) => ["paid", "completed"].includes(clean(quote.status).toLowerCase()))
    .reduce((sum, quote) => sum + Number(quote.amount || 0), 0);
  const nextDeadline = [
    ...activeAssignments.map((assignment) => assignment.due_at).filter(Boolean),
    ...scopedTasks.map((task) => task.deadline).filter(Boolean)
  ].sort((a, b) => deadlineTime(a) - deadlineTime(b))[0] || "No delivery window";
  const stateName = operationalState({ isOwner, activeTasks, revisions, activeAssignments, nextDeadline, lastActiveAt });

  return {
    mocked: isOwner && runtimeSlugs.length === 0,
    state: {
      active_tasks: activeTasks.length,
      revisions_pending: revisions.length,
      unread_messages: unreadMessages.length,
      upcoming_deliveries: deliveries.length,
      next_delivery_window: nextDeadline,
      next_delivery_label: nextDeadline === "No delivery window" ? "No delivery window" : formatRuntimeTime(nextDeadline, timezone),
      online_status: isOwner ? "online" : "public",
      operator_availability: availability.value,
      operator_availability_label: availability.label,
      operational_state: stateName,
      presence_label: isOwner ? stateName : "Public preview",
      last_active_label: relativeActivity(lastActiveAt),
      presence_message: presenceMessage({ isOwner, activeAssignments, activeTasks, revisions, unreadMessages, lastActiveAt })
    },
    metrics: {
      active_clients: new Set([...activeAssignments.map((item) => clean(item.workspace_slug || item.client_email || item.client_name)), ...activeRelationships.map((item) => clean(item.workspace_slug || item.client_email || item.client_id))].filter(Boolean)).size,
      pending_tasks: pendingTasks.length,
      approvals: revisions.length || approvals.length,
      messages: unreadMessages.length || scopedMessages.length,
      revenue: formatMoney(paidRevenue + pendingRevenue),
      deadlines: nextDeadline === "No delivery window" ? "No active delivery" : formatRuntimeTime(nextDeadline, timezone)
    },
    assignments: activeAssignments.slice(0, 12).map((assignment) => {
      const relatedTask = taskForAssignment(assignment);
      const summary = relatedTask
        ? summarizeTaskForOperator(relatedTask, { timezone, messages: scopedMessages, activity })
        : {};
      const assignmentReference = clean(assignment.task_id || assignment.task_reference || assignment.don_reference || summary.reference || assignment.id || "");
      return {
        id: assignmentReference || assignment.id || "",
        assignment_id: assignment.id || "",
        client_name: summary.client_name || assignment.client_name || assignment.workspace_slug || "Assigned client",
        client_email: summary.client_email || assignment.client_email || "",
        workspace_slug: summary.workspace_slug || assignment.workspace_slug || "",
        task_title: summary.title || assignment.task_title || "Assigned task",
        task_type: assignment.task_type || summary.source || "Execution",
        operational_state: sentenceCase(assignment.operational_state || summary.status || assignment.status, "Awaiting operator"),
        revision_state: sentenceCase(assignment.revision_state || "Revision clear"),
        delivery_state: sentenceCase(assignment.delivery_state || "Standing by"),
        payout_value: assignment.payout_value || null,
        payout_status: sentenceCase(assignment.payout_status || assignment.payment_state || "Pending"),
        due_at: assignment.due_at || relatedTask?.deadline || null,
        due_label: assignment.due_at ? formatRuntimeTime(assignment.due_at, timezone) : summary.deadline || "No delivery window",
        recent_activity: relativeActivity(assignment.updated_at || assignment.created_at),
        scope: summary.scope || clean(assignment.scope || assignment.description),
        timeline: summary.timeline || clean(assignment.timeline || assignment.due_at),
        investment: summary.investment || "",
        attachments: summary.attachments || [],
        client_updates: summary.client_updates || [],
        operator_updates: summary.operator_updates || [],
        operator_execution_desk: summary.operator_execution_desk || summarizeOperatorDesk(assignment)
      };
    }),
    assigned_clients: [
      ...activeAssignments.map((assignment) => {
      const slug = clean(assignment.workspace_slug);
      const latestActivity = activity.find((item) => clean(item.assignment_id) === clean(assignment.id) || clean(item.workspace_slug) === slug);
      return {
      client_name: assignment.client_name || assignment.workspace_slug || "Assigned client",
      workspace_slug: assignment.workspace_slug || "",
      status: assignment.relationship_status || assignment.operational_state || "active",
      task_state: sentenceCase(assignment.operational_state || (pendingTasks.some((task) => clean(task.workspace_slug || task.raw_payload?.workspace_slug) === slug) ? "Task active" : "No active task")),
      revision_state: sentenceCase(revisions.some((item) => clean(item.workspace_slug || item.raw_payload?.workspace_slug) === slug || clean(item.assignment_id) === clean(assignment.id)) ? "Revision pending" : assignment.revision_state || "Revision clear"),
      delivery_state: sentenceCase(deliveries.some((item) => assignmentMatchesSlug(item, slug) || clean(item.assignment_id) === clean(assignment.id)) ? "Delivery movement" : assignment.delivery_state || "Standing by"),
      recent_activity: latestActivity ? `${sentenceCase(latestActivity.title || latestActivity.activity_type, "Runtime movement")} · ${relativeActivity(latestActivity.created_at)}` : relativeActivity(assignment.updated_at || assignment.created_at),
      workspace_url: assignment.workspace_slug ? `https://portal.doneovernight.com/@${encodeURIComponent(clean(assignment.workspace_slug))}` : ""
      };
      }),
      ...activeRelationships
        .filter((relationship) => !activeAssignments.some((assignment) => clean(assignment.workspace_slug) && clean(assignment.workspace_slug) === clean(relationship.workspace_slug)))
        .map((relationship) => ({
          client_name: relationship.client_name || relationship.client_email || relationship.workspace_slug || "Linked client",
          workspace_slug: relationship.workspace_slug || "",
          status: sentenceCase(relationship.relationship_status || "linked"),
          task_state: "No active task",
          revision_state: "Revision clear",
          delivery_state: "Standing by",
          recent_activity: relationship.linked_at ? `Linked · ${relativeActivity(relationship.linked_at)}` : relativeActivity(relationship.updated_at || relationship.created_at),
          workspace_url: relationship.workspace_slug ? `https://portal.doneovernight.com/@${encodeURIComponent(clean(relationship.workspace_slug))}` : ""
        }))
    ].slice(0, 8),
    tasks: [
      ...activeAssignments.map((assignment) => {
        const relatedTask = taskForAssignment(assignment);
        const summary = relatedTask
          ? summarizeTaskForOperator(relatedTask, { timezone, messages: scopedMessages, activity })
          : {};
        return {
          id: clean(assignment.task_id || assignment.task_reference || summary.reference || assignment.id || ""),
          title: summary.title || assignment.task_title || "Assigned task",
          status: sentenceCase(assignment.operational_state || summary.status || "Awaiting operator"),
          deadline: assignment.due_at ? formatRuntimeTime(assignment.due_at, timezone) : summary.deadline || "No deadline",
          workspace_slug: summary.workspace_slug || assignment.workspace_slug || "",
          type: assignment.task_type || "Execution",
          scope: summary.scope || clean(assignment.scope || assignment.description),
          timeline: summary.timeline || clean(assignment.timeline),
          attachments: summary.attachments || [],
          client_updates: summary.client_updates || [],
          operator_updates: summary.operator_updates || [],
          operator_execution_desk: summary.operator_execution_desk || summarizeOperatorDesk(assignment)
        };
      }),
      ...scopedTasks.map((task) => summarizeTaskForOperator(task, { timezone, messages: scopedMessages, activity }))
    ].filter((task, index, rows) => {
      const key = clean(task.id || task.reference || task.workspace_slug || task.title);
      return key && rows.findIndex((row) => clean(row.id || row.reference || row.workspace_slug || row.title) === key) === index;
    }).slice(0, 12),
    messages: [
      ...activity.map((item) => ({
        id: item.id || "",
        source: item.raw_payload?.profile_raw_payload_fallback ? "profile_raw_payload" : "operator_runtime_activity",
        activity_type: item.activity_type || "",
        sender_role: item.sender_role || item.actor_role || "",
        task_reference: item.task_reference || item.don_reference || item.task_id || "",
        workspace_slug: item.workspace_slug || "runtime",
        title: item.title || item.activity_type || "Runtime activity",
        status: item.read_at ? "Read" : "Unread",
        detail: clean(item.body || item.message || item.detail).slice(0, 120) || "Assignment movement recorded.",
        created_at: formatRuntimeTime(item.created_at, timezone)
      })),
      ...scopedMessages.map((message) => ({
      id: message.id || "",
      source: "workspace_messages",
      workspace_slug: message.workspace_slug || "workspace",
      title: message.subject || message.message_type || "Client update",
      status: message.read_at ? "Read" : "Unread",
      detail: clean(message.message || message.body || message.content).slice(0, 120) || "Workspace message received.",
      created_at: formatRuntimeTime(message.created_at, timezone)
      }))
    ].slice(0, 4),
    contracts: scopedQuotes.slice(0, 4).map((quote) => ({
      workspace_slug: quote.workspace_slug || "workspace",
      title: quote.title || quote.quote_title || "Quote / approval",
      status: quote.status || "pending",
      amount: formatMoney(quote.amount || 0, quote.currency || "EUR")
    })),
    finance: {
      paid: formatMoney(paidRevenue),
      pending: formatMoney(pendingRevenue)
    }
  };
}

async function loadOperatorRuntime(req, rawHandle) {
  const handle = normalizeHandle(rawHandle);
  const profile = await findOperatorByHandle(handle);
  if (!profile) {
    const error = new Error("Operator not found");
    error.statusCode = 404;
    error.code = "OPERATOR_NOT_FOUND";
    throw error;
  }

  const auth = await getAuthenticatedOperator(req);
  const isOwner = Boolean(auth?.profile && (
    auth.profile.id === profile.id ||
    clean(auth.profile.email).toLowerCase() === clean(profile.email).toLowerCase() ||
    canonicalProfileHandle(auth.profile) === canonicalProfileHandle(profile)
  ));
  const operator = publicOperator(profile, auth?.session?.last_used_at || null);
  const authenticatedHandle = auth?.profile ? canonicalProfileHandle(auth.profile) : "";
  const redirectTo = auth?.profile && authenticatedHandle && authenticatedHandle !== handle
    ? operatorHandlePath(auth.profile)
    : "";
  const runtime = await loadRuntimeData(profile, isOwner);
  const firstName = clean(operator.display_name).split(/\s+/)[0] || operator.handle;

  return {
    success: true,
    handle,
    is_authenticated: Boolean(auth),
    is_owner: isOwner,
    view: isOwner ? "owner" : "public",
    redirectTo,
    operator: isOwner ? operator : { ...operator, email: "" },
    greeting: getGreeting({ name: firstName, handle: operator.handle, timezone: operator.timezone, runtime, isOwner }),
    greeting_detail: getGreetingDetail({ timezone: operator.timezone, runtime, isOwner, operatorName: operator.display_name }),
    runtime
  };
}

module.exports = {
  RESERVED_HANDLES,
  loadOperatorRuntime,
  normalizeHandle
};
