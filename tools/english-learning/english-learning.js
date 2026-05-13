const lockPanel = document.querySelector("[data-lock-panel]");
const appPanel = document.querySelector("[data-english-app]");
const loginForm = document.querySelector("[data-english-login]");
const loginMessage = document.querySelector("[data-login-message]");
const fetchButton = document.querySelector("[data-fetch-today]");
const generateButton = document.querySelector("[data-generate]");
const message = document.querySelector("[data-message]");
const progressEl = document.querySelector("[data-progress]");
const percentEl = document.querySelector("[data-percent]");
const unfamiliarCountEl = document.querySelector("[data-unfamiliar-count]");
const historyCountEl = document.querySelector("[data-history-count]");
const wordList = document.querySelector("[data-word-list]");
const historyList = document.querySelector("[data-history-list]");
const articleStage = document.querySelector("[data-article-stage]");
const popover = document.querySelector("[data-popover]");
const popoverWord = document.querySelector("[data-popover-word]");
const popoverMeaning = document.querySelector("[data-popover-meaning]");
const popoverNote = document.querySelector("[data-popover-note]");
const closePopover = document.querySelector("[data-close-popover]");

let articles = [];
let attempts = [];
let activeMeanings = new Map();
let translationCache = new Map();
let activeArticle = null;
let activeQuizSubmitted = false;

