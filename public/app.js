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

// --- Bot DEMO V6: backtest local, sin ejecución de operaciones ---
const botCsvInput = $('#botCsvInput');
const botPickBtn = $('#botPickBtn');
const runBotBtn = $('#runBotBtn');
let botCandles = [];

document.querySelectorAll('.mode-tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b === btn));
  const bot = btn.dataset.mode === 'bot';
  document.querySelectorAll('.capture-only,[data-capture="1"]').forEach(el => el.classList.toggle('hidden', bot));
  $('#botSection').classList.toggle('hidden', !bot);
}));

botPickBtn?.addEventListener('click', () => botCsvInput.click());
botCsvInput?.addEventListener('change', async () => {
  const f = botCsvInput.files?.[0]; if (!f) return;
  try {
    botCandles = parseCandleCsv(await f.text());
    $('#botFileInfo').textContent = `${f.name} · ${botCandles.length} velas válidas y únicas`;
    $('#botFileInfo').classList.remove('hidden'); runBotBtn.classList.remove('hidden');
  } catch (e) { alert(e.message); }
});

function parseCandleCsv(text) {
  const lines = text.trim().split(/\r?\n/); if (lines.length < 3) throw new Error('CSV sin datos suficientes.');
  const headers = lines[0].split(',').map(x => x.trim().replace(/^"|"$/g,''));
  const idx = Object.fromEntries(headers.map((h,i)=>[h,i]));
  for (const k of ['candle_time_utc','open','high','low','close']) if (idx[k] == null) throw new Error(`Falta la columna ${k}.`);
  const byTime = new Map();
  for (let n=1;n<lines.length;n++) {
    const a=lines[n].split(','); const t=a[idx.candle_time_utc]?.trim(); if(!t) continue;
    const c={t, time:new Date(t).getTime(), open:+a[idx.open], high:+a[idx.high], low:+a[idx.low], close:+a[idx.close]};
    if(Number.isFinite(c.time)&&[c.open,c.high,c.low,c.close].every(Number.isFinite)) byTime.set(t,c); // conserva la última actualización de cada vela
  }
  return [...byTime.values()].sort((a,b)=>a.time-b.time);
}
function ema(vals, period){const k=2/(period+1);let e=vals[0];for(let i=1;i<vals.length;i++)e=vals[i]*k+e*(1-k);return e;}
function rsi(vals,p=14){if(vals.length<p+1)return 50;let g=0,l=0;for(let i=vals.length-p;i<vals.length;i++){const d=vals[i]-vals[i-1];if(d>0)g+=d;else l-=d;}if(l===0)return 100;const rs=(g/p)/(l/p);return 100-(100/(1+rs));}
function botSignal(candles,i,strategy){
  if(i<25)return null; const w=candles.slice(i-24,i+1), closes=w.map(x=>x.close), c=candles[i];
  const e9=ema(closes.slice(-12),9), e21=ema(closes,21), rv=rsi(closes,14), mom=c.close-closes[closes.length-4];
  const down=(c.close<e9)+(e9<e21)+(rv<48)+(mom<0)+(c.close<c.open);
  const up=(c.close>e9)+(e9>e21)+(rv>52)+(mom>0)+(c.close>c.open);
  let signal=null,score=0;
  if(down>=4){signal='SELL';score=down+2;} else if(up>=4){signal='BUY';score=up+2;}
  if(!signal)return null;
  // El modo validado refleja el hallazgo exploratorio del historial: score equivalente 7–8 y mayor selectividad en SELL.
  if(strategy==='validated' && (score<7||score>8)) return null;
  if(strategy==='validated' && signal==='BUY' && up<5) return null;
  const confidence=Math.min(95, 55+score*5);
  return {signal,score,confidence,rsi:rv};
}
function runBacktest(){
  const duration=+$('#botDuration').value, strategy=$('#botStrategy').value, out=[];
  for(let i=25;i<botCandles.length-duration;i++){
    const s=botSignal(botCandles,i,strategy); if(!s)continue;
    const entry=botCandles[i].close, exit=botCandles[i+duration].close;
    const diff=exit-entry; const result=Math.abs(diff)<1e-12?'DRAW':(s.signal==='BUY'?diff>0:diff<0)?'WIN':'LOSS';
    out.push({...s,entryIndex:i,entryTime:botCandles[i].t,exitTime:botCandles[i+duration].t,result});
    i+=duration-1;
  }
  renderBotResults(out,duration);
}
runBotBtn?.addEventListener('click',runBacktest);
function renderBotResults(rows,duration){
  const wins=rows.filter(x=>x.result==='WIN').length, losses=rows.filter(x=>x.result==='LOSS').length, resolved=wins+losses;
  $('#botRows').textContent=`${botCandles.length} velas`; $('#botSignals').textContent=rows.length; $('#botWins').textContent=wins; $('#botLosses').textContent=losses; $('#botAccuracy').textContent=resolved?`${(wins/resolved*100).toFixed(1)}%`:'—';
  $('#botSummary').textContent=`Duración ${duration} min. DRAW no cuenta en el porcentaje. Resultado calculado con el cierre futuro solo después de generar cada señal; no se usa para decidir la entrada.`;
  const list=$('#botSignalList'); list.innerHTML='';
  rows.slice(-50).reverse().forEach(x=>{const d=document.createElement('div');d.className=`bot-signal-row ${x.signal.toLowerCase()}`;const dt=new Date(x.entryTime);d.innerHTML=`<div><strong>${x.signal==='BUY'?'↑ COMPRA':'↓ VENTA'} · ${dt.toLocaleString()}</strong><small>score ${x.score} · confianza análisis ${x.confidence}%</small></div><strong class="${x.result.toLowerCase()}">${x.result}</strong>`;list.appendChild(d);});
  $('#botResults').classList.remove('hidden'); $('#botResults').scrollIntoView({behavior:'smooth'});
}
