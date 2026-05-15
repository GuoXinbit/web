const loginPanel = document.querySelector("[data-login-panel]");
const dashboard = document.querySelector("[data-dashboard]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const refreshButton = document.querySelector("[data-refresh]");
const totalEl = document.querySelector("[data-total]");
const todayEl = document.querySelector("[data-today]");
const ipsEl = document.querySelector("[data-ips]");
const eventsEl = document.querySelector("[data-events]");
const feedbacksEl = document.querySelector("[data-feedbacks]");
const recordingsEl = document.querySelector("[data-recordings]");
const englishRecordsEl = document.querySelector("[data-english-records]");
const errorsEl = document.querySelector("[data-errors]");
const playerPanel = document.querySelector("[data-player-panel]");
const playerTitle = document.querySelector("[data-player-title]");
const audioPlayer = document.querySelector("[data-audio-player]");
const configForm = document.querySelector("[data-config-form]");
const configMessage = document.querySelector("[data-config-message]");
const configSummary = document.querySelector("[data-config-summary]");
const balanceButton = document.querySelector("[data-check-balance]");
const restoreButton = document.querySelector("[data-restore-defaults]");

const pageSize = 25;
const state = {
  data: {
    events: [],
    feedbacks: [],
    recordings: [],
    englishRecords: [],
    errors: [],
  },
  page: {
    events: 1,
    feedbacks: 1,
    recordings: 1,
    englishRecords: 1,
    errors: 1,
  },
};

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatGeo(geo) {
  return [geo?.country, geo?.region, geo?.city].filter(Boolean).join(" / ") || "-";
}

function setButtonBusy(button, busy, text = "处理中...") {
  if (!button) {
    return;
  }

  button.dataset.idleText = button.dataset.idleText || button.textContent;
  button.disabled = busy;
  button.textContent = busy ? text : button.dataset.idleText;
}

function getPager(name, tableBody) {
  let pager = document.querySelector(`[data-pager="${name}"]`);

  if (!pager) {
    pager = document.createElement("div");
    pager.className = "pager";
    pager.dataset.pager = name;
    tableBody.closest(".table-wrap")?.after(pager);
  }

  return pager;
}

function slicePage(name) {
  const list = state.data[name] || [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  state.page[name] = Math.min(Math.max(1, state.page[name] || 1), totalPages);
  const start = (state.page[name] - 1) * pageSize;
  return {
    rows: list.slice(start, start + pageSize),
    total: list.length,
    totalPages,
    page: state.page[name],
  };
}

function renderPager(name, tableBody) {
  const { page, total, totalPages } = slicePage(name);
  const pager = getPager(name, tableBody);

  if (total <= pageSize) {
    pager.innerHTML = "";
    return;
  }

  pager.innerHTML = `
    <button class="table-button" type="button" data-page-target="${name}" data-page-step="-1" ${page <= 1 ? "disabled" : ""}>上一页</button>
    <span>第 ${page} / ${totalPages} 页，共 ${total} 条</span>
    <button class="table-button" type="button" data-page-target="${name}" data-page-step="1" ${page >= totalPages ? "disabled" : ""}>下一页</button>
  `;
}

function setEmpty(tableBody, colspan, text, name) {
  tableBody.innerHTML = `<tr><td colspan="${colspan}">${escapeHtml(text)}</td></tr>`;
  renderPager(name, tableBody);
}

function renderEvents() {
  const { rows } = slicePage("events");
  eventsEl.innerHTML = "";

  if (!rows.length) {
    setEmpty(eventsEl, 6, "暂无访问记录", "events");
    return;
  }

  for (const event of rows) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatDate(event.time))}</td>
      <td><code>${escapeHtml(event.ip || "-")}</code></td>
      <td>${escapeHtml(formatGeo(event.geo))}</td>
      <td>${escapeHtml(event.path || "-")}</td>
      <td>${escapeHtml(event.device || "-")}</td>
      <td>${escapeHtml(event.referrer || "-")}</td>
    `;
    eventsEl.append(row);
  }

  renderPager("events", eventsEl);
}

function renderFeedbacks() {
  const { rows } = slicePage("feedbacks");
  feedbacksEl.innerHTML = "";

  if (!rows.length) {
    setEmpty(feedbacksEl, 6, "暂无用户反馈", "feedbacks");
    return;
  }

  for (const feedback of rows) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatDate(feedback.createdAt))}</td>
      <td><code>${escapeHtml(feedback.ip || "-")}</code></td>
      <td>${escapeHtml(formatGeo(feedback.geo))}</td>
      <td>${escapeHtml(feedback.page || "-")}</td>
      <td>${escapeHtml(feedback.contact || "-")}</td>
      <td>${escapeHtml(feedback.message || "-")}</td>
    `;
    feedbacksEl.append(row);
  }

  renderPager("feedbacks", feedbacksEl);
}

