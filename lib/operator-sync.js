const { clean, supabaseFetch } = require("./ops");

const RESERVED_OPERATOR_HANDLES = new Set(["apply", "login", "admin", "api", "auth", "settings", "help", "support", "system"]);

function splitList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeOperatorHandle(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 31);
}

function validOperatorHandle(value) {
  const handle = normalizeOperatorHandle(value);
  if (!/^[a-z0-9][a-z0-9_-]{1,30}$/.test(handle) || RESERVED_OPERATOR_HANDLES.has(handle)) return "";
  return handle;
}

function operatorName(operator = {}) {
  return clean(operator.display_name || operator.full_name || operator.name || operator.operator_name || operator.email?.split("@")[0]);
}

function baseHandleForOperator(operator = {}) {
  return validOperatorHandle(operator.handle || operator.handle_normalized || operator.username)
    || validOperatorHandle(operatorName(operator))
    || validOperatorHandle(String(operator.email || "").split("@")[0])
    || validOperatorHandle(`operator-${String(operator.id || Date.now()).slice(0, 8)}`);
}

function missingColumnName(error) {
  const detail = String(error?.detail || error?.message || "");
  return detail.match(/'([^']+)' column/)?.[1]
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

async function findOperatorProfileForOperator(operator = {}) {
  const email = clean(operator.email).toLowerCase();
  const operatorId = clean(operator.id || operator.operator_id);
  const [byOperatorId, byEmail] = await Promise.all([
    operatorId ? safeRows(`operator_profiles?operator_id=eq.${encodeURIComponent(operatorId)}&select=*&limit=1`) : [],
    email ? safeRows(`operator_profiles?email=eq.${encodeURIComponent(email)}&select=*&limit=1`) : []
  ]);
  return byOperatorId[0] || byEmail[0] || null;
}

async function uniqueHandleForOperator(operator = {}, existingProfile = null) {
  const email = clean(operator.email || existingProfile?.email).toLowerCase();
  const existingHandle = validOperatorHandle(existingProfile?.handle || existingProfile?.handle_normalized);
  if (existingHandle) return existingHandle;

  const base = baseHandleForOperator(operator);
  for (let index = 0; index < 24; index += 1) {
    const candidate = index === 0 ? base : validOperatorHandle(`${base}-${index + 1}`);
    if (!candidate) continue;
    const rows = await safeRows([
      `operator_profiles?handle_normalized=eq.${encodeURIComponent(candidate)}`,
      "select=email",
      "limit=3"
    ].join("&"));
    if (!rows.length || rows.every((row) => clean(row.email).toLowerCase() === email)) return candidate;
  }
  return validOperatorHandle(`${base}-${String(operator.id || Date.now()).slice(0, 6)}`) || base;
}

function buildProfilePayload(operator = {}, existingProfile = {}, handle = "") {
  const email = clean(operator.email || existingProfile.email).toLowerCase();
  const displayName = clean(existingProfile.display_name || operator.display_name || operator.full_name || operator.name || email.split("@")[0]);
  const skills = Array.isArray(existingProfile.skills) && existingProfile.skills.length
    ? existingProfile.skills
    : splitList(operator.skills || operator.specialties);
  const role = clean(existingProfile.role_type || existingProfile.role || operator.role_type || operator.role);
  const status = clean(operator.status || existingProfile.status || "pending").toLowerCase();

  return {
    operator_id: clean(operator.id || existingProfile.operator_id) || null,
    email,
    handle,
    handle_normalized: handle,
    username: clean(existingProfile.username) || handle,
    full_name: clean(existingProfile.full_name) || displayName,
    display_name: displayName,
    role_type: role || null,
    role: clean(existingProfile.role) || role || null,
    skills,
    status,
    approved_at: existingProfile.approved_at || operator.approved_at || (["active", "approved"].includes(status) ? new Date().toISOString() : null),
    payout_percentage: operator.payout_percentage ?? existingProfile.payout_percentage ?? null,
    updated_at: new Date().toISOString()
  };
}

async function upsertProfilePayload(payload) {
  let activePayload = { ...payload };
  const droppedColumns = [];
  const maxAttempts = Object.keys(activePayload).length + 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const rows = await supabaseFetch("operator_profiles?on_conflict=email", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(activePayload)
      });
      return {
        profile: Array.isArray(rows) ? rows[0] : rows,
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
  return { profile: null, persisted_fields: [], skipped_missing_columns: droppedColumns };
}

async function syncOperatorProfile(operator = {}) {
  const email = clean(operator.email).toLowerCase();
  if (!email) return { success: false, reason: "missing_email" };
  const existingProfile = await findOperatorProfileForOperator(operator);
  const handle = await uniqueHandleForOperator(operator, existingProfile);
  const payload = buildProfilePayload(operator, existingProfile || {}, handle);
  const result = await upsertProfilePayload(payload);
  return {
    success: Boolean(result.profile),
    operator_id: clean(operator.id || operator.operator_id) || null,
    email,
    handle,
    profile: result.profile,
    persisted_fields: result.persisted_fields,
    skipped_missing_columns: result.skipped_missing_columns
  };
}

async function syncAllOperatorProfiles({ limit = 500 } = {}) {
  const operators = await safeRows(`operators?select=*&order=created_at.desc&limit=${Number(limit) || 500}`);
  const results = [];
  for (const operator of operators) {
    results.push(await syncOperatorProfile(operator).catch((error) => ({
      success: false,
      email: clean(operator.email).toLowerCase(),
      reason: error.message
    })));
  }
  return {
    success: results.every((result) => result.success !== false),
    attempted: operators.length,
    created_or_synced: results.filter((result) => result.success).length,
    results
  };
}

module.exports = {
  syncAllOperatorProfiles,
  syncOperatorProfile
};
