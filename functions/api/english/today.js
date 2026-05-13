import { getTodayLearningData, isEnglishAuthorized, json, saveEnglishRecord } from "../_shared/english.js";

export async function onRequestGet({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  try {
    const data = await getTodayLearningData(env);
    await saveEnglishRecord(env, "fetch", {
      type: "fetch",
      createdAt: new Date().toISOString(),
      progress: data.progress,
      counts: data.counts,
      responseDistribution: data.responseDistribution,
      words: data.unfamiliarWords,
      ip: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "",
    });

    return json({ ok: true, ...data, todayItems: undefined });
  } catch (error) {
    await saveEnglishRecord(env, "fetch", {
      type: "fetch",
      createdAt: new Date().toISOString(),
      ok: false,
      error: String(error?.message || error).slice(0, 300),
    });

    return json({ ok: false, error: "today_failed" }, { status: 500 });
  }
}
