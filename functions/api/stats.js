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

async function readRecentRecords(env, keys, limit) {
  const selected = [...keys]
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, limit);

  const records = await Promise.all(selected.map((key) => env.STATS.get(key.name, "json")));
  return records.filter(Boolean);
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
  const englishFetchList = await env.STATS.list({ prefix: "english-fetch:", limit: 1000 });
  const englishArticleList = await env.STATS.list({ prefix: "english-article:", limit: 1000 });
  const englishAttemptList = await env.STATS.list({ prefix: "english-attempt:", limit: 1000 });
  const [events, recordings, englishRecords] = await Promise.all([
    readRecentRecords(env, list.keys, 240),
    readRecentRecords(env, audioList.keys, 120),
    readRecentRecords(env, [...englishFetchList.keys, ...englishArticleList.keys, ...englishAttemptList.keys], 160),
  ]);

  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  recordings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  englishRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const today = new Date().toISOString().slice(0, 10);
  const uniqueIps = new Set(events.map((event) => event.ip).filter(Boolean));

  return json({
    ok: true,
    summary: {
      total: list.keys.length,
      today: events.filter((event) => event.time?.startsWith(today)).length,
      uniqueIps: uniqueIps.size,
    },
    events: events.slice(0, 200),
    recordings: recordings.slice(0, 100),
    englishRecords: englishRecords.slice(0, 120),
  });
}
