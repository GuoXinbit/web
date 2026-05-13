import { getTodayLearningData, isEnglishAuthorized, json, saveEnglishRecord } from "../_shared/english.js";

function getOutputText(data) {
  return data.choices?.[0]?.message?.content || "";
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

class RateLimitError extends Error {
  constructor(detail) {
    super("generation_rate_limited");
    this.detail = detail;
  }
}

function getModeConfig(mode) {
  const configs = {
    fast: {
      key: "fast",
      label: "快速",
      model: "deepseek-v4-flash",
      thinking: false,
    },
    standard: {
      key: "standard",
      label: "标准",
      model: "deepseek-v4-pro",
      thinking: false,
    },
    thinking: {
      key: "thinking",
      label: "思考",
      model: "deepseek-v4-pro",
      thinking: true,
    },
  };

  return configs[mode] || configs.fast;
}

function getGenerationWindow(now = new Date()) {
  const hour = 1000 * 60 * 60;
  const shifted = new Date(now.getTime() + 8 * hour - 4 * hour);
  const dayStartMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    -4,
    0,
    0,
    0,
  );

  return {
    dayStartMs,
    dayEndMs: dayStartMs + 24 * hour,
    twoHourStartMs: now.getTime() - 2 * hour,
  };
}

async function getSuccessfulGenerationTimes(env) {
  const saved = await env.STATS.get("english-generation-limit", "json");
  const savedTimes = Array.isArray(saved?.timestamps) ? saved.timestamps : [];
  const articleList = await env.STATS.list({ prefix: "english-article:", limit: 200 });
  const articleRecords = await Promise.all(
    articleList.keys.map((key) => env.STATS.get(key.name, "json")),
  );
  const articleTimes = articleRecords
    .filter((record) => record?.ok === true && record.createdAt)
    .map((record) => record.createdAt);

  return [...new Set([...savedTimes, ...articleTimes])]
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
}

async function assertGenerationAllowed(env, now = new Date()) {
  if (!env.STATS) {
    throw new Error("missing_stats_binding");
  }

  const limitStartsAt = Date.parse(env.ENGLISH_GENERATION_LIMIT_START || "2026-05-14T20:00:00.000Z");

  if (now.getTime() < limitStartsAt) {
    return;
  }

  const times = await getSuccessfulGenerationTimes(env);
  const { dayStartMs, dayEndMs, twoHourStartMs } = getGenerationWindow(now);
  const recentTwoHours = times.filter((time) => time >= twoHourStartMs && time <= now.getTime());
  const todayWindow = times.filter((time) => time >= dayStartMs && time < dayEndMs);

  if (recentTwoHours.length >= 1) {
    throw new RateLimitError("最近 2 小时已经生成过文章，请稍后再试。");
  }

  if (todayWindow.length >= 3) {
    throw new RateLimitError("今天 04:00 到明天 04:00 的生成次数已经达到上限 3 次。");
  }
}

async function recordGenerationSuccess(env, createdAt) {
  const times = await getSuccessfulGenerationTimes(env);
  const cutoff = Date.now() - 1000 * 60 * 60 * 48;
  const timestamps = [...times, new Date(createdAt).getTime()]
    .filter((time) => Number.isFinite(time) && time >= cutoff)
    .sort((a, b) => a - b)
    .map((time) => new Date(time).toISOString());

  await env.STATS.put("english-generation-limit", JSON.stringify({ timestamps }));
}

async function generateArticle(env, learningData, mode = "fast") {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("missing_deepseek_api_key");
  }

  const config = getModeConfig(mode);
  const words = learningData.unfamiliarItems.map((item) => ({
    word: item.voc_spelling,
    response: item.first_response,
    isNew: item.is_new === true,
    order: item.order,
  }));
  const hasTargetWords = words.length > 0;
  const wordInstruction = hasTargetWords
    ? `Target words:
${JSON.stringify(words, null, 2)}

Use as many target words as naturally possible, prioritizing the more abstract and difficult ones. The article must be logical, exam-like, and coherent, not a loose word list.`
    : `There are no target words today.

Create an original CET-6 / postgraduate English I level practice passage anyway. Select 12-20 useful advanced words or phrases from the article as highlighted vocabulary, prioritizing abstract academic words, policy/economics/technology words, and high-value exam vocabulary.`;

  const prompt = `
You are writing an English reading passage for a Chinese learner preparing for CET-6 and China's postgraduate English I exam.

Do not mention any AI system, model name, API provider, ChatGPT, DeepSeek, Gemini, or the fact that this was generated.
Do not use asterisks, markdown emphasis, or symbols around target words in the article, questions, options, or explanations.

${wordInstruction}

Requirements:
- Write one article of 430-620 English words.
- Topic should fit exam reading: society, education, technology, public policy, economy, environment, ethics, or urban life.
- Use target words naturally when target words exist. Do not force a word if it damages logic.
- Return Chinese meanings for highlighted words.
- Highlight words should mainly come from the target list when target words exist; otherwise choose important exam-level words from the generated article.
- Create 5 single-choice reading questions in the style of CET-6 and postgraduate English I.
- Questions should follow the article's structure: early questions should refer to early paragraphs, middle questions to middle paragraphs, and the final question should test main idea, author's attitude, inference, or later-paragraph synthesis.
- Each question must have four plausible options and one unambiguous correct answer.
- Explanations must be rigorous in Chinese: explain why the correct option is correct and why the distractors are wrong.
- Include paragraph breaks using "\\n\\n".
`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      topic: { type: "string" },
      difficulty: { type: "string" },
      article: { type: "string" },
      used_words: { type: "array", items: { type: "string" } },
      highlight_words: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            word: { type: "string" },
            meaning: { type: "string" },
            note: { type: "string" },
          },
          required: ["word", "meaning", "note"],
        },
      },
      chinese_summary: { type: "string" },
      questions: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "integer" },
            question: { type: "string" },
            paragraph_reference: { type: "string" },
            options: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  key: { type: "string" },
                  text: { type: "string" },
                },
                required: ["key", "text"],
              },
            },
            answer: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["id", "question", "paragraph_reference", "options", "answer", "explanation"],
        },
      },
    },
    required: ["title", "topic", "difficulty", "article", "used_words", "highlight_words", "chinese_summary", "questions"],
  };

  const baseUrl = (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const body = {
    model: config.model,
    response_format: {
      type: "json_object",
    },
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: "You return only valid JSON. Do not wrap JSON in Markdown fences.",
      },
      {
        role: "user",
        content: `${prompt}\n\nReturn JSON that matches this schema exactly:\n${JSON.stringify(schema, null, 2)}`,
      },
    ],
  };

  if (config.thinking) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = "high";
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("english_generation_provider_failed", data?.error?.message || response.status);
    throw new Error("generation_provider_failed");
  }

  const parsed = parseModelJson(getOutputText(data));

  if (!parsed?.article || !parsed?.title || !Array.isArray(parsed.questions)) {
    throw new Error("invalid_generation_output");
  }

  return parsed;
}

