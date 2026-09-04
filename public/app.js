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
const HISTORY_KEY = 'chart-ai-entry-history-v2';
const LEGACY_HISTORY_KEY = 'chart-ai-entry-history-v1';
const HISTORY_LIMIT = 50;

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


function addMinutesToHHMM(value, minutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!m) return '--:--';
  const total = ((Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function readHistory() {
  try {
    let raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
      if (legacy) {
        const old = JSON.parse(legacy);
        if (Array.isArray(old)) {
          const migrated = old.map(item => ({ ...item, outcome: item.outcome || 'PENDING' }));
          localStorage.setItem(HISTORY_KEY, JSON.stringify(migrated));
          raw = JSON.stringify(migrated);
        }
      }
    }
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data.map(item => ({ ...item, outcome: item.outcome || 'PENDING' })) : [];
  } catch { return []; }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

function saveEntryToHistory(d, exitTime) {
  if (!['BUY', 'SELL'].includes(d.signal) || !d.entry_time || d.entry_time === '--:--') return;
  const history = readHistory();
  history.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    signal: d.signal,
    asset: d.asset || 'No identificado',
    timeframe: d.timeframe || 'No visible',
    start_time: d.entry_time,
    end_time: exitTime,
    duration: Number(d.expiry_minutes) || 5,
    confidence: Number(d.confidence) || 0,
    trend: d.trend || 'incierta',
    outcome: 'PENDING'
  });
  writeHistory(history);
  renderHistory();
}

function renderHistory() {
  const history = readHistory();
  const list = $('#historyList');
  const empty = $('#historyEmpty');
  list.innerHTML = '';
  empty.classList.toggle('hidden', history.length > 0);

  const wins = history.filter(item => item.outcome === 'WIN').length;
  const losses = history.filter(item => item.outcome === 'LOSS').length;
  const resolved = wins + losses;
  const accuracy = resolved ? Math.round((wins / resolved) * 100) : null;
  $('#statTotal').textContent = history.length;
  $('#statWins').textContent = wins;
  $('#statLosses').textContent = losses;
  $('#statAccuracy').textContent = accuracy === null ? '—' : `${accuracy}%`;

  history.forEach(item => {
    const row = document.createElement('div');
    const outcome = item.outcome || 'PENDING';
    row.className = `history-item ${item.signal === 'BUY' ? 'buy' : 'sell'} ${outcome.toLowerCase()}`;
    const date = new Date(item.created_at);
    const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
    const signalText = item.signal === 'BUY' ? 'COMPRA' : 'VENTA';
    const outcomeText = outcome === 'WIN' ? 'WIN ✓' : outcome === 'LOSS' ? 'LOSS ✕' : 'PENDIENTE';
    row.innerHTML = `
      <div class="history-signal"><span>${item.signal === 'BUY' ? '↑' : '↓'}</span><div><strong>${signalText}</strong><small>${escapeHtml(item.asset)}</small></div></div>
      <div class="history-times"><b>${escapeHtml(item.start_time)} → ${escapeHtml(item.end_time)}</b><small>${item.duration} min · ${Math.round(item.confidence)}% confianza</small></div>
      <div class="history-meta"><span>${escapeHtml(item.timeframe)}</span><span>${escapeHtml(item.trend)}</span><span>${dateText}</span><span class="outcome-badge ${outcome.toLowerCase()}">${outcomeText}</span></div>
      <div class="history-actions">
        <span>Resultado demo:</span>
        <button type="button" class="mark-btn win ${outcome === 'WIN' ? 'selected' : ''}" data-id="${escapeHtml(item.id)}" data-outcome="WIN">✓ WIN</button>
        <button type="button" class="mark-btn loss ${outcome === 'LOSS' ? 'selected' : ''}" data-id="${escapeHtml(item.id)}" data-outcome="LOSS">✕ LOSS</button>
        <button type="button" class="mark-btn pending ${outcome === 'PENDING' ? 'selected' : ''}" data-id="${escapeHtml(item.id)}" data-outcome="PENDING">Pendiente</button>
      </div>`;
    list.appendChild(row);
  });
}

function setOutcome(id, outcome) {
  const history = readHistory();
  const item = history.find(entry => entry.id === id);
  if (!item || !['WIN', 'LOSS', 'PENDING'].includes(outcome)) return;
  item.outcome = outcome;
  item.outcome_updated_at = new Date().toISOString();
  writeHistory(history);
  renderHistory();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function showResult(d) {
  progressCard.classList.add('hidden');
  resultCard.classList.remove('hidden');
  const map = {
    BUY: ['COMPRA', 'COMPRA', 'buy', '↑', 'Entrada alcista detectada'],
    SELL: ['VENTA', 'VENTA', 'sell', '↓', 'Entrada bajista detectada'],
    WAIT: ['NO OPERAR', 'ESPERAR', 'wait', '•', 'Sin entrada clara']
  };
  const [title, pill, cls, icon, subtitle] = map[d.signal] || map.WAIT;
  $('#signal').innerHTML = `<span id="signalIcon" class="signal-icon ${cls}">${icon}</span> ${title}`;
  $('#signalSub').textContent = subtitle;
  const p = $('#signalPill');
  p.textContent = pill;
  p.className = `pill ${cls}`;
  const exitTime = d.exit_time || addMinutesToHHMM(d.entry_time, Number(d.expiry_minutes) || 5);
  $('#entry').textContent = d.entry_time || '--:--';
  $('#exit').textContent = exitTime;
  $('#confidenceText').textContent = `${d.confidence || 0}%`;
  $('#confidenceBar').style.width = `${d.confidence || 0}%`;
  $('#trend').textContent = d.trend || 'incierta';
  $('#timeframe').textContent = d.timeframe || 'No visible';
  $('#support').textContent = d.support || 'No visible';
  $('#resistance').textContent = d.resistance || 'No visible';
  $('#setupText').textContent = d.setup || (d.signal === 'WAIT' ? 'Sin configuración clara' : 'Configuración técnica visible');
  $('#reason').textContent = d.reason || 'Sin comentario.';
  $('#invalidationText').textContent = d.invalidation || (d.signal === 'WAIT' ? 'No aplica' : 'Si el precio rompe la estructura visible en sentido contrario.');
  $('#riskNote').textContent = d.risk_note || 'La lectura se basa solo en una captura y no garantiza el movimiento futuro del precio.';
  $('#assetBadge').textContent = d.asset || 'No identificado';
  saveEntryToHistory(d, exitTime);
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


$('#historyList').addEventListener('click', (event) => {
  const btn = event.target.closest('.mark-btn');
  if (!btn) return;
  setOutcome(btn.dataset.id, btn.dataset.outcome);
});

$('#clearHistoryBtn').addEventListener('click', () => {
  if (!readHistory().length) return;
  if (confirm('¿Borrar todo el historial de entradas guardado en este dispositivo?')) {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LEGACY_HISTORY_KEY);
    renderHistory();
  }
});

renderHistory();
refreshStatus();
