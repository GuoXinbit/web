import { getProviderConfig } from "./_shared/site-config.js";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function sanitize(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function detectDevice(userAgent) {
  const ua = userAgent.toLowerCase();

  if (/ipad|tablet|playbook|silk/.test(ua)) {
    return "tablet";
  }

  if (/mobile|iphone|android/.test(ua)) {
    return "mobile";
  }

  return "desktop";
}

function getGeo(request) {
  const cf = request.cf || {};
  return {
    country: sanitize(cf.country || "", 80),
    region: sanitize(cf.region || "", 120),
    city: sanitize(cf.city || "", 120),
    timezone: sanitize(cf.timezone || "", 120),
  };
}

function formatGeo(geo) {
  return [geo?.country, geo?.region, geo?.city].filter(Boolean).join(" / ") || "-";
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendAlertEmail(env, errorRecord) {
  const provider = await getProviderConfig(env);

  if (!provider.resendApiKey || !provider.errorAlertFrom || !provider.errorAlertTo) {
    return { sent: false, reason: "missing_email_config" };
  }

  const subject = `[hacker666] ${errorRecord.level.toUpperCase()} ${errorRecord.source}: ${errorRecord.message.slice(0, 80)}`;
  const body = [
    "hacker666.com 捕获到线上错误：",
    "",
    `时间: ${errorRecord.time}`,
    `级别: ${errorRecord.level}`,
    `来源: ${errorRecord.source}`,
    `页面: ${errorRecord.path}`,
    `IP: ${errorRecord.ip || "-"}`,
    `归属: ${formatGeo(errorRecord.geo)}`,
    `设备: ${errorRecord.device}`,
    `消息: ${errorRecord.message}`,
    `文件: ${errorRecord.filename || "-"}`,
    `位置: ${errorRecord.line || "-"}:${errorRecord.column || "-"}`,
    "",
    "堆栈:",
    errorRecord.stack || "-",
    "",
    `User-Agent: ${errorRecord.userAgent || "-"}`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: provider.errorAlertFrom,
      to: provider.errorAlertTo.split(",").map((item) => item.trim()).filter(Boolean),
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    const data = await response.text().catch(() => "");
    return { sent: false, reason: data.slice(0, 300) || "email_failed" };
  }

  return { sent: true };
}

export async function onRequestPost({ request, env }) {
  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  let payload = {};

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const now = new Date();
  const userAgent = request.headers.get("user-agent") || "";
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";
  const message = sanitize(payload.message || payload.reason || "unknown_error", 800);
  const source = sanitize(payload.source || "client", 80);
  const fingerprint = await sha256(`${source}:${message}:${sanitize(payload.path, 200)}`);
  const rateKey = `error-alert-rate:${fingerprint}`;
  const rateLimited = Boolean(await env.STATS.get(rateKey));

  const errorRecord = {
    id: crypto.randomUUID(),
    time: now.toISOString(),
    level: sanitize(payload.level || "error", 40),
    source,
    message,
    path: sanitize(payload.path || "/", 300),
    title: sanitize(payload.title || "", 200),
    filename: sanitize(payload.filename || "", 300),
    line: Number(payload.line || 0) || null,
    column: Number(payload.column || 0) || null,
    stack: sanitize(payload.stack || "", 4000),
    context: payload.context && typeof payload.context === "object" ? payload.context : null,
    ip,
    geo: getGeo(request),
    device: detectDevice(userAgent),
    userAgent: userAgent.slice(0, 500),
    fingerprint,
    email: { sent: false, rateLimited },
  };

  if (!rateLimited) {
    const emailResult = await sendAlertEmail(env, errorRecord).catch((error) => ({
      sent: false,
      reason: sanitize(error?.message || "email_exception", 300),
    }));
    errorRecord.email = { ...emailResult, rateLimited: false };
    await env.STATS.put(rateKey, now.toISOString(), { expirationTtl: 900 });
  }

  const key = `error:${errorRecord.time}:${errorRecord.id}`;
  await env.STATS.put(key, JSON.stringify(errorRecord));

  return json({ ok: true, emailed: errorRecord.email.sent, rateLimited });
}
