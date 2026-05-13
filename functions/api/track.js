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

export async function onRequestPost({ request, env }) {
  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  let payload = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const now = new Date();
  const userAgent = request.headers.get("user-agent") || "";
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";

  const event = {
    time: now.toISOString(),
    ip,
    path: String(payload.path || "/").slice(0, 300),
    title: String(payload.title || "").slice(0, 200),
    referrer: String(payload.referrer || "").slice(0, 500),
    language: String(payload.language || "").slice(0, 80),
    timezone: String(payload.timezone || "").slice(0, 120),
    screen: payload.screen || null,
    device: detectDevice(userAgent),
    userAgent: userAgent.slice(0, 500),
  };

  const key = `event:${event.time}:${crypto.randomUUID()}`;
  await env.STATS.put(key, JSON.stringify(event));

  return json({ ok: true });
}
