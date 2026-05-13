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

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) {
    return json({ ok: false, error: "missing_admin_password" }, { status: 500 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  if (body.password !== env.ADMIN_PASSWORD) {
    return json({ ok: false }, { status: 401 });
  }

  const expires = Date.now() + 1000 * 60 * 60 * 8;
  const signature = await sha256(`${expires}.${env.ADMIN_PASSWORD}`);
  const token = `${expires}.${signature}`;

  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": `admin_session=${token}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`,
      },
    },
  );
}
