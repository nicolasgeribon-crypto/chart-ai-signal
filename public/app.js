const $ = (s) => document.querySelector(s);
const fileInput = $('#fileInput');
const pickBtn = $('#pickBtn');
const previewWrap = $('#previewWrap');
const preview = $('#preview');
const changeBtn = $('#changeBtn');
const analyzeBtn = $('#analyzeBtn');
const progressCard = $('#progressCard');
const resultCard = $('#resultCard');
const errorCard = $('#errorCard');
const progressBar = $('#progressBar');
const scanImg = $('#scanImg');
const statusBadge = $('#statusBadge');
const installBtn = $('#installBtn');
let selectedFile = null;
let previewUrl = null;
let deferredInstallPrompt = null;

function choose() { fileInput.click(); }
pickBtn.addEventListener('click', choose);
changeBtn.addEventListener('click', choose);

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  selectedFile = f;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(f);
  preview.src = previewUrl;
  scanImg.src = previewUrl;
  pickBtn.classList.add('hidden');
  previewWrap.classList.remove('hidden');
  analyzeBtn.classList.remove('hidden');
  resultCard.classList.add('hidden');
  errorCard.classList.add('hidden');
});

function setSteps(index) {
  document.querySelectorAll('.steps div').forEach((el, i) => {
    el.classList.toggle('active', i <= index);
    const clean = el.textContent.replace(/^[✓○◌]\s*/, '');
    el.textContent = i < index ? `✓ ${clean}` : i === index ? `◌ ${clean}` : `○ ${clean}`;
  });
  progressBar.style.width = `${Math.min(95, (index + 1) * 19)}%`;
}

analyzeBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  resultCard.classList.add('hidden');
  errorCard.classList.add('hidden');
  progressCard.classList.remove('hidden');
  analyzeBtn.disabled = true;

  let step = 0;
  setSteps(step);
  const timer = setInterval(() => {
    if (step < 4) { step += 1; setSteps(step); }
  }, 800);

  try {
    const fd = new FormData();
    fd.append('chart', selectedFile);
    fd.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const r = await fetch('/api/analyze', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) {
      throw new Error(data.setup
        ? 'Falta activar la IA en el servidor. Agrega OPENAI_API_KEY y vuelve a abrir la app.'
        : (data.error || 'Error de análisis'));
    }
    clearInterval(timer);
    progressBar.style.width = '100%';
    setTimeout(() => showResult(data), 300);
  } catch (e) {
    clearInterval(timer);
    progressCard.classList.add('hidden');
    $('#errorText').textContent = e.message;
    errorCard.classList.remove('hidden');
  } finally {
    analyzeBtn.disabled = false;
  }
});

function showResult(d) {
  progressCard.classList.add('hidden');
  resultCard.classList.remove('hidden');
  const map = {
    BUY: ['COMPRA', 'COMPRA', 'buy'],
    SELL: ['VENTA', 'VENTA', 'sell'],
    WAIT: ['NO OPERAR', 'ESPERAR', 'wait']
  };
  const [title, pill, cls] = map[d.signal] || map.WAIT;
  $('#signal').textContent = title;
  const p = $('#signalPill');
  p.textContent = pill;
  p.className = `pill ${cls}`;
  $('#entry').textContent = d.entry_time || '--:--';
  $('#confidenceText').textContent = `${d.confidence || 0}%`;
  $('#confidenceBar').style.width = `${d.confidence || 0}%`;
  $('#trend').textContent = d.trend || 'incierta';
  $('#timeframe').textContent = d.timeframe || 'No visible';
  $('#support').textContent = d.support || 'No visible';
  $('#resistance').textContent = d.resistance || 'No visible';
  $('#reason').textContent = d.reason || 'Sin comentario.';
  $('#riskNote').textContent = d.risk_note || 'La lectura se basa solo en una captura y no garantiza el movimiento futuro del precio.';
  $('#assetBadge').textContent = d.asset || 'No identificado';
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#anotherBtn').addEventListener('click', () => {
  resultCard.classList.add('hidden');
  fileInput.value = '';
  selectedFile = null;
  previewWrap.classList.add('hidden');
  analyzeBtn.classList.add('hidden');
  pickBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

async function refreshStatus() {
  try {
    const r = await fetch('/api/status');
    const data = await r.json();
    statusBadge.textContent = data.ai ? '● IA ACTIVA' : '● IA SIN CONFIGURAR';
    statusBadge.classList.toggle('offline', !data.ai);
  } catch {
    statusBadge.textContent = '● SIN CONEXIÓN';
    statusBadge.classList.add('offline');
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.classList.add('hidden');
});

window.addEventListener('appinstalled', () => installBtn.classList.add('hidden'));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

refreshStatus();
