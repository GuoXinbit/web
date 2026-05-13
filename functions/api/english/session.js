import { json, sha256 } from "../_shared/english.js";

export async function onRequestPost({ request, env }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  const password = env.ENGLISH_PASSWORD || "1001";

  if (body.password !== password) {
    return json({ ok: false }, { status: 401 });
  }

  const expires = Date.now() + 1000 * 60 * 60 * 12;
  const signature = await sha256(`${expires}.${password}`);

  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": `english_session=${expires}.${signature}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict`,
      },
    },
  );
}
