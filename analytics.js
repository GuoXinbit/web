(function () {
  const reported = new Set();

  function createFeedbackWidget() {
    if (document.querySelector("[data-feedback-widget]")) {
      return;
    }

    const widget = document.createElement("div");
    widget.className = "feedback-widget";
    widget.dataset.feedbackWidget = "true";
    widget.innerHTML = `
      <button class="feedback-trigger" type="button" data-feedback-open>反馈</button>
      <form class="feedback-panel is-hidden" data-feedback-panel>
        <div>
          <strong>反馈</strong>
          <button type="button" aria-label="关闭反馈" data-feedback-close>×</button>
        </div>
        <textarea name="message" rows="4" required placeholder="请写下你遇到的问题或建议"></textarea>
        <input name="contact" type="text" autocomplete="off" placeholder="联系方式（可选）" />
        <button class="primary-button" type="submit">发送反馈</button>
        <p class="form-message" data-feedback-message></p>
      </form>
    `;

    document.body.append(widget);

    const panel = widget.querySelector("[data-feedback-panel]");
    const message = widget.querySelector("[data-feedback-message]");
    const submit = widget.querySelector("button[type='submit']");

    widget.querySelector("[data-feedback-open]").addEventListener("click", () => {
      panel.classList.toggle("is-hidden");
    });

    widget.querySelector("[data-feedback-close]").addEventListener("click", () => {
      panel.classList.add("is-hidden");
    });

    panel.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = "正在发送...";

      try {
        const form = new FormData(panel);
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: form.get("message"),
            contact: form.get("contact"),
            page: location.pathname,
            title: document.title,
            language: navigator.language || "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          }),
        });

        if (!response.ok) {
          throw new Error("feedback_failed");
        }

        panel.reset();
        message.textContent = "已发送，谢谢。";
        setTimeout(() => panel.classList.add("is-hidden"), 900);
      } catch {
        message.textContent = "发送失败，请稍后再试。";
      } finally {
        submit.disabled = false;
      }
    });
  }

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
    const pathname = (() => {
      try {
        return new URL(url, location.origin).pathname;
      } catch {
        return url;
      }
    })();
    const expectedClientStatus =
      (response.status === 401 && pathname === "/api/english/latest") ||
      (response.status === 429 && pathname === "/api/english/generate");
    const shouldReport =
      !response.ok &&
      !expectedClientStatus &&
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
  const bootFeedback = () => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createFeedbackWidget, { once: true });
    } else {
      createFeedbackWidget();
    }
  };

  bootFeedback();

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
