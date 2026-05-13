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

export function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

export async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isEnglishAuthorized(request, env) {
  const password = env.ENGLISH_PASSWORD || "1001";
  const token = getCookie(request, "english_session");
  const [expires, signature] = token.split(".");

  if (!expires || !signature || Number(expires) < Date.now()) {
    return false;
  }

  const expected = await sha256(`${expires}.${password}`);
  return signature === expected;
}

export async function maimemoPost(env, path, body = {}) {
  if (!env.MAIMEMO_TOKEN) {
    throw new Error("missing_maimemo_token");
  }

  const response = await fetch(`https://open.maimemo.com/open/api/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.MAIMEMO_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data?.success) {
    throw new Error(`maimemo_failed:${path}`);
  }

  return data.data;
}

export async function getTodayLearningData(env) {
  const progressData = await maimemoPost(env, "/study/get_study_progress");
  const progress = progressData.progress || {};
  const total = Math.max(1, Math.min(Number(progress.total || 700), 1000));
  const todayData = await maimemoPost(env, "/study/get_today_items", { limit: total });
  const todayItems = todayData.today_items || [];
  const finishedItems = todayItems.filter((item) => item.is_finished === true);
  const unfamiliarItems = finishedItems.filter((item) => item.first_response !== "FAMILIAR");
  const newUnfamiliarItems = unfamiliarItems.filter((item) => item.is_new === true);
  const reviewUnfamiliarItems = unfamiliarItems.filter((item) => item.is_new !== true);
  const responseDistribution = {};

  for (const item of finishedItems) {
    const key = item.first_response || "UNKNOWN";
    responseDistribution[key] = (responseDistribution[key] || 0) + 1;
  }

  const finished = Number(progress.finished || 0);
  const progressTotal = Number(progress.total || todayItems.length || 0);

  return {
    progress: {
      finished,
      total: progressTotal,
      study_time: Number(progress.study_time || 0),
      percent: progressTotal ? Math.round((finished / progressTotal) * 10000) / 100 : 0,
    },
    counts: {
      fetched: todayItems.length,
      finished: finishedItems.length,
      unfamiliar: unfamiliarItems.length,
      newUnfamiliar: newUnfamiliarItems.length,
      reviewUnfamiliar: reviewUnfamiliarItems.length,
    },
    responseDistribution,
    unfamiliarItems,
    unfamiliarWords: unfamiliarItems.map((item) => item.voc_spelling).filter(Boolean),
    todayItems,
  };
}

export async function saveEnglishRecord(env, type, record) {
  if (!env.STATS) {
    return;
  }

  const createdAt = record.createdAt || new Date().toISOString();
  const id = record.id || crypto.randomUUID();
  await env.STATS.put(`english-${type}:${createdAt}:${id}`, JSON.stringify({ ...record, id, createdAt }));
}
