import { isEnglishAuthorized, json } from "../../_shared/english.js";

export async function onRequestGet({ request, env, params }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  const id = String(params.id || "").trim();

  if (!/^[a-f0-9-]{20,}$/i.test(id)) {
    return json({ ok: false, error: "invalid_job_id" }, { status: 400 });
  }

  const job = await env.STATS.get(`english-job:${id}`, "json");

  if (!job) {
    return json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  return json({ ok: true, job });
}
