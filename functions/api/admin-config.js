import { createAdminSession, hashAdminPassword, isAdminAuthorized, json } from "./_shared/admin.js";
import { getPublicSiteConfig, writeSiteConfig } from "./_shared/site-config.js";

const ALLOWED_KEYS = new Set([
  "deepseekBaseUrl",
  "deepseekApiKey",
  "maimemoToken",
  "resendApiKey",
  "errorAlertFrom",
  "errorAlertTo",
  "maintenanceEnabled",
  "maintenanceMessage",
]);

function pickAllowed(input) {
  const output = {};

  for (const key of ALLOWED_KEYS) {
    if (Object.hasOwn(input, key)) {
      output[key] = input[key];
    }
  }

  return output;
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdminAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  return json({ ok: true, config: await getPublicSiteConfig(env) });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdminAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const updates = pickAllowed(body);
  const password = String(body.adminPassword || "").trim();
  const passwordChanged = password.length > 0;

  if (passwordChanged) {
    Object.assign(updates, await hashAdminPassword(password));
  }

  await writeSiteConfig(env, updates);
  if (Object.hasOwn(updates, "maimemoToken")) {
    await env.STATS?.delete("english-today-cache");
  }

  const headers = {};
  if (passwordChanged) {
    const token = await createAdminSession(env);
    headers["set-cookie"] = `admin_session=${token}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
  }

  return json({ ok: true, config: await getPublicSiteConfig(env) }, { headers });
}
