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

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isAuthorized(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return false;
  }

  const token = getCookie(request, "admin_session");
  const [expires, signature] = token.split(".");

  if (!expires || !signature || Number(expires) < Date.now()) {
    return false;
  }

  const expected = await sha256(`${expires}.${env.ADMIN_PASSWORD}`);
  return signature === expected;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const list = await env.STATS.list({ prefix: "event:", limit: 1000 });
  const audioList = await env.STATS.list({ prefix: "audio:", limit: 1000 });
  const events = [];
  const recordings = [];

  for (const key of list.keys) {
    const value = await env.STATS.get(key.name, "json");

    if (value) {
      events.push(value);
    }
  }

  for (const key of audioList.keys) {
    const value = await env.STATS.get(key.name, "json");

    if (value) {
      recordings.push(value);
    }
  }

  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  recordings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const today = new Date().toISOString().slice(0, 10);
  const uniqueIps = new Set(events.map((event) => event.ip).filter(Boolean));

  return json({
    ok: true,
    summary: {
      total: events.length,
      today: events.filter((event) => event.time?.startsWith(today)).length,
      uniqueIps: uniqueIps.size,
    },
    events: events.slice(0, 200),
    recordings: recordings.slice(0, 100),
  });
}
