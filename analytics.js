(function () {
  const reported = new Set();

  function postError(payload) {
    const body = JSON.stringify({
      path: location.pathname,
      title: document.title,
      language: navigator.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      ...payload,
    });

    const key = `${payload.source}:${payload.message}:${payload.filename || ""}:${payload.line || ""}`;
    if (reported.has(key)) {
      return;
    }

    reported.add(key);

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/error-report", new Blob([body], { type: "application/json" }));
      return;
    }

    window.fetch("/api/error-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url || args[0] || "");
    const shouldReport =
      !response.ok &&
      url.startsWith("/") &&
      !url.startsWith("/api/track") &&
      !url.startsWith("/api/error-report");

    if (shouldReport) {
      postError({
        source: "fetch",
        level: response.status >= 500 ? "error" : "warning",
        message: `HTTP ${response.status} ${response.statusText || ""}`.trim(),
        filename: url.slice(0, 300),
        context: { status: response.status },
      });
    }

    return response;
  };

  window.addEventListener("error", (event) => {
    postError({
      source: "window.error",
      level: "error",
      message: event.message || "client_error",
      filename: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
      stack: event.error?.stack || "",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    postError({
      source: "unhandledrejection",
      level: "error",
      message: reason?.message || String(reason || "unhandled_rejection"),
      stack: reason?.stack || "",
    });
  });

  const payload = {
    path: location.pathname,
    title: document.title,
    referrer: document.referrer || "",
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen: {
      width: window.screen?.width || 0,
      height: window.screen?.height || 0,
      pixelRatio: window.devicePixelRatio || 1,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    },
  };

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    return;
  }

  fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
})();
