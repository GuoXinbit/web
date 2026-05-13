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

export async function onRequestGet({ request, env, params }) {
  if (!(await isAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const list = await env.STATS.list({ prefix: "audio:", limit: 1000 });
  let recording = null;

  for (const key of list.keys) {
    const value = await env.STATS.get(key.name, "json");
    if (value?.id === params.id) {
      recording = value;
      break;
    }
  }

  if (!recording) {
    return json({ ok: false }, { status: 404 });
  }

  const encoded = await env.STATS.get(`audio-data:${recording.id}`);

  if (!encoded) {
    return json({ ok: false }, { status: 404 });
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Response(bytes, {
    headers: {
      "content-type": recording.type || "audio/webm",
      "content-disposition": `attachment; filename="${recording.filename || `${recording.id}.webm`}"`,
      "cache-control": "private, no-store",
    },
  });
}
