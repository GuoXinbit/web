import { isAdminAuthorized, json } from "./_shared/admin.js";
import { getProviderConfig } from "./_shared/site-config.js";

export async function onRequestGet({ request, env }) {
  if (!(await isAdminAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  const provider = await getProviderConfig(env);

  if (!provider.deepseekApiKey) {
    return json({ ok: false, error: "missing_deepseek_api_key" }, { status: 400 });
  }

  const response = await fetch(`${provider.deepseekBaseUrl}/user/balance`, {
    headers: {
      authorization: `Bearer ${provider.deepseekApiKey}`,
      "content-type": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json({ ok: false, error: data?.error?.message || "balance_failed" }, { status: 500 });
  }

  return json({ ok: true, balance: data });
}
