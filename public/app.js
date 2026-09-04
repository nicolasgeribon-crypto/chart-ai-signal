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

// --- Bot DEMO V7: backtest local + validación temporal fuera de muestra ---
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
    if(Number.isFinite(c.time)&&[c.open,c.high,c.low,c.close].every(Number.isFinite)) byTime.set(t,c);
  }
  return [...byTime.values()].sort((a,b)=>a.time-b.time);
}
function ema(vals, period){const k=2/(period+1);let e=vals[0];for(let i=1;i<vals.length;i++)e=vals[i]*k+e*(1-k);return e;}
function rsi(vals,p=14){if(vals.length<p+1)return 50;let g=0,l=0;for(let i=vals.length-p;i<vals.length;i++){const d=vals[i]-vals[i-1];if(d>0)g+=d;else l-=d;}if(l===0)return 100;const rs=(g/p)/(l/p);return 100-(100/(1+rs));}
function featureAt(candles,i){
  if(i<25)return null;
  const w=candles.slice(i-24,i+1), closes=w.map(x=>x.close), c=candles[i];
  const e9=ema(closes.slice(-12),9), e21=ema(closes,21), rv=rsi(closes,14), mom=c.close-closes[closes.length-4];
  const recent=candles.slice(Math.max(0,i-3),i+1);
  const recentUp=recent.filter(x=>x.close>x.open).length, recentDown=recent.filter(x=>x.close<x.open).length;
  const down=(c.close<e9)+(e9<e21)+(rv<48)+(mom<0)+(c.close<c.open);
  const up=(c.close>e9)+(e9>e21)+(rv>52)+(mom>0)+(c.close>c.open);
  return {e9,e21,rsi:rv,mom,up,down,recentUp,recentDown,c};
}
function basicSignal(candles,i,strategy){
  const f=featureAt(candles,i); if(!f)return null;
  let signal=null,score=0;
  if(f.down>=4){signal='SELL';score=f.down+2;} else if(f.up>=4){signal='BUY';score=f.up+2;}
  if(!signal)return null;
  if(strategy==='validated' && (score<7||score>8)) return null;
  if(strategy==='validated' && signal==='BUY' && f.up<5) return null;
  const confidence=Math.min(95,55+score*5);
  return {signal,score,confidence,rsi:f.rsi};
}
function resultFor(candles,i,duration,signal){
  if(i+duration>=candles.length)return 'DRAW';
  const diff=candles[i+duration].close-candles[i].close;
  if(Math.abs(diff)<1e-12)return 'DRAW';
  return (signal==='BUY'?diff>0:diff<0)?'WIN':'LOSS';
}
function runFixedBacktest(strategy,duration,start=25,end=botCandles.length-duration){
  const out=[];
  for(let i=Math.max(25,start);i<Math.min(end,botCandles.length-duration);i++){
    const s=basicSignal(botCandles,i,strategy); if(!s)continue;
    const result=resultFor(botCandles,i,duration,s.signal);
    out.push({...s,entryIndex:i,entryTime:botCandles[i].t,exitTime:botCandles[i+duration].t,result});
    i+=duration-1;
  }
  return out;
}
function candidateRules(){
  const rules=[];
  for(const direction of ['SELL','BUY']) for(const votes of [4,5]) for(const trend of [false,true]) for(const majority of [false,true]) {
    const gates=direction==='SELL'?[45,48,50]:[50,52,55];
    for(const rsiGate of gates) rules.push({direction,votes,trend,majority,rsiGate});
  }
  return rules;
}
function matchesRule(f,r){
  if(r.direction==='SELL'){
    if(f.down<r.votes || f.rsi>r.rsiGate) return false;
    if(r.trend && !(f.e9<f.e21)) return false;
    if(r.majority && f.recentDown<3) return false;
  } else {
    if(f.up<r.votes || f.rsi<r.rsiGate) return false;
    if(r.trend && !(f.e9>f.e21)) return false;
    if(r.majority && f.recentUp<3) return false;
  }
  return true;
}
function evaluateRule(rule,duration,start,end){
  const rows=[];
  for(let i=Math.max(25,start);i<Math.min(end,botCandles.length-duration);i++){
    const f=featureAt(botCandles,i); if(!f || !matchesRule(f,rule))continue;
    const result=resultFor(botCandles,i,duration,rule.direction);
    rows.push({signal:rule.direction,score:rule.direction==='SELL'?f.down+2:f.up+2,confidence:null,rsi:f.rsi,entryIndex:i,entryTime:botCandles[i].t,exitTime:botCandles[i+duration].t,result});
    i+=duration-1;
  }
  return rows;
}
function stats(rows){
  const wins=rows.filter(x=>x.result==='WIN').length, losses=rows.filter(x=>x.result==='LOSS').length, resolved=wins+losses;
  return {wins,losses,resolved,total:rows.length,accuracy:resolved?wins/resolved:null};
}
function wilsonLower(w,n,z=1.64){
  if(!n)return 0; const p=w/n, zz=z*z;
  return (p+zz/(2*n)-z*Math.sqrt((p*(1-p)+zz/(4*n))/n))/(1+zz/n);
}
function ruleText(r){
  const dir=r.direction==='SELL'?'VENTA':'COMPRA';
  const trend=r.trend?' + tendencia EMA alineada':'';
  const maj=r.majority?' + ≥3/4 velas en dirección':'';
  const rg=r.direction==='SELL'?`RSI ≤ ${r.rsiGate}`:`RSI ≥ ${r.rsiGate}`;
  return `${dir} · fuerza ≥ ${r.votes}/5 · ${rg}${trend}${maj}`;
}
function runWalkForward(duration){
  const split=Math.floor(botCandles.length*0.70);
  const trainStart=25, trainEnd=split, testStart=split, testEnd=botCandles.length-duration;
  const candidates=[];
  for(const rule of candidateRules()){
    const rows=evaluateRule(rule,duration,trainStart,trainEnd), st=stats(rows);
    if(st.resolved<30 || st.accuracy < 0.55 || wilsonLower(st.wins,st.resolved) <= 0.50)continue;
    candidates.push({rule,rows,st,quality:wilsonLower(st.wins,st.resolved)});
  }
  candidates.sort((a,b)=>b.quality-a.quality || b.st.resolved-a.st.resolved);
  const best=candidates[0];
  if(!best) return {rows:[],train:null,test:null,rule:null,split};
  const testRows=evaluateRule(best.rule,duration,testStart,testEnd), test=stats(testRows);
  return {rows:testRows,train:best.st,test,rule:best.rule,split};
}
function runBacktest(){
  const duration=+$('#botDuration').value, strategy=$('#botStrategy').value;
  if(strategy==='walkforward'){
    const wf=runWalkForward(duration);
    renderWalkForward(wf,duration);
  } else {
    $('#walkForwardPanel').classList.add('hidden');
    renderBotResults(runFixedBacktest(strategy,duration),duration, strategy==='validated'?'Filtro selectivo':'Balanceado');
  }
}
runBotBtn?.addEventListener('click',runBacktest);
function renderWalkForward(wf,duration){
  const panel=$('#walkForwardPanel'); panel.classList.remove('hidden');
  if(!wf.rule){
    $('#selectedRule').textContent='No se encontró un filtro con muestra mínima suficiente en el tramo de entrenamiento.';
    $('#trainAccuracy').textContent='—'; $('#testAccuracy').textContent='—'; $('#trainCount').textContent='0 señales'; $('#testCount').textContent='0 señales';
    $('#validationNote').textContent='El bot no fuerza una estrategia cuando los datos de entrenamiento no alcanzan el mínimo exigido.';
    renderBotResults([],duration,'Validación temporal'); return;
  }
  $('#selectedRule').textContent=ruleText(wf.rule);
  $('#trainAccuracy').textContent=wf.train.accuracy===null?'—':`${(wf.train.accuracy*100).toFixed(1)}%`;
  $('#testAccuracy').textContent=wf.test.accuracy===null?'—':`${(wf.test.accuracy*100).toFixed(1)}%`;
  $('#trainCount').textContent=`${wf.train.resolved} señales resueltas`;
  $('#testCount').textContent=`${wf.test.resolved} señales resueltas`;
  const verdict=wf.test.resolved<20?'Muestra de prueba pequeña; no sacar conclusiones todavía.':wf.test.accuracy>=0.58?'El filtro conserva una ventaja en el tramo no usado para elegirlo. Seguir validando con datos nuevos.':wf.test.accuracy>=0.53?'Hay una ventaja modesta fuera de muestra; necesita más datos.':'El filtro no conserva una ventaja clara fuera de muestra.';
  $('#validationNote').textContent=`Se eligió el filtro usando solo el 70% inicial del historial. El 30% final se reservó como prueba y no participó en la selección. ${verdict}`;
  renderBotResults(wf.rows,duration,'Prueba fuera de muestra');
}
function renderBotResults(rows,duration,label='Backtest'){
  const s=stats(rows);
  $('#botRows').textContent=`${botCandles.length} velas`; $('#botSignals').textContent=rows.length; $('#botWins').textContent=s.wins; $('#botLosses').textContent=s.losses; $('#botAccuracy').textContent=s.accuracy!==null?`${(s.accuracy*100).toFixed(1)}%`:'—';
  $('#botSummary').textContent=`${label}. Duración ${duration} min. DRAW no cuenta. La vela futura se consulta únicamente para calificar WIN/LOSS después de generar la señal.`;
  const list=$('#botSignalList'); list.innerHTML='';
  rows.slice(-50).reverse().forEach(x=>{const d=document.createElement('div');d.className=`bot-signal-row ${x.signal.toLowerCase()}`;const dt=new Date(x.entryTime);const confidence=x.confidence==null?'filtro histórico':`confianza análisis ${x.confidence}%`;d.innerHTML=`<div><strong>${x.signal==='BUY'?'↑ COMPRA':'↓ VENTA'} · ${dt.toLocaleString()}</strong><small>score ${x.score} · ${confidence}</small></div><strong class="${x.result.toLowerCase()}">${x.result}</strong>`;list.appendChild(d);});
  $('#botResults').classList.remove('hidden'); $('#botResults').scrollIntoView({behavior:'smooth'});
}