function setBusy(button, busy, text) {
  button.disabled = busy;
  button.dataset.idleText = button.dataset.idleText || button.textContent;
  button.textContent = busy ? text : button.dataset.idleText;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function startGenerationFeedback() {
  const startedAt = Date.now();
  const steps = [
    "正在读取今日学习数据...",
    "正在组织文章结构...",
    "正在生成阅读文章...",
    "正在生成单选题...",
    "正在整理题目解析...",
    "正在保存生成结果...",
  ];
  let stepIndex = 0;

  setMessage(`${steps[stepIndex]} 请保持页面打开。`);

  const timer = window.setInterval(() => {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    stepIndex = Math.min(stepIndex + 1, steps.length - 1);
    setMessage(`${steps[stepIndex]} 已等待 ${elapsed} 秒，页面仍在工作。`);

    if (generateButton.disabled) {
      generateButton.textContent = `生成中 ${elapsed}s`;
    }
  }, 3500);

  return () => window.clearInterval(timer);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanWord(value) {
  return String(value || "").trim().replace(/^\*+|\*+$/g, "");
}

function renderLearningData(data) {
  progressEl.textContent = `${data.progress.finished} / ${data.progress.total}`;
  percentEl.textContent = `${data.progress.percent}%`;
  unfamiliarCountEl.textContent = data.counts.unfamiliar;

  if (!data.unfamiliarItems.length) {
    wordList.innerHTML = '<span class="muted-text">今天暂时没有不熟悉词</span>';
    return;
  }

  wordList.innerHTML = data.unfamiliarItems
    .map((item) => {
      const label = item.is_new ? "新词" : item.first_response || "复习";
      return `<span class="study-word"><strong>${escapeHtml(item.voc_spelling)}</strong><em>${escapeHtml(label)}</em></span>`;
    })
    .join("");
}

function highlightArticle(text, highlights) {
  let html = escapeHtml(text);
  const ordered = [...highlights].sort((a, b) => b.word.length - a.word.length);

  for (const item of ordered) {
    const word = item.word.trim();
    item.word = cleanWord(word);

    if (!item.word) {
      continue;
    }

    const key = item.word.toLowerCase();
    activeMeanings.set(key, item);
    const pattern = new RegExp(`\\*{0,2}(?<![A-Za-z])${escapeRegExp(escapeHtml(item.word))}(?![A-Za-z])\\*{0,2}`, "gi");
    html = html.replace(pattern, (match) => {
      const cleanMatch = match.replace(/^\*+|\*+$/g, "");
      return `<button class="highlight-word" type="button" data-word="${escapeHtml(key)}">${cleanMatch}</button>`;
    });
  }

  return html
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function wrapClickableWords(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    if (!/[A-Za-z]/.test(node.textContent || "")) {
      continue;
    }

    if (node.parentElement?.closest("button,a,select,textarea")) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    const parts = node.textContent.split(/([A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z])/g);

    for (const part of parts) {
      if (/^[A-Za-z][A-Za-z'-]*[A-Za-z]$|^[A-Za-z]$/.test(part)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lookup-word";
        button.dataset.lookup = part.toLowerCase();
        button.textContent = part;
        fragment.append(button);
      } else if (part) {
        fragment.append(document.createTextNode(part));
      }
    }

    node.parentNode.replaceChild(fragment, node);
  }

  return template.innerHTML;
}

function getSelectedAnswers() {
  const answers = {};

  for (const input of articleStage.querySelectorAll("input[type='radio']:checked")) {
    answers[input.name.replace("question-", "")] = input.value;
  }

  return answers;
}

function renderAccuracyChart() {
  if (!attempts.length) {
    return '<div class="accuracy-empty">完成一次答题后会生成正确率曲线。</div>';
  }

  const values = attempts.slice(-12).map((attempt) => Math.max(0, Math.min(100, Number(attempt.percent || 0))));
  const width = 420;
  const height = 140;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => `${index * step},${height - (value / 100) * (height - 18) - 8}`).join(" ");

  return `
    <div class="accuracy-chart" aria-label="正确率变化图">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最近正确率变化">
        <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
        ${values.map((value, index) => `<circle cx="${index * step}" cy="${height - (value / 100) * (height - 18) - 8}" r="5"></circle>`).join("")}
      </svg>
      <div class="accuracy-labels">
        <span>最近 ${values.length} 次</span>
        <strong>${values.at(-1)}%</strong>
      </div>
    </div>
  `;
}

function renderQuiz(record, selected = {}, submitted = false) {
  const questions = record.generated?.questions || [];

  if (!questions.length) {
    return "";
  }

  const score = submitted
    ? questions.reduce((sum, question) => sum + (selected[String(question.id)] === question.answer ? 1 : 0), 0)
    : 0;
  const percent = submitted ? Math.round((score / questions.length) * 100) : 0;

  return `
    <section class="quiz-panel" data-quiz-panel>
      <div class="section-heading compact">
        <p class="eyebrow">Reading Questions</p>
        <h2>阅读理解单选题</h2>
      </div>
      ${renderAccuracyChart()}
      ${submitted ? `<div class="score-card"><strong>${score}/${questions.length}</strong><span>正确率 ${percent}%</span></div>` : ""}
      <form data-quiz-form>
        ${questions
          .map((question, index) => {
            const chosen = selected[String(question.id)];
            const isCorrect = chosen === question.answer;
            return `
              <article class="quiz-question${submitted ? (isCorrect ? " correct" : " wrong") : ""}">
                <header>
                  <span>第 ${index + 1} 题 · ${escapeHtml(question.paragraph_reference || "文章理解")}</span>
                  <h3>${wrapClickableWords(escapeHtml(question.question))}</h3>
                </header>
                <div class="quiz-options">
                  ${(question.options || [])
                    .map((option) => `
                      <label class="${submitted && option.key === question.answer ? "right-answer" : ""}">
                        <input type="radio" name="question-${question.id}" value="${escapeHtml(option.key)}" ${chosen === option.key ? "checked" : ""} ${submitted ? "disabled" : ""} />
                        <span>${escapeHtml(option.key)}. ${wrapClickableWords(escapeHtml(option.text))}</span>
                      </label>
                    `)
                    .join("")}
                </div>
                ${
                  submitted
                    ? `<div class="quiz-explanation">
                        <strong>${isCorrect ? "回答正确" : `回答错误，正确答案是 ${escapeHtml(question.answer)}`}</strong>
                        <p>${wrapClickableWords(escapeHtml(question.explanation))}</p>
                      </div>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
        ${submitted ? "" : '<button class="primary-button quiz-submit" type="submit">提交答案</button>'}
      </form>
    </section>
  `;
}

function renderArticle(record) {
  activeArticle = record || null;
  activeQuizSubmitted = false;

  if (!record?.generated) {
    articleStage.innerHTML = `
      <div class="empty-state">
        <strong>还没有文章</strong>
        <span>生成后会自动保存到历史记录。</span>
      </div>
    `;
    return;
  }

  const generated = record.generated;
  activeMeanings = new Map();
  articleStage.innerHTML = `
    <header class="article-header">
      <span class="status-pill">CET-6 / 考研英语一</span>
      <h2>${escapeHtml(generated.title)}</h2>
      <p>${escapeHtml(generated.chinese_summary || "")}</p>
      <div class="article-meta">
        <span>${formatDate(record.createdAt)}</span>
        <span>使用 ${generated.used_words?.length || 0} 个目标词</span>
        <span>${escapeHtml(generated.topic || "Exam Reading")}</span>
      </div>
    </header>
    <div class="article-content">
      ${wrapClickableWords(highlightArticle(generated.article || "", generated.highlight_words || []))}
    </div>
    ${renderQuiz(record)}
  `;
}

function renderHistory() {
  historyCountEl.textContent = articles.length;

  if (!articles.length) {
    historyList.innerHTML = '<span class="muted-text">还没有生成历史</span>';
    return;
  }

  historyList.innerHTML = articles
    .map((record, index) => `
      <button class="history-item${index === 0 ? " active" : ""}" type="button" data-history-id="${record.id}">
        <strong>${escapeHtml(record.generated?.title || "生成失败记录")}</strong>
        <span>${formatDate(record.createdAt)} · ${record.counts?.unfamiliar ?? 0} 个不熟悉词</span>
      </button>
    `)
    .join("");
}

async function loadHistory() {
  const response = await fetch("/api/english/latest", { credentials: "include" });

  if (response.status === 401) {
    lockPanel.classList.remove("is-hidden");
    appPanel.classList.add("is-hidden");
    return;
  }

  if (!response.ok) {
    throw new Error("history_failed");
  }

  const data = await response.json();
  articles = data.articles || [];
  attempts = data.attempts || [];
  lockPanel.classList.add("is-hidden");
  appPanel.classList.remove("is-hidden");
  if (data.today) {
    renderLearningData(data.today);
  } else {
    fetchToday();
  }
  renderHistory();
  renderArticle(data.latest);
}

async function fetchToday() {
  setBusy(fetchButton, true, "正在获取...");
  setMessage("正在读取今日完整学习记录...");

  try {
    const response = await fetch("/api/english/today", { credentials: "include" });

    if (!response.ok) {
      throw new Error("today_failed");
    }

    const data = await response.json();
    renderLearningData(data);
    setMessage(`已获取今日 ${data.progress.finished}/${data.progress.total} 进度，发现 ${data.counts.unfamiliar} 个不熟悉词。`);
  } catch {
    setMessage("今日学习数据获取失败，请稍后重试或检查后端环境变量。", true);
  } finally {
    setBusy(fetchButton, false, "正在获取...");
  }
}

async function generateArticle() {
  setBusy(generateButton, true, "正在生成...");
  const stopFeedback = startGenerationFeedback();

  try {
    const response = await fetch("/api/english/generate", {
      method: "POST",
      credentials: "include",
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.detail || "generate_failed");
    }

    articles = [data.article, ...articles.filter((item) => item.id !== data.article.id)];
    renderHistory();
    renderLearningData({
      progress: data.article.progress,
      counts: data.article.counts,
      unfamiliarItems: data.article.sourceWords.map((item) => ({
        voc_spelling: item.word,
        first_response: item.first_response,
        is_new: item.is_new,
      })),
    });
    renderArticle(data.article);
    setMessage("文章与题目已生成并保存，输入密码访问后可查看历史。");
  } catch (error) {
    setMessage(`生成失败：${error.message || "请稍后重试"}`, true);
  } finally {
    stopFeedback();
    setBusy(generateButton, false, "正在生成...");
  }
}

async function submitQuiz(form) {
  if (!activeArticle || activeQuizSubmitted) {
    return;
  }

  const questions = activeArticle.generated?.questions || [];
  const selected = getSelectedAnswers();

  if (Object.keys(selected).length < questions.length) {
    setMessage("请先完成全部题目再提交。", true);
    return;
  }

  const score = questions.reduce((sum, question) => sum + (selected[String(question.id)] === question.answer ? 1 : 0), 0);
  const percent = Math.round((score / questions.length) * 100);
  const answers = questions.map((question) => ({
    id: question.id,
    selected: selected[String(question.id)],
    answer: question.answer,
    correct: selected[String(question.id)] === question.answer,
  }));
  activeQuizSubmitted = true;
  articleStage.querySelector("[data-quiz-panel]").outerHTML = renderQuiz(activeArticle, selected, true);
  setMessage(`已提交，本次正确率 ${percent}%。`);

  try {
    const response = await fetch("/api/english/attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        articleId: activeArticle.id,
        title: activeArticle.generated.title,
        score,
        total: questions.length,
        percent,
        answers,
      }),
      credentials: "include",
    });
    const data = await response.json();

    if (response.ok && data.ok) {
      attempts = [...attempts, data.attempt];
      articleStage.querySelector("[data-quiz-panel]").outerHTML = renderQuiz(activeArticle, selected, true);
    }
  } catch {
    setMessage("分数已在页面显示，但保存答题历史失败。", true);
  }
}

