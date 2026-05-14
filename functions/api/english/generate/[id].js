import { isEnglishAuthorized, json } from "../../_shared/english.js";
import { getModeConfig, runGenerationJob } from "../generate.js";

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

  let job = await env.STATS.get(`english-job:${id}`, "json");

  if (!job) {
    return json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  if (job.status === "queued" || job.status === "running") {
    const updatedAt = new Date(job.updatedAt || job.createdAt || 0).getTime();
    const stale = !Number.isFinite(updatedAt) || Date.now() - updatedAt > 1000 * 60 * 2;

    if (job.status === "queued" || stale) {
      await runGenerationJob(env, id, getModeConfig(job.mode), job.ip || "");
      job = await env.STATS.get(`english-job:${id}`, "json");
    }
  }

  return json({ ok: true, job });
}
