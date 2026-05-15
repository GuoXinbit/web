import { createAdminSession, isAdminAuthorized, json } from "./_shared/admin.js";
import { getPublicSiteConfig, resetSiteConfig } from "./_shared/site-config.js";

export async function onRequestPost({ request, env }) {
  if (!(await isAdminAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  await resetSiteConfig(env);
  const token = await createAdminSession(env);

  return json(
    {
      ok: true,
      config: await getPublicSiteConfig(env),
      message: "已恢复 Cloudflare 环境变量默认配置，并清除今日学习缓存。",
    },
    {
      headers: token
        ? {
            "set-cookie": `admin_session=${token}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`,
          }
        : {},
    },
  );
}
