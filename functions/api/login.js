import { createAdminSession, json, verifyAdminPassword } from "./_shared/admin.js";

export async function onRequestPost({ request, env }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  if (!(await verifyAdminPassword(env, String(body.password || "")))) {
    return json({ ok: false }, { status: 401 });
  }

  const token = await createAdminSession(env);

  if (!token) {
    return json({ ok: false, error: "missing_admin_password" }, { status: 500 });
  }

  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": `admin_session=${token}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`,
      },
    },
  );
}
