const { clean, slugify, supabaseFetch } = require("./ops");

function normalizeHandle(value = "") {
  const decoded = clean(value).replace(/^@+/, "");
  const firstToken = (decoded.match(/^[a-z0-9][a-z0-9_-]*/i) || [""])[0];
  if (/^doneovernight/i.test(decoded) && /\s/.test(decoded) && firstToken.toLowerCase().startsWith("doneovernight")) {
    return "doneovernight";
  }
  return slugify(firstToken || decoded).slice(0, 48);
}

function rawPayloadOf(record = {}) {
  return record.raw_payload && typeof record.raw_payload === "object" ? record.raw_payload : {};
}

function missingColumnName(error = {}) {
  const detail = [
    error.message,
    error.details,
    error.hint,
    error.body,
    error.responseText
  ].filter(Boolean).join(" ");
  return detail.match(/'([^']+)' column/i)?.[1]
    || detail.match(/column "([^"]+)"/i)?.[1]
    || detail.match(/Could not find the '([^']+)'/i)?.[1]
    || "";
}

async function safeRows(path) {
  try {
    const rows = await supabaseFetch(path);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

async function findOperatorProfileByHandle(handle = "") {
  const operatorHandle = normalizeHandle(handle);
  if (!operatorHandle) return null;
  const paths = [
    `operator_profiles?handle=eq.${encodeURIComponent(operatorHandle)}&select=*&limit=1`,
    `operator_profiles?handle_normalized=eq.${encodeURIComponent(operatorHandle)}&select=*&limit=1`,
    `operator_profiles?username=eq.${encodeURIComponent(operatorHandle)}&select=*&limit=1`
  ];
  const groups = await Promise.all(paths.map(safeRows));
  return groups.flat()[0] || null;
}

function operatorDisplayFromProfile(profile = {}, fallbackHandle = "") {
  const raw = rawPayloadOf(profile);
  const handle = normalizeHandle(profile.handle || profile.handle_normalized || profile.username || fallbackHandle);
  if (!handle && !profile.id) return null;
  return {
    id: clean(profile.id),
    operator_id: clean(profile.operator_id),
    slug: handle,
    handle,
    display_name: clean(profile.display_name || profile.full_name || profile.name) || (handle ? `@${handle}` : "DONEOVERNIGHT Operator"),
    role: clean(profile.role || profile.role_type || raw.operator_role || raw.role) || "Specialist layer",
    bio: clean(profile.bio || raw.bio) || "Private execution. Operational systems. Overnight delivery.",
    avatar_url: clean(profile.avatar_url || profile.profile_image || raw.avatar_url || raw.profile_image)
  };
}

async function writeSupabasePayload(path, method, payload) {
  let activePayload = { ...payload };
  const droppedColumns = [];
  const maxAttempts = Object.keys(activePayload).length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const rows = await supabaseFetch(path, {
        method,
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(activePayload)
      });
      return {
        row: Array.isArray(rows) ? rows[0] : rows,
        persisted_fields: Object.keys(activePayload),
        skipped_missing_columns: droppedColumns
      };
    } catch (error) {
      const column = missingColumnName(error);
      if (!column || !Object.prototype.hasOwnProperty.call(activePayload, column)) throw error;
      droppedColumns.push(column);
      delete activePayload[column];
    }
  }
  const error = new Error("Operator relationship could not be stored");
  error.code = "OPERATOR_RELATIONSHIP_WRITE_FAILED";
  error.statusCode = 500;
  throw error;
}

