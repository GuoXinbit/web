export function json(data, init = {}) {
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

export async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readConfig(env) {
  if (!env.STATS) {
    return {};
  }

  return (await env.STATS.get("site-config", "json")) || {};
}

async function getAdminSecret(env) {
  const config = await readConfig(env);
  return config.adminPasswordHash || env.ADMIN_PASSWORD || "";
}

export async function hashAdminPassword(password) {
  const salt = crypto.randomUUID();
  return {
    adminPasswordSalt: salt,
    adminPasswordHash: await sha256(`${salt}.${password}`),
  };
}

export async function verifyAdminPassword(env, password) {
  const config = await readConfig(env);

  if (config.adminPasswordHash && config.adminPasswordSalt) {
    return (await sha256(`${config.adminPasswordSalt}.${password}`)) === config.adminPasswordHash;
  }

  return Boolean(env.ADMIN_PASSWORD) && password === env.ADMIN_PASSWORD;
}

export async function createAdminSession(env) {
  const secret = await getAdminSecret(env);

  if (!secret) {
    return "";
  }

  const expires = Date.now() + 1000 * 60 * 60 * 8;
  const signature = await sha256(`${expires}.${secret}`);
  return `${expires}.${signature}`;
}

export async function isAdminAuthorized(request, env) {
  const secret = await getAdminSecret(env);

  if (!secret) {
    return false;
  }

  const token = getCookie(request, "admin_session");
  const [expires, signature] = token.split(".");

  if (!expires || !signature || Number(expires) < Date.now()) {
    return false;
  }

  const expected = await sha256(`${expires}.${secret}`);
  return signature === expected;
}
