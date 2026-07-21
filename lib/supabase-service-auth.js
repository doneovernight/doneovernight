function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function decodeLegacyRole(value) {
  try {
    const payload = clean(value).split(".")[1] || "";
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return clean(JSON.parse(Buffer.from(padded, "base64").toString("utf8")).role);
  } catch (error) {
    return "";
  }
}

function isOpaqueServiceKey(value) {
  return /^sb_secret_[A-Za-z0-9_-]+$/.test(clean(value));
}

function isSupabaseServiceCredential(value) {
  return isOpaqueServiceKey(value) || decodeLegacyRole(value) === "service_role";
}

function supabaseServiceHeaders(value, extra = {}) {
  const key = clean(value);
  return {
    apikey: key,
    ...(isOpaqueServiceKey(key) ? {} : { Authorization: `Bearer ${key}` }),
    ...extra
  };
}

module.exports = {
  isOpaqueServiceKey,
  isSupabaseServiceCredential,
  supabaseServiceHeaders
};
