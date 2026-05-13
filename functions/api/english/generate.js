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

async function generateArticle(env, learningData) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("missing_deepseek_api_key");
  }

  if (!learningData.unfamiliarItems.length) {
    throw new Error("no_unfamiliar_words");
  }

  const words = learningData.unfamiliarItems.map((item) => ({
    word: item.voc_spelling,
    response: item.first_response,
    isNew: item.is_new === true,
    order: item.order,
  }));
  const prompt = `
You are writing an English reading passage for a Chinese learner preparing for CET-6 and China's postgraduate English I exam.

Use as many target words as naturally possible, prioritizing the more abstract and difficult ones. The article must be logical, exam-like, and coherent, not a loose word list.

Do not mention any AI system, model name, API provider, ChatGPT, DeepSeek, Gemini, or the fact that this was generated.
Do not use asterisks, markdown emphasis, or symbols around target words in the article, questions, options, or explanations.

Target words:
${JSON.stringify(words, null, 2)}

Requirements:
- Write one article of 520-760 English words.
- Topic should fit exam reading: society, education, technology, public policy, economy, environment, ethics, or urban life.
- Use target words naturally. Do not force a word if it damages logic.
- Return Chinese meanings for highlighted target words.
- Highlight words should mainly come from the target list.
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
  const model = env.DEEPSEEK_MODEL || "deepseek-v4-pro";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      thinking: {
        type: "enabled",
      },
      reasoning_effort: "high",
      response_format: {
        type: "json_object",
      },
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
    }),
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

export async function onRequestPost({ request, env }) {
  if (!(await isEnglishAuthorized(request, env))) {
    return json({ ok: false }, { status: 401 });
  }

  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    const learningData = await getTodayLearningData(env);
    const generated = await generateArticle(env, learningData);
    const record = {
      id,
      type: "article",
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
      ip: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "",
    };

    if (!env.STATS) {
      return json({ ok: false, error: "missing_stats_binding" }, { status: 500 });
    }

    await env.STATS.put(`english-article:${createdAt}:${id}`, JSON.stringify(record));
    await env.STATS.put("english-latest", JSON.stringify(record));

    return json({ ok: true, article: record });
  } catch (error) {
    await saveEnglishRecord(env, "article", {
      id,
      type: "article",
      createdAt,
      ok: false,
      error: String(error?.message || error).slice(0, 400),
    });

    const detail = error?.message === "no_unfamiliar_words"
      ? "今天暂时没有可用于生成文章的目标词。"
      : "生成服务暂时不可用，请稍后再试。";

    return json({ ok: false, error: "generate_failed", detail }, { status: 500 });
  }
}