async function patchPortalReferral(portalRequest = {}, operator = {}, source = "operator_referral") {
  if (!portalRequest?.id || !operator?.slug) return { updated: false };
  const now = new Date().toISOString();
  const raw = rawPayloadOf(portalRequest);
  const connectedOperator = {
    slug: operator.slug,
    handle: operator.handle || operator.slug,
    display_name: operator.display_name,
    role: operator.role,
    bio: operator.bio,
    avatar_url: operator.avatar_url,
    source,
    connected_at: raw.connected_operator?.connected_at || now
  };
  const rows = await supabaseFetch(`portal_requests?id=eq.${encodeURIComponent(portalRequest.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      raw_payload: {
        ...raw,
        referral_source: source,
        referring_operator_slug: operator.slug,
        referral_operator_slug: operator.slug,
        operator_referral_slug: operator.slug,
        connected_operator: connectedOperator,
        connected_operator_slug: operator.slug,
        connected_operator_source: source,
        connected_operator_at: connectedOperator.connected_at
      }
    })
  });
  return { updated: true, portal_request: Array.isArray(rows) ? rows[0] : rows, connected_operator: connectedOperator };
}

async function claimOperatorClientRelationship({ portalRequest = {}, operatorSlug = "", source = "operator_referral" } = {}) {
  const handle = normalizeHandle(operatorSlug);
  if (!handle || !portalRequest?.id) return { success: false, skipped: true, reason: "missing_identity" };
  const workspaceSlug = slugify(portalRequest.workspace_slug || portalRequest.username || portalRequest.company || rawPayloadOf(portalRequest).workspace_slug);
  const clientEmail = clean(portalRequest.email).toLowerCase();
  const profile = await findOperatorProfileByHandle(handle);
  const operator = operatorDisplayFromProfile(profile || {}, handle);
  if (!operator?.slug) return { success: false, skipped: true, reason: "operator_not_found", operator_slug: handle };

  const now = new Date().toISOString();
  const existingRows = workspaceSlug
    ? await safeRows(`operator_client_relationships?operator_handle=eq.${encodeURIComponent(operator.slug)}&workspace_slug=eq.${encodeURIComponent(workspaceSlug)}&select=*&limit=1`)
    : [];
  const existing = existingRows[0] || null;
  const payload = {
    operator_profile_id: operator.id || null,
    operator_id: operator.operator_id || null,
    operator_handle: operator.slug,
    client_id: clean(portalRequest.id),
    portal_request_id: clean(portalRequest.id),
    client_email: clientEmail,
    client_name: clean(portalRequest.name || portalRequest.company),
    workspace_slug: workspaceSlug,
    relationship_status: "active",
    connection_source: source,
    source,
    linked_at: existing?.linked_at || now,
    updated_at: now,
    raw_payload: {
      source,
      referring_operator_slug: operator.slug,
      workspace_slug: workspaceSlug,
      client_email: clientEmail,
      connected_at: existing?.linked_at || now
    }
  };
  if (!existing?.id) payload.created_at = now;

  let relationship = null;
  let relationshipStatus = "not_persisted";
  let relationshipWarning = "";
  try {
    const result = existing?.id
      ? await writeSupabasePayload(`operator_client_relationships?id=eq.${encodeURIComponent(existing.id)}`, "PATCH", payload)
      : await writeSupabasePayload("operator_client_relationships", "POST", payload);
    relationship = result.row || null;
    relationshipStatus = "persisted";
  } catch (error) {
    relationshipWarning = error.code || error.message || "relationship_write_failed";
  }

  const portalPatch = await patchPortalReferral(portalRequest, operator, source).catch((error) => ({
    updated: false,
    warning: error.code || error.message || "portal_referral_patch_failed"
  }));

  return {
    success: true,
    operator,
    relationship,
    relationship_status: relationshipStatus,
    relationship_warning: relationshipWarning,
    portal_referral_updated: portalPatch.updated === true,
    portal_request: portalPatch.portal_request || null
  };
}

async function getConnectedOperatorForWorkspace(portalRequest = {}) {
  const raw = rawPayloadOf(portalRequest);
  const rawOperator = raw.connected_operator && typeof raw.connected_operator === "object" ? raw.connected_operator : null;
  const workspaceSlug = slugify(portalRequest.workspace_slug || portalRequest.username || raw.workspace_slug);
  const relationshipRows = workspaceSlug
    ? await safeRows(`operator_client_relationships?workspace_slug=eq.${encodeURIComponent(workspaceSlug)}&relationship_status=eq.active&select=*&order=updated_at.desc&limit=1`)
    : [];
  const relationship = relationshipRows[0] || null;
  const handle = normalizeHandle(relationship?.operator_handle || rawOperator?.slug || rawOperator?.handle || raw.referring_operator_slug || raw.operator_referral_slug);
  if (!handle) return null;
  const profile = await findOperatorProfileByHandle(handle);
  const operator = operatorDisplayFromProfile(profile || {}, handle);
  if (!operator) return null;
  return {
    ...operator,
    source: relationship?.connection_source || relationship?.source || rawOperator?.source || raw.connected_operator_source || "operator_referral",
    connected_at: relationship?.linked_at || rawOperator?.connected_at || raw.connected_operator_at || null
  };
}

module.exports = {
  claimOperatorClientRelationship,
  getConnectedOperatorForWorkspace,
  normalizeHandle
};
