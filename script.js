const canvas = document.querySelector("#spectrum");
const ctx = canvas.getContext("2d");
const toggleButton = document.querySelector("[data-toggle]");
const statusText = document.querySelector("[data-status]");
const message = document.querySelector("[data-message]");
const idle = document.querySelector("[data-idle]");
const levelBar = document.querySelector("[data-level]");
const peakFrequency = document.querySelector("[data-peak-frequency]");
const peakLevel = document.querySelector("[data-peak-level]");
const sampleRate = document.querySelector("[data-sample-rate]");
const gainControl = document.querySelector("[data-gain]");
const smoothingControl = document.querySelector("[data-smoothing]");
const rangeControl = document.querySelector("[data-range]");

let audioContext;
let analyser;
let source;
let mediaStream;
let dataArray;
let animationId;
let isRunning = false;
let devicePixelRatioCache = 1;

const state = {
  gain: Number(gainControl.value),
  smoothing: Number(smoothingControl.value),
  maxFrequency: Number(rangeControl.value),
};

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  devicePixelRatioCache = ratio;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function formatFrequency(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-- Hz";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} kHz`;
  }

  return `${Math.round(value)} Hz`;
}

function drawIdleGrid() {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a0d10";
  ctx.fillRect(0, 0, width, height);
}

function drawSpectrum() {
  if (!analyser || !dataArray || !audioContext) {
    drawIdleGrid();
    return;
  }

  analyser.getByteFrequencyData(dataArray);

  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const nyquist = audioContext.sampleRate / 2;
  const visibleBins = Math.max(
    8,
    Math.min(dataArray.length, Math.floor((state.maxFrequency / nyquist) * dataArray.length)),
  );
  const barWidth = width / visibleBins;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a0d10";
  ctx.fillRect(0, 0, width, height);

  let peakIndex = 0;
  let peakValue = 0;
  let sum = 0;

  for (let i = 0; i < visibleBins; i += 1) {
    const raw = dataArray[i];
    const value = Math.min(255, raw * state.gain);
    const normalized = value / 255;
    const barHeight = Math.max(2, normalized * height * 0.88);
    const hue = 158 - normalized * 90;

    if (raw > peakValue) {
      peakValue = raw;
      peakIndex = i;
    }

    sum += raw;
    ctx.fillStyle = `hsl(${hue} 82% ${46 + normalized * 18}%)`;
    ctx.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(51, 208, 162, 0.16)");
  gradient.addColorStop(0.65, "rgba(51, 208, 162, 0.03)");
  gradient.addColorStop(1, "rgba(51, 208, 162, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const average = sum / visibleBins;
  const level = Math.min(100, Math.round((average / 130) * 100 * state.gain));
  const frequency = (peakIndex * audioContext.sampleRate) / analyser.fftSize;
  const db = peakValue > 0 ? 20 * Math.log10(peakValue / 255) : -Infinity;

  levelBar.style.width = `${level}%`;
  peakFrequency.textContent = formatFrequency(frequency);
  peakLevel.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : "-- dB";

  animationId = requestAnimationFrame(drawSpectrum);
}

async function startAnalysis() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setMessage("当前浏览器不支持麦克风输入。请使用新版 Chrome、Edge、Safari 或 Firefox。", true);
    return;
  }

  try {
    toggleButton.disabled = true;
    statusText.textContent = "请求权限中";
    setMessage("浏览器会弹出麦克风权限请求，允许后频谱会立即开始显示。");

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -20;
    analyser.smoothingTimeConstant = state.smoothing;

    source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    isRunning = true;
    idle.classList.add("is-hidden");
    toggleButton.textContent = "停止分析";
    statusText.textContent = "正在分析";
    sampleRate.textContent = `${(audioContext.sampleRate / 1000).toFixed(1)} kHz`;
    setMessage("正在实时分析麦克风输入。手机上请保持页面前台显示。");
    drawSpectrum();
  } catch (error) {
    const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    setMessage(
      denied ? "麦克风权限被拒绝。请在浏览器地址栏或系统设置里允许麦克风。" : "无法启动麦克风输入，请检查设备或浏览器权限。",
      true,
    );
    statusText.textContent = "启动失败";
  } finally {
    toggleButton.disabled = false;
  }
}

async function stopAnalysis() {
  cancelAnimationFrame(animationId);
  mediaStream?.getTracks().forEach((track) => track.stop());
  source?.disconnect();
  await audioContext?.close();

  audioContext = undefined;
  analyser = undefined;
  source = undefined;
  mediaStream = undefined;
  dataArray = undefined;
  isRunning = false;

  idle.classList.remove("is-hidden");
  toggleButton.textContent = "开始分析";
  statusText.textContent = "已停止";
  levelBar.style.width = "0%";
  peakFrequency.textContent = "-- Hz";
  peakLevel.textContent = "-- dB";
  sampleRate.textContent = "-- kHz";
  setMessage("已停止分析。再次点击开始即可重新获取麦克风输入。");
  drawIdleGrid();
}

toggleButton.addEventListener("click", () => {
  if (isRunning) {
    stopAnalysis();
  } else {
    startAnalysis();
  }
});

gainControl.addEventListener("input", () => {
  state.gain = Number(gainControl.value);
});

smoothingControl.addEventListener("input", () => {
  state.smoothing = Number(smoothingControl.value);
  if (analyser) {
    analyser.smoothingTimeConstant = state.smoothing;
  }
});

rangeControl.addEventListener("change", () => {
  state.maxFrequency = Number(rangeControl.value);
});

window.addEventListener("resize", () => {
  const currentRatio = window.devicePixelRatio || 1;
  if (currentRatio !== devicePixelRatioCache || canvas.width !== canvas.clientWidth * currentRatio) {
    resizeCanvas();
  }
});

resizeCanvas();
drawIdleGrid();