function renderRecordings() {
  const { rows } = slicePage("recordings");
  recordingsEl.innerHTML = "";

  if (!rows.length) {
    setEmpty(recordingsEl, 7, "暂无录音", "recordings");
    return;
  }

  for (const recording of rows) {
    const row = document.createElement("tr");
    const seconds = Math.max(0, Math.round((recording.durationMs || 0) / 1000));
    const sizeMb = recording.size ? `${(recording.size / 1024 / 1024).toFixed(2)} MB` : "-";
    row.innerHTML = `
      <td>${escapeHtml(formatDate(recording.createdAt))}</td>
      <td><code>${escapeHtml(recording.ip || "-")}</code></td>
      <td>${escapeHtml(formatGeo(recording.geo))}</td>
      <td>${seconds}s</td>
      <td>${sizeMb}</td>
      <td><button class="table-button" type="button" data-play-recording="${escapeHtml(recording.id)}">选择播放</button></td>
      <td><a class="table-link" href="/api/audio/${encodeURIComponent(recording.id)}" target="_blank" rel="noreferrer">下载</a></td>
    `;
    recordingsEl.append(row);
  }

  renderPager("recordings", recordingsEl);
}

function renderEnglishRecords() {
  const { rows } = slicePage("englishRecords");
  englishRecordsEl.innerHTML = "";

  if (!rows.length) {
    setEmpty(englishRecordsEl, 7, "暂无英语学习记录", "englishRecords");
    return;
  }

  for (const record of rows) {
    const row = document.createElement("tr");
    const progress = record.progress ? `${record.progress.finished || 0}/${record.progress.total || 0}` : "-";
    const unfamiliar = record.counts?.unfamiliar ?? "-";
    const status = record.ok === false ? "失败" : (record.generated?.title || "获取今日数据");
    const usage = record.usage?.final?.total_tokens ? `${record.usage.final.total_tokens} tokens` : "-";
    row.innerHTML = `
      <td>${escapeHtml(formatDate(record.createdAt))}</td>
      <td>${escapeHtml(record.type || "-")}</td>
      <td>${escapeHtml(progress)}</td>
      <td>${escapeHtml(unfamiliar)}</td>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(usage)}</td>
      <td>${escapeHtml(record.error || "-")}</td>
    `;
    englishRecordsEl.append(row);
  }

  renderPager("englishRecords", englishRecordsEl);
}

function renderErrors() {
  const { rows } = slicePage("errors");
  errorsEl.innerHTML = "";

  if (!rows.length) {
    setEmpty(errorsEl, 6, "暂无错误记录", "errors");
    return;
  }

  for (const error of rows) {
    const row = document.createElement("tr");
    const emailStatus = error.email?.sent
      ? "已发送"
      : error.email?.rateLimited
        ? "频率限制"
        : (error.email?.reason || "未发送");
    row.innerHTML = `
      <td>${escapeHtml(formatDate(error.time))}</td>
      <td>${escapeHtml(error.level || "-")}</td>
      <td>${escapeHtml(error.source || "-")}</td>
      <td>${escapeHtml(error.path || "-")}</td>
      <td>${escapeHtml(error.message || "-")}</td>
      <td>${escapeHtml(emailStatus)}</td>
    `;
    errorsEl.append(row);
  }

  renderPager("errors", errorsEl);
}