function showPopover(button) {
  const item = activeMeanings.get(button.dataset.word || button.dataset.lookup);

  if (!item) {
    return;
  }

  const rect = button.getBoundingClientRect();
  popoverWord.textContent = item.word;
  popoverMeaning.textContent = item.meaning;
  popoverNote.textContent = item.note;
  popover.classList.remove("is-hidden");

  const top = Math.min(window.innerHeight - popover.offsetHeight - 12, rect.bottom + 10);
  const left = Math.min(window.innerWidth - popover.offsetWidth - 12, Math.max(12, rect.left));
  popover.style.top = `${Math.max(12, top)}px`;
  popover.style.left = `${left}px`;
}

async function lookupWord(button) {
  const key = button.dataset.lookup;

  if (!key) {
    return;
  }

  if (activeMeanings.has(key)) {
    showPopover(button);
    return;
  }

  if (translationCache.has(key)) {
    activeMeanings.set(key, translationCache.get(key));
    showPopover(button);
    return;
  }

  activeMeanings.set(key, { word: key, meaning: "正在查询释义...", note: "" });
  showPopover(button);

  try {
    const response = await fetch("/api/english/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word: key }),
      credentials: "include",
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error("lookup_failed");
    }

    translationCache.set(key, data.result);
    activeMeanings.set(key, data.result);
    showPopover(button);
  } catch {
    activeMeanings.set(key, { word: key, meaning: "查询失败，请稍后再试。", note: "" });
    showPopover(button);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "正在验证...";

  const response = await fetch("/api/english/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: loginForm.password.value }),
    credentials: "include",
  });

  if (!response.ok) {
    loginMessage.textContent = "密码错误";
    return;
  }

  loginMessage.textContent = "";
  loginForm.reset();
  await loadHistory();
});

fetchButton.addEventListener("click", fetchToday);
generateButton.addEventListener("click", generateArticle);
historyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-id]");

  if (!button) {
    return;
  }

  const record = articles.find((item) => item.id === button.dataset.historyId);
  historyList.querySelectorAll(".history-item").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  renderArticle(record);
});
articleStage.addEventListener("click", (event) => {
  const button = event.target.closest("[data-word], [data-lookup]");

  if (button?.dataset.word) {
    showPopover(button);
  } else if (button?.dataset.lookup) {
    lookupWord(button);
  }
});
articleStage.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-quiz-form]");

  if (form) {
    event.preventDefault();
    submitQuiz(form);
  }
});
closePopover.addEventListener("click", () => popover.classList.add("is-hidden"));
document.addEventListener("click", (event) => {
  const clickedWord = event.target.closest("[data-word], [data-lookup]");
  const clickedPopover = event.target.closest("[data-popover]");

  if (!clickedWord && !clickedPopover) {
    popover.classList.add("is-hidden");
  }
});
window.addEventListener("resize", () => popover.classList.add("is-hidden"));

loadHistory().catch(() => {
  lockPanel.classList.remove("is-hidden");
  appPanel.classList.add("is-hidden");
});
