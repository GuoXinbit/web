import { readSiteConfig } from "./api/_shared/site-config.js";

function isAllowedDuringMaintenance(pathname) {
  return (
    pathname === "/admin" ||
    pathname === "/admin.html" ||
    pathname === "/admin.js" ||
    pathname === "/styles.css" ||
    pathname === "/register-sw.js" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/stats") ||
    pathname.startsWith("/api/admin-config") ||
    pathname.startsWith("/api/admin-restore") ||
    pathname.startsWith("/api/deepseek-balance") ||
    pathname.startsWith("/api/error-report") ||
    pathname.startsWith("/api/feedback")
  );
}

function maintenanceHtml(message) {
  const safeMessage = String(message || "网站维护中，请稍后再访问。")
    .replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>维护中 - Hacker666 Tools</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { min-height: 100svh; margin: 0; display: grid; place-items: center; background: #0b0d10; color: #f2f6f8; }
      main { width: min(520px, calc(100% - 32px)); border: 1px solid #2c3541; border-radius: 8px; background: #141920; padding: clamp(22px, 5vw, 36px); }
      p { color: #a5b0ba; line-height: 1.7; }
      a { color: #33d0a2; }
    </style>
  </head>
  <body>
    <main>
      <p>Maintenance</p>
      <h1>网站维护中</h1>
      <p>${safeMessage}</p>
      <p><a href="/admin.html">进入后台</a></p>
    </main>
  </body>
</html>`;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const config = await readSiteConfig(context.env);

  if (!config.maintenanceEnabled || isAllowedDuringMaintenance(url.pathname)) {
    return context.next();
  }

  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ ok: false, error: "maintenance" }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(maintenanceHtml(config.maintenanceMessage), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