function renderStats(data) {
  totalEl.textContent = data.summary.total;
  todayEl.textContent = data.summary.today;
  ipsEl.textContent = data.summary.uniqueIps;
  state.data.events = data.events || [];
  state.data.feedbacks = data.feedbacks || [];
  state.data.recordings = data.recordings || [];
  state.data.englishRecords = data.englishRecords || [];
  state.data.errors = data.errors || [];
  renderEvents();
  renderFeedbacks();
  renderRecordings();
  renderEnglishRecords();
  renderErrors();
}

function renderConfig(config) {
  if (!configForm || !configSummary) {
    return;
  }

  for (const [key, value] of Object.entries(config)) {
    const field = configForm.elements[key];
    if (!field || key.endsWith("ApiKey") || key.endsWith("Token") || key === "adminPassword") {
      continue;
    }

    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value || "";
    }
  }

  configSummary.innerHTML = `
    <article><span>DeepSeek Token</span><strong>${config.deepseekApiKeySet ? escapeHtml(config.deepseekApiKeyMasked) : "未配置"}</strong></article>
    <article><span>墨墨 Token</span><strong>${config.maimemoTokenSet ? escapeHtml(config.maimemoTokenMasked) : "未配置"}</strong></article>
    <article><span>Resend Token</span><strong>${config.resendApiKeySet ? escapeHtml(config.resendApiKeyMasked) : "未配置"}</strong></article>
    <article><span>通知邮箱</span><strong>${escapeHtml(config.errorAlertTo || "-")}</strong></article>
    <article><span>维护模式</span><strong>${config.maintenanceEnabled ? "已开启" : "已关闭"}</strong></article>
    <article><span>后台密码</span><strong>${config.adminPasswordManaged ? "后台配置已接管" : "使用环境变量"}</strong></article>
    <article><span>最后更新</span><strong>${config.updatedAt ? escapeHtml(formatDate(config.updatedAt)) : "-"}</strong></article>
  `;
}

async function loadConfig() {
  if (!configForm) {
    return;
  }

  const response = await fetch("/api/admin-config", { credentials: "include" });
  if (!response.ok) {
    throw new Error("config_failed");
  }

  const data = await response.json();
  renderConfig(data.config || {});
}

async function loadStats() {
  const response = await fetch("/api/stats", { credentials: "include" });

  if (response.status === 401) {
    loginPanel.classList.remove("is-hidden");
    dashboard.classList.add("is-hidden");
    return;
  }

  if (!response.ok) {
    throw new Error("stats_failed");
  }

  const data = await response.json();
  renderStats(data);
}

async function loadDashboard() {
  eventsEl.innerHTML = '<tr><td colspan="6">正在加载...</td></tr>';
  feedbacksEl.innerHTML = '<tr><td colspan="6">正在加载...</td></tr>';
  recordingsEl.innerHTML = '<tr><td colspan="7">正在加载...</td></tr>';
  englishRecordsEl.innerHTML = '<tr><td colspan="7">正在加载...</td></tr>';
  errorsEl.innerHTML = '<tr><td colspan="6">正在加载...</td></tr>';

  await Promise.all([loadStats(), loadConfig()]);
}

recordingsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-play-recording]");

  if (!button) {
    return;
  }

  const id = button.dataset.playRecording;
  playerPanel.classList.remove("is-hidden");
  playerTitle.textContent = id;
  audioPlayer.src = `/api/audio/${encodeURIComponent(id)}`;
  audioPlayer.play().catch(() => {});
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page-target]");

  if (!button) {
    return;
  }

  const name = button.dataset.pageTarget;
  state.page[name] += Number(button.dataset.pageStep || 0);
  ({
    events: renderEvents,
    feedbacks: renderFeedbacks,
    recordings: renderRecordings,
    englishRecords: renderEnglishRecords,
    errors: renderErrors,
  }[name]?.());
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "正在进入...");
  loginMessage.textContent = "正在验证...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: loginForm.password.value }),
      credentials: "include",
    });

    if (!response.ok) {
      loginMessage.textContent = "密码错误或后台未配置密码。";
      return;
    }

    loginForm.reset();
    loginMessage.textContent = "";
    loginPanel.classList.add("is-hidden");
    dashboard.classList.remove("is-hidden");
    await loadDashboard();
  } catch {
    loginMessage.textContent = "网络响应较慢，请检查网络后再试。";
  } finally {
    setButtonBusy(submitButton, false);
  }
});

refreshButton?.addEventListener("click", () => {
  setButtonBusy(refreshButton, true, "刷新中...");
  loadDashboard().finally(() => setButtonBusy(refreshButton, false));
});

configForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = configForm.querySelector("button[type='submit']");
  setButtonBusy(submitButton, true, "保存中...");
  configMessage.textContent = "正在保存配置...";

  const payload = Object.fromEntries(new FormData(configForm).entries());
  payload.maintenanceEnabled = configForm.elements.maintenanceEnabled.checked;

  for (const key of ["deepseekApiKey", "maimemoToken", "resendApiKey", "adminPassword"]) {
    if (!payload[key]) {
      delete payload[key];
    }
  }

  try {
    const response = await fetch("/api/admin-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "config_failed");
    }

    for (const key of ["deepseekApiKey", "maimemoToken", "resendApiKey", "adminPassword"]) {
      if (configForm.elements[key]) {
        configForm.elements[key].value = "";
      }
    }

    renderConfig(data.config || {});
    configMessage.textContent = "配置已保存。";
  } catch {
    configMessage.textContent = "保存失败，请稍后再试。";
  } finally {
    setButtonBusy(submitButton, false);
  }
});

balanceButton?.addEventListener("click", async () => {
  setButtonBusy(balanceButton, true, "查询中...");
  configMessage.textContent = "正在查询 DeepSeek 余额...";

  try {
    const response = await fetch("/api/deepseek-balance", { credentials: "include" });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "balance_failed");
    }

    const balances = data.balance?.balance_infos || [];
    const summary = balances
      .map((item) => `${item.currency || "CNY"} ${item.total_balance || item.granted_balance || "0"}`)
      .join("，");
    configMessage.textContent = `DeepSeek 余额：${summary || "接口返回为空"}`;
  } catch {
    configMessage.textContent = "余额查询失败，请检查 DeepSeek Token 或 Base URL。";
  } finally {
    setButtonBusy(balanceButton, false);
  }
});

restoreButton?.addEventListener("click", async () => {
  const confirmed = window.confirm("确定一键恢复默认配置吗？这会清除后台保存的 API Token、后台密码覆盖配置、维护模式和今日学习缓存，恢复使用 Cloudflare 环境变量。");

  if (!confirmed) {
    return;
  }

  setButtonBusy(restoreButton, true, "恢复中...");
  configMessage.textContent = "正在恢复默认配置...";

  try {
    const response = await fetch("/api/admin-restore", {
      method: "POST",
      credentials: "include",
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "restore_failed");
    }

    for (const key of ["deepseekApiKey", "maimemoToken", "resendApiKey", "adminPassword"]) {
      if (configForm.elements[key]) {
        configForm.elements[key].value = "";
      }
    }

    renderConfig(data.config || {});
    configMessage.textContent = data.message || "已恢复默认配置。";
  } catch {
    configMessage.textContent = "恢复失败，请稍后再试。";
  } finally {
    setButtonBusy(restoreButton, false);
  }
});

loadDashboard().then(() => {
  loginPanel.classList.add("is-hidden");
  dashboard.classList.remove("is-hidden");
}).catch(() => {
  loginPanel.classList.remove("is-hidden");
  dashboard.classList.add("is-hidden");
});
