const CONFIG_KEY = "site-config";

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function maskSecret(value) {
  const text = String(value || "");

  if (!text) {
    return "";
  }

  return text.length <= 8 ? "********" : `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export async function readSiteConfig(env) {
  if (!env.STATS) {
    return {};
  }

  return (await env.STATS.get(CONFIG_KEY, "json")) || {};
}

export async function writeSiteConfig(env, updates = {}) {
  const current = await readSiteConfig(env);
  const next = {
    ...current,
    updatedAt: new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string" && !value.trim()) {
      continue;
    }

    next[key] = clean(value, key.includes("Token") || key.includes("Key") ? 3000 : 500);
  }

  await env.STATS.put(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export async function getProviderConfig(env) {
  const config = await readSiteConfig(env);

  return {
    deepseekApiKey: config.deepseekApiKey || env.DEEPSEEK_API_KEY || "",
    deepseekBaseUrl: (config.deepseekBaseUrl || env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    deepseekFastModel: config.deepseekFastModel || env.DEEPSEEK_FAST_MODEL || "deepseek-v4-flash",
    deepseekStandardModel: config.deepseekStandardModel || env.DEEPSEEK_STANDARD_MODEL || "deepseek-v4-pro",
    deepseekThinkingModel: config.deepseekThinkingModel || env.DEEPSEEK_THINKING_MODEL || "deepseek-v4-pro",
    deepseekFinalModel: config.deepseekFinalModel || env.DEEPSEEK_FINAL_MODEL || "deepseek-v4-flash",
    deepseekTranslateModel: config.deepseekTranslateModel || env.DEEPSEEK_TRANSLATE_MODEL || "deepseek-v4-flash",
    resendApiKey: config.resendApiKey || env.RESEND_API_KEY || "",
    errorAlertFrom: config.errorAlertFrom || env.ERROR_ALERT_FROM || "",
    errorAlertTo: config.errorAlertTo || env.ERROR_ALERT_TO || "",
  };
}

export async function getPublicSiteConfig(env) {
  const config = await readSiteConfig(env);
  const provider = await getProviderConfig(env);

  return {
    updatedAt: config.updatedAt || "",
    deepseekBaseUrl: provider.deepseekBaseUrl,
    deepseekFastModel: provider.deepseekFastModel,
    deepseekStandardModel: provider.deepseekStandardModel,
    deepseekThinkingModel: provider.deepseekThinkingModel,
    deepseekFinalModel: provider.deepseekFinalModel,
    deepseekTranslateModel: provider.deepseekTranslateModel,
    deepseekApiKeySet: Boolean(provider.deepseekApiKey),
    deepseekApiKeyMasked: maskSecret(provider.deepseekApiKey),
    errorAlertFrom: provider.errorAlertFrom,
    errorAlertTo: provider.errorAlertTo,
    resendApiKeySet: Boolean(provider.resendApiKey),
    resendApiKeyMasked: maskSecret(provider.resendApiKey),
  };
}
