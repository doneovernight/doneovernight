function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEnvironment(value) {
  const env = clean(value).toLowerCase();
  if (env === "production" || env === "prod") return "production";
  if (env === "preview" || env === "staging" || env === "stage") return "preview";
  if (env === "local" || env === "development" || env === "dev" || env === "test") return "local";
  return "";
}

function runtimeEnvironment() {
  const explicit = normalizeEnvironment(process.env.CREATOR_OS_ENV);
  if (explicit) return explicit;

  const vercel = normalizeEnvironment(process.env.VERCEL_ENV);
  if (vercel) return vercel;

  const node = normalizeEnvironment(process.env.NODE_ENV);
  if (node === "production") return "production";
  return "local";
}

function configuredSupabase() {
  return {
    url: clean(process.env.SUPABASE_URL).replace(/\/+$/, ""),
    serviceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

function supabaseProjectRef() {
  const { url } = configuredSupabase();
  if (!url) return "";
  try {
    const host = new URL(url).hostname.toLowerCase();
    const suffix = ".supabase.co";
    if (!host.endsWith(suffix)) return "";
    const ref = host.slice(0, -suffix.length);
    return /^[a-z0-9-]+$/.test(ref) ? ref : "";
  } catch {
    return "";
  }
}

function creatorMediaBucket() {
  return clean(process.env.CREATOR_MEDIA_BUCKET) || "creator-media";
}

function declaredDatabaseEnvironment() {
  return normalizeEnvironment(
    process.env.CREATOR_OS_DATABASE_ENV ||
    process.env.SUPABASE_PROJECT_ENV ||
    process.env.SUPABASE_ENV
  );
}

function databaseEnvironment() {
  const { url, serviceRoleKey } = configuredSupabase();
  if (!url || !serviceRoleKey) return "missing";

  const runtime = runtimeEnvironment();
  const declared = declaredDatabaseEnvironment();
  if (declared === "production" || declared === "preview") return declared;

  if (runtime === "production") return "production";
  return "missing";
}

function storageEnvironment() {
  return databaseEnvironment();
}

function previewSupabaseConfigured() {
  if (runtimeEnvironment() !== "preview" || databaseEnvironment() !== "preview") return false;
  if (clean(process.env.CREATOR_MEDIA_BUCKET) !== "creator-media") return false;
  const expectedPreviewRef = clean(process.env.CREATOR_OS_PREVIEW_SUPABASE_PROJECT_REF).toLowerCase();
  return !expectedPreviewRef || supabaseProjectRef() === expectedPreviewRef;
}

function writeSafety() {
  const runtime = runtimeEnvironment();
  const database = databaseEnvironment();
  const explicitBucket = clean(process.env.CREATOR_MEDIA_BUCKET);
  const expectedPreviewRef = clean(process.env.CREATOR_OS_PREVIEW_SUPABASE_PROJECT_REF).toLowerCase();
  const actualProjectRef = supabaseProjectRef();
  if (runtime === "preview" && database !== "preview") {
    return {
      status: "blocked",
      writes_allowed: false,
      reason: "Preview Supabase is not configured."
    };
  }
  if (runtime === "preview" && explicitBucket !== "creator-media") {
    return {
      status: "blocked",
      writes_allowed: false,
      reason: "Preview Creator media bucket must be CREATOR_MEDIA_BUCKET=creator-media."
    };
  }
  if (runtime === "preview" && expectedPreviewRef && actualProjectRef !== expectedPreviewRef) {
    return {
      status: "blocked",
      writes_allowed: false,
      reason: "Preview Supabase project ref does not match CREATOR_OS_PREVIEW_SUPABASE_PROJECT_REF."
    };
  }
  if (database === "missing") {
    return {
      status: "blocked",
      writes_allowed: false,
      reason: "Supabase is not configured."
    };
  }
  return {
    status: "safe",
    writes_allowed: true,
    reason: runtime === "preview"
      ? "Preview writes are pinned to a Preview Supabase project."
      : "Writes are allowed for the current Creator OS environment."
  };
}

function creatorOsEnvironment() {
  return {
    environment: runtimeEnvironment(),
    database: databaseEnvironment(),
    storage: storageEnvironment(),
    supabase_project_ref: supabaseProjectRef(),
    bucket: creatorMediaBucket(),
    preview_configured: previewSupabaseConfigured(),
    write_safety: writeSafety()
  };
}

function supabaseConfigError(context = "Supabase") {
  const safety = writeSafety();
  const error = new Error(safety.reason || context + " is not configured");
  error.code = runtimeEnvironment() === "preview" ? "PREVIEW_SUPABASE_NOT_CONFIGURED" : "SUPABASE_NOT_CONFIGURED";
  error.statusCode = 503;
  error.environment = creatorOsEnvironment();
  return error;
}

function getSupabaseRuntimeConfig(context = "Supabase") {
  const { url, serviceRoleKey } = configuredSupabase();
  if (!url || !serviceRoleKey || writeSafety().writes_allowed !== true) {
    throw supabaseConfigError(context);
  }
  return { url, serviceRoleKey };
}

module.exports = {
  creatorOsEnvironment,
  creatorMediaBucket,
  databaseEnvironment,
  getSupabaseRuntimeConfig,
  previewSupabaseConfigured,
  runtimeEnvironment,
  storageEnvironment,
  supabaseProjectRef,
  supabaseConfigError,
  writeSafety
};
