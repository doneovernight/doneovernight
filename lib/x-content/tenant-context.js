const { AsyncLocalStorage } = require("node:async_hooks");

const workspaceStorage = new AsyncLocalStorage();
const SEEDED_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const SEEDED_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const SEEDED_X_USER_ID = "2037306333813235713";
const FEATURE_FLAG = "X_WORKSPACE_SCOPING_ENABLED";

function clean(value) { return typeof value === "string" ? value.trim() : ""; }

function workspaceScopingEnabled(env = process.env) {
  return String(env[FEATURE_FLAG] || "false").toLowerCase() === "true";
}

function testContextEnabled(env = process.env) {
  return String(env.X_CONTENT_ALLOW_TEST_CONTEXT || "false").toLowerCase() === "true"
    || String(env.NODE_ENV || "").toLowerCase() === "test";
}

function validateContext(context) {
  const workspaceId = clean(context?.workspaceId);
  if (!workspaceId) {
    const error = new Error("Workspace context is required");
    error.code = "WORKSPACE_CONTEXT_REQUIRED";
    throw error;
  }
  return {
    workspaceId,
    organizationId: clean(context.organizationId) || null,
    principalId: clean(context.principalId) || null,
    role: clean(context.role) || null,
    xAccountId: clean(context.xAccountId) || null,
    operatorGrant: context.operatorGrant || null,
    compatibility: context.compatibility === true
  };
}

function current() { return workspaceStorage.getStore() || null; }

function operatorGrantActive(grant, now = Date.now()) {
  if (!grant || grant.revoked_at) return false;
  const expires = new Date(grant.expires_at).getTime();
  return Number.isFinite(expires) && expires > now;
}

function requireCurrent() {
  const active = current();
  if (active) return active;
  if (testContextEnabled()) return validateContext({ workspaceId: SEEDED_WORKSPACE_ID, principalId: "test", role: "owner" });
  const error = new Error("Workspace context is required before using the X repository");
  error.code = "WORKSPACE_CONTEXT_REQUIRED";
  throw error;
}

function run(context, callback) {
  return workspaceStorage.run(validateContext(context), callback);
}

function seededCompatibilityContext() {
  return validateContext({
    organizationId: SEEDED_ORGANIZATION_ID,
    workspaceId: SEEDED_WORKSPACE_ID,
    principalId: "doneovernight-legacy-admin",
    role: "owner",
    xAccountId: null,
    compatibility: true
  });
}

function resolveBoundaryContext({ workspaceId, principalId, role, operatorGrant, compatibility = false } = {}) {
  if (compatibility) return seededCompatibilityContext();
  if (!workspaceScopingEnabled()) return seededCompatibilityContext();
  const context = validateContext({ workspaceId, principalId, role, operatorGrant });
  if (context.role === "operator" && !operatorGrantActive(context.operatorGrant)) {
    const error = new Error("An active operator grant is required");
    error.code = "WORKSPACE_OPERATOR_GRANT_REQUIRED";
    throw error;
  }
  return context;
}

module.exports = {
  FEATURE_FLAG,
  SEEDED_ORGANIZATION_ID,
  SEEDED_WORKSPACE_ID,
  SEEDED_X_USER_ID,
  workspaceScopingEnabled,
  operatorGrantActive,
  current,
  requireCurrent,
  run,
  resolveBoundaryContext,
  seededCompatibilityContext,
  validateContext
};
