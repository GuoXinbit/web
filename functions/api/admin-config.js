import { isAdminAuthorized, json } from "./_shared/admin.js";
import { getPublicSiteConfig, writeSiteConfig } from "./_shared/site-config.js";

const ALLOWED_KEYS = new Set([
  "deepseekBaseUrl",
  "deepseekApiKey",
  "deepseekFastModel",
  "deepseekStandardModel",
  "deepseekThinkingModel",
  "deepseekFinalModel",
  "deepseekTranslateModel",
  "resendApiKey",
  "errorAlertFrom",
  "errorAlertTo",
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

  await writeSiteConfig(env, pickAllowed(body));
  return json({ ok: true, config: await getPublicSiteConfig(env) });
}
