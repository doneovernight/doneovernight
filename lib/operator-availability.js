const { clean } = require("./ops");

const OPERATOR_AVAILABILITY_LABELS = {
  always_available: "Always Available",
  available: "Available",
  busy: "Busy",
  offline: "Offline"
};

function normalizeOperatorAvailability(value) {
  const normalized = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  const key = Object.prototype.hasOwnProperty.call(OPERATOR_AVAILABILITY_LABELS, normalized)
    ? normalized
    : "always_available";
  return { value: key, label: OPERATOR_AVAILABILITY_LABELS[key] };
}

function profileRawPayload(profile = {}) {
  return profile.raw_payload && typeof profile.raw_payload === "object" ? profile.raw_payload : {};
}

function resolveOperatorAvailability(profile = {}, fallbackValue = "") {
  const rawPayload = profileRawPayload(profile);
  const rawValue = rawPayload.operator_availability || rawPayload.availability_status || rawPayload.availability;
  const profileValue = profile.operator_availability || profile.availability_status || profile.availability;
  const availability = normalizeOperatorAvailability(rawValue || profileValue || fallbackValue);
  const source = rawValue
    ? "raw_payload"
    : profileValue
      ? "operator_profiles"
      : fallbackValue
        ? "fallback"
        : "default";
  return {
    ...availability,
    source,
    updated_at: rawPayload.operator_availability_updated_at || profile.operator_availability_updated_at || null
  };
}

function buildOperatorAvailabilityRawPayload(profile = {}, availability, timestamp) {
  const rawPayload = profileRawPayload(profile);
  const normalized = normalizeOperatorAvailability(availability?.value || availability || rawPayload.operator_availability);
  return {
    ...rawPayload,
    operator_availability: normalized.value,
    operator_availability_label: normalized.label,
    operator_availability_updated_at: timestamp,
    operator_availability_source: "operator_os"
  };
}

module.exports = {
  OPERATOR_AVAILABILITY_LABELS,
  normalizeOperatorAvailability,
  resolveOperatorAvailability,
  buildOperatorAvailabilityRawPayload
};
