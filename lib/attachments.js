const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseStorageConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase storage signing is not configured");
    error.code = "SUPABASE_STORAGE_SIGNING_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return { url, serviceRoleKey };
}

function encodeStoragePath(path) {
  return String(path || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

function buildSupabaseSignedUrl(baseUrl, signedPath) {
  const url = String(baseUrl || "").replace(/\/+$/, "");
  const path = clean(signedPath);
  if (!url || !path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/storage/v1/")) return `${url}${path}`;
  if (path.startsWith("/object/")) return `${url}/storage/v1${path}`;
  return `${url}${path.startsWith("/") ? "" : "/"}${path}`;
}

function normalizeStorageReference(bucket, path) {
  let cleanBucket = clean(bucket);
  let cleanPath = clean(path);
  if (!cleanPath) return { bucket: cleanBucket, path: "" };

  cleanPath = cleanPath.split("?")[0].replace(/^\/+/, "");
  cleanPath = cleanPath.replace(/^storage\/v1\//, "");

  const objectRoute = cleanPath.match(/^object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
  if (objectRoute) {
    cleanBucket = cleanBucket || decodeURIComponent(objectRoute[1]);
    cleanPath = objectRoute[2];
  }

  if (cleanBucket && cleanPath.startsWith(`${cleanBucket}/`)) {
    cleanPath = cleanPath.slice(cleanBucket.length + 1);
  }

  return { bucket: cleanBucket, path: cleanPath };
}

function safeStorageErrorText(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/apikey[=:]\s*["']?[A-Za-z0-9._-]+/gi, "apikey=[redacted]")
    .slice(0, 300);
}

async function createSignedAttachmentUrl(bucket, path, options = {}) {
  const { bucket: cleanBucket, path: cleanPath } = normalizeStorageReference(bucket, path);
  if (!cleanBucket || !cleanPath) return "";

  const { url, serviceRoleKey } = getSupabaseStorageConfig();
  const expiresIn = Math.max(60, Number(options.expiresIn || DEFAULT_SIGNED_URL_TTL_SECONDS));
  const response = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(cleanBucket)}/${encodeStoragePath(cleanPath)}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ expiresIn })
  });

  if (!response.ok) {
    const error = new Error(`Supabase attachment signing failed: ${response.status}`);
    error.statusCode = response.status;
    error.detail = safeStorageErrorText(await response.text().catch(() => ""));
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  const signedUrl = data?.signedURL || data?.signedUrl || "";
  return buildSupabaseSignedUrl(url, signedUrl);
}

function normalizeAttachmentRecord(item = {}) {
  if (typeof item === "string") return { name: clean(item) };
  if (!item || typeof item !== "object") return null;
  const storageReference = normalizeStorageReference(item.bucket, item.storage_path || item.path);
  const bucket = storageReference.bucket;
  const path = storageReference.path;
  const filename = clean(item.filename || item.file_name || item.name);
  const mimeType = clean(item.mime_type || item.type || item.file_type);
  const durable = {
    name: clean(item.name || filename || item.title || "Attachment"),
    filename,
    mime_type: mimeType,
    type: mimeType,
    size: Number.isFinite(Number(item.size || item.file_size)) ? Number(item.size || item.file_size) : null,
    bucket,
    path,
    storage_path: path,
    uploaded_at: clean(item.uploaded_at || item.created_at || item.timestamp)
  };
  return Object.fromEntries(Object.entries(durable).filter(([, value]) => value !== "" && value !== null));
}

async function withFreshAttachmentUrls(value, options = {}) {
  if (!Array.isArray(value)) return [];
  return Promise.all(value.map(async (item) => {
    const attachment = normalizeAttachmentRecord(item);
    if (!attachment?.name) return null;
    const freshUrl = attachment.bucket && attachment.path
      ? await createSignedAttachmentUrl(attachment.bucket, attachment.path, options).catch(() => "")
      : "";
    const fallbackUrl = clean(item.signed_url || item.url || item.file_url || item.download_url || item.public_url || item.href);
    const url = freshUrl || fallbackUrl;
    return {
      ...attachment,
      ...(url ? { url, signed_url: url } : {}),
      ...(freshUrl ? {
        signed_url_generated_at: new Date().toISOString(),
        signed_url_expires_in_seconds: Math.max(60, Number(options.expiresIn || DEFAULT_SIGNED_URL_TTL_SECONDS))
      } : {})
    };
  })).then((items) => items.filter(Boolean));
}

async function withFreshTaskAttachmentUrls(task = {}, options = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object"
    ? task.raw_payload
    : task.rawPayload && typeof task.rawPayload === "object"
      ? task.rawPayload
      : {};
  const attachmentFields = ["attachments", "files", "uploaded_files", "file_uploads"];
  const signedRawPayload = { ...rawPayload };

  await Promise.all(attachmentFields.map(async (field) => {
    if (Array.isArray(rawPayload[field])) {
      signedRawPayload[field] = await withFreshAttachmentUrls(rawPayload[field], options);
    }
  }));

  const signedAttachments = Array.isArray(task.attachments)
    ? await withFreshAttachmentUrls(task.attachments, options)
    : signedRawPayload.attachments || [];

  return {
    ...task,
    attachments: signedAttachments,
    raw_payload: signedRawPayload,
    rawPayload: signedRawPayload
  };
}

module.exports = {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  createSignedAttachmentUrl,
  normalizeAttachmentRecord,
  withFreshAttachmentUrls,
  withFreshTaskAttachmentUrls
};
