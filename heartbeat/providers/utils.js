const DEFAULT_TIMEOUT_MS = 8_000;

function unavailable(source, reason = "Not configured") {
  return {
    source,
    status: "Unavailable",
    reason
  };
}

function healthy(source, detail = {}) {
  return {
    source,
    status: "Healthy",
    ...detail
  };
}

function attention(source, reason, detail = {}) {
  return {
    source,
    status: "Needs attention",
    reason,
    ...detail
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function statusLine(result) {
  if (!result) return "Unavailable";
  if (result.reason) return `${result.status} (${result.reason})`;
  return result.status || "Unavailable";
}

module.exports = {
  attention,
  fetchWithTimeout,
  healthy,
  statusLine,
  unavailable
};