async function runGenerationJob(env, jobId, modeConfig, ip) {
  const createdAt = new Date().toISOString();
  try {
    await env.STATS.put(`english-job:${jobId}`, JSON.stringify({
      id: jobId,
      status: "running",
      mode: modeConfig.key,
      modeLabel: modeConfig.label,
      createdAt,
      updatedAt: createdAt,
      message: "正在读取今日学习数据",
    }));

    const learningData = await getTodayLearningData(env);

    await env.STATS.put(`english-job:${jobId}`, JSON.stringify({
      id: jobId,
      status: "running",
      mode: modeConfig.key,
      modeLabel: modeConfig.label,
      createdAt,
      updatedAt: new Date().toISOString(),
      message: "正在生成文章、题目和解析",
    }));

    const generated = await generateArticle(env, learningData, modeConfig.key);
    const record = {
      id: jobId,
      type: "article",
      mode: modeConfig.key,
      modeLabel: modeConfig.label,
      model: modeConfig.model,
      createdAt,
      ok: true,
      progress: learningData.progress,
      counts: learningData.counts,
      responseDistribution: learningData.responseDistribution,
      sourceWords: learningData.unfamiliarItems.map((item) => ({
        word: item.voc_spelling,
        first_response: item.first_response,
        is_new: item.is_new,
        order: item.order,
      })),
      generated,
      ip,
    };

    await env.STATS.put(`english-article:${createdAt}:${jobId}`, JSON.stringify(record));
    await env.STATS.put("english-latest", JSON.stringify(record));
    await recordGenerationSuccess(env, createdAt);
    await env.STATS.put(`english-job:${jobId}`, JSON.stringify({
      id: jobId,
      status: "done",
      mode: modeConfig.key,
      modeLabel: modeConfig.label,
      createdAt,
      updatedAt: new Date().toISOString(),
      message: "生成完成",
      article: record,
    }));
  } catch (error) {
    await saveEnglishRecord(env, "article", {
      id: jobId,
      type: "article",
      createdAt,
      ok: false,
      error: String(error?.message || error).slice(0, 400),
    });
    await env.STATS.put(`english-job:${jobId}`, JSON.stringify({
      id: jobId,
      status: "failed",
      mode: modeConfig.key,
      modeLabel: modeConfig.label,
      createdAt,
      updatedAt: new Date().toISOString(),
      message: "生成失败，请稍后再试",
      error: String(error?.message || error).slice(0, 300),
    }));
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  if (!env.STATS) {
    return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
  }

  let requestBody = {};

  try {
    try {
      requestBody = await request.json();
    } catch {
      requestBody = {};
    }

    const modeConfig = getModeConfig(requestBody.mode);
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
    await assertGenerationAllowed(env);
    await env.STATS.put(`english-job:${jobId}`, JSON.stringify({
      id: jobId,
      status: "queued",
      mode: modeConfig.key,
      modeLabel: modeConfig.label,
      createdAt: now,
      updatedAt: now,
      message: "生成任务已开始",
    }));

    const task = runGenerationJob(env, jobId, modeConfig, ip);

    if (typeof waitUntil === "function") {
      waitUntil(task);
    } else {
      task.catch(() => {});
    }

    return json({ ok: true, pending: true, jobId, mode: modeConfig.key, modeLabel: modeConfig.label }, { status: 202 });
  } catch (error) {
    const id = crypto.randomUUID();
    await saveEnglishRecord(env, "article", {
      id,
      type: "article",
      createdAt: new Date().toISOString(),
      ok: false,
      error: String(error?.message || error).slice(0, 400),
    });

    if (error instanceof RateLimitError) {
      return json({ ok: false, error: "rate_limited", detail: error.detail }, { status: 429 });
    }

    return json({ ok: false, error: "generate_failed", detail: "生成服务暂时不可用，请稍后再试。" }, { status: 500 });
  }
}
