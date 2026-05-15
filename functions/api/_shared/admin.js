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

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isAdminAuthorized(request, env) {
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
