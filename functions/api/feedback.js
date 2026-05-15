import { json } from "./_shared/admin.js";
import { getProviderConfig } from "./_shared/site-config.js";

function clean(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function getIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
}

function getGeo(request) {
  const cf = request.cf || {};
  return {
    country: clean(cf.country, 80),
    region: clean(cf.region, 120),
    city: clean(cf.city, 120),
    timezone: clean(cf.timezone, 120),
  };
}

function formatGeo(geo) {
  return [geo?.country, geo?.region, geo?.city].filter(Boolean).join(" / ") || "-";
}

async function sendFeedbackEmail(env, record) {
  const provider = await getProviderConfig(env);

  if (!provider.resendApiKey || !provider.errorAlertFrom || !provider.errorAlertTo) {
    return { sent: false, reason: "missing_email_config" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: provider.errorAlertFrom,
      to: provider.errorAlertTo.split(",").map((item) => item.trim()).filter(Boolean),
      subject: "[hacker666] 用户反馈",
      text: [
        `时间: ${record.createdAt}`,
        `页面: ${record.page || "-"}`,
        `IP: ${record.ip || "-"}`,
        `归属: ${formatGeo(record.geo)}`,
        `联系方式: ${record.contact || "-"}`,
        "",
        record.message,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: `email_${response.status}` };
  }

  return { sent: true };
}

export async function onRequestPost({ request, env }) {
  let body = {};

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const message = clean(body.message);
  if (message.length < 2) {
    return json({ ok: false, error: "empty_message" }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    createdAt,
    message,
    contact: clean(body.contact, 300),
    page: clean(body.page, 500),
    title: clean(body.title, 300),
    language: clean(body.language, 80),
    timezone: clean(body.timezone, 120),
    ip: getIp(request),
    geo: getGeo(request),
    userAgent: clean(request.headers.get("user-agent"), 1000),
  };

  let email = { sent: false, reason: "not_sent" };

  if (env.STATS) {
    await env.STATS.put(`feedback:${createdAt}:${record.id}`, JSON.stringify(record));
  }

  try {
    email = await sendFeedbackEmail(env, record);
  } catch (error) {
    email = { sent: false, reason: error?.message || "email_failed" };
  }

  return json({ ok: true, email });
}
