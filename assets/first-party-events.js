(function () {
  var endpoint = "/api/track-event";
  var aliases = {
    "ask visitor": "page_view",
    "qr visitor": "page_view",
    "start opened": "ask_started",
    "start task submitted": "ask_submitted",
    "task submitted": "ask_submitted",
    "review opened": "review_opened",
    "approve_start_clicked": "approve_start_clicked",
    "secure_checkout_viewed": "secure_checkout_viewed",
    "secure_checkout_started": "secure_checkout_started",
    "payment_link_opened": "payment_link_clicked",
    "workspace opened": "workspace_opened"
  };

  function sessionId() {
    try {
      var key = "doneovernight:event_session";
      var current = window.sessionStorage.getItem(key);
      if (current) return current;
      var next = "anon_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(key, next);
      return next;
    } catch (error) {
      return "";
    }
  }

  function clean(value, limit) {
    return String(value || "").trim().slice(0, limit || 160);
  }

  function safeRoute(value, fallback) {
    if (!value && !fallback) return "";
    try {
      var url = new URL(value || fallback || window.location.href, window.location.origin);
      return (url.hostname + url.pathname).replace(/\/+$/, "") || "/";
    } catch (error) {
      return clean(value || fallback || window.location.pathname, 200).split("?")[0].split("#")[0];
    }
  }

  function eventType(name) {
    var raw = clean(name, 80);
    var normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return aliases[raw.toLowerCase()] || aliases[normalized] || normalized;
  }

  function safeMetadata(props) {
    var output = {};
    Object.keys(props || {}).forEach(function (key) {
      var safeKey = clean(key, 48).replace(/[^a-zA-Z0-9_:-]/g, "");
      var safeValue = clean(props[key], 120).replace(/[\r\n\t]/g, " ");
      if (!safeKey || !safeValue || /@/.test(safeValue) || /token/i.test(safeKey) || /token/i.test(safeValue)) return;
      output[safeKey] = safeValue;
    });
    return output;
  }

  function send(name, props) {
    try {
      var payload = {
        event_type: eventType(name),
        task_id: clean((props || {}).task_id || (props || {}).taskId || (props || {}).reference, 100),
        source: clean((props || {}).source || (props || {}).page || window.location.hostname, 100),
        route: safeRoute((props || {}).route, window.location.href),
        referrer: safeRoute(document.referrer, ""),
        session_id: sessionId(),
        metadata: safeMetadata(props || {})
      };
      if (!payload.event_type) return;
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: body,
        keepalive: true
      }).catch(function () {});
    } catch (error) {}
  }

  window.trackEvent = send;

  if (!window.__doneovernightPageViewTracked) {
    window.__doneovernightPageViewTracked = true;
    send("page_view", {
      source: window.location.hostname,
      route: window.location.href
    });
  }
})();
