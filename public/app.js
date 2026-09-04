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

// --- Bot DEMO V10: retroceso + confirmación de rechazo antes de entrar ---
const botCsvInput = $('#botCsvInput');
const botPickBtn = $('#botPickBtn');
const runBotBtn = $('#runBotBtn');
let botCandles = [];
let botFeatureCache = [];

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
    await buildFeatureCacheAsync();
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
  if(i<40)return null;
  const w=candles.slice(i-39,i+1), closes=w.map(x=>x.close), c=candles[i];
  const e9=ema(closes.slice(-18),9), e21=ema(closes.slice(-30),21), rv=rsi(closes,14);
  const mom3=c.close-candles[i-3].close, mom5=c.close-candles[i-5].close;
  const impulseBeforePullback=candles[i-3].close-candles[i-8].close;
  const prev3=candles.slice(i-3,i);
  const recent=candles.slice(i-3,i+1);
  const recentUp=recent.filter(x=>x.close>x.open).length, recentDown=recent.filter(x=>x.close<x.open).length;
  const pullbackUp=prev3.filter(x=>x.close>x.open).length, pullbackDown=prev3.filter(x=>x.close<x.open).length;
  const prevHigh=Math.max(...prev3.map(x=>x.high)), prevLow=Math.min(...prev3.map(x=>x.low));
  const range=Math.max(1e-12,c.high-c.low), body=Math.abs(c.close-c.open), bodyFrac=body/range;
  const upperWick=(c.high-Math.max(c.open,c.close))/range, lowerWick=(Math.min(c.open,c.close)-c.low)/range;
  const ranges=candles.slice(i-9,i+1).map(x=>Math.max(1e-12,x.high-x.low));
  const avgRange=ranges.reduce((a,b)=>a+b,0)/ranges.length;
  const rangeRatio=range/Math.max(1e-12,avgRange);
  const down=(c.close<e9)+(e9<e21)+(rv<48)+(mom3<0)+(c.close<c.open);
  const up=(c.close>e9)+(e9>e21)+(rv>52)+(mom3>0)+(c.close>c.open);
  return {e9,e21,rsi:rv,mom3,mom5,impulseBeforePullback,up,down,recentUp,recentDown,pullbackUp,pullbackDown,prevHigh,prevLow,c,bodyFrac,upperWick,lowerWick,rangeRatio,avgRange,prevClose:candles[i-1].close,prevCandleHigh:candles[i-1].high,prevCandleLow:candles[i-1].low};
}

async function buildFeatureCacheAsync(){
  botFeatureCache = new Array(botCandles.length);
  const chunk=450;
  for(let start=40; start<botCandles.length; start+=chunk){
    const end=Math.min(botCandles.length,start+chunk);
    for(let i=start;i<end;i++) botFeatureCache[i]=featureAt(botCandles,i);
    await new Promise(r=>setTimeout(r,0));
  }
}

function resultFor(candles,i,duration,signal){
  if(i+duration>=candles.length)return 'DRAW';
  const diff=candles[i+duration].close-candles[i].close;
  if(Math.abs(diff)<1e-12)return 'DRAW';
  return (signal==='BUY'?diff>0:diff<0)?'WIN':'LOSS';
}

function pullbackMatch(f,r){
  if(r.pullback==='none') return true;
  if(r.direction==='SELL'){
    if(!(f.e9<f.e21) || !(f.impulseBeforePullback<0)) return false;
    if(f.pullbackUp < (r.pullback==='deep'?2:1)) return false;
    // V10: no entrar apenas termina el retroceso. La vela actual debe confirmar
    // rechazo bajista cerrando por debajo del mínimo de la vela anterior.
    if(!(f.c.close<f.c.open) || !(f.c.close<f.prevCandleLow)) return false;
    // Evita confirmaciones con mecha superior excesiva o cuerpo demasiado débil.
    if(f.bodyFrac<0.35 || f.upperWick>0.45) return false;
    if(r.pullback==='ema' && !(f.prevHigh>=f.e9 && f.c.close<f.e9)) return false;
  } else {
    if(!(f.e9>f.e21) || !(f.impulseBeforePullback>0)) return false;
    if(f.pullbackDown < (r.pullback==='deep'?2:1)) return false;
    // Confirmación alcista: cierre por encima del máximo de la vela anterior.
    if(!(f.c.close>f.c.open) || !(f.c.close>f.prevCandleHigh)) return false;
    // Evita confirmaciones con mecha inferior excesiva o cuerpo demasiado débil.
    if(f.bodyFrac<0.35 || f.lowerWick>0.45) return false;
    if(r.pullback==='ema' && !(f.prevLow<=f.e9 && f.c.close>f.e9)) return false;
  }
  return true;
}

function matchesRule(f,r){
  if(!pullbackMatch(f,r)) return false;
  if(r.direction==='SELL'){
    if(f.down<r.votes || f.rsi>r.rsiGate) return false;
    if(r.momentum==='3' && !(f.mom3<0)) return false;
    if(r.momentum==='5' && !(f.mom5<0)) return false;
  } else {
    if(f.up<r.votes || f.rsi<r.rsiGate) return false;
    if(r.momentum==='3' && !(f.mom3>0)) return false;
    if(r.momentum==='5' && !(f.mom5>0)) return false;
  }
  if(f.bodyFrac<r.bodyMin || f.rangeRatio<r.rangeMin) return false;
  return true;
}

function candidateRules(pullbackOnly=false){
  const rules=[];
  const pullbacks=pullbackOnly?['simple','ema','deep']:['none','simple','ema','deep'];
  for(const direction of ['SELL','BUY']){
    const gates=direction==='SELL'?[48,45,42]:[52,55,58];
    for(const votes of [3,4,5]) for(const rsiGate of gates) for(const momentum of ['3','5'])
      for(const bodyMin of [0.25,0.40]) for(const rangeMin of [0.8,1.0]) for(const pullback of pullbacks)
        rules.push({direction,votes,rsiGate,momentum,bodyMin,rangeMin,pullback});
  }
  return rules;
}

function evaluateRule(rule,duration,start,end){
  const rows=[];
  for(let i=Math.max(40,start);i<Math.min(end,botCandles.length-duration);i++){
    const f=botFeatureCache[i]; if(!f || !matchesRule(f,rule))continue;
    const result=resultFor(botCandles,i,duration,rule.direction);
    rows.push({signal:rule.direction,score:rule.direction==='SELL'?f.down+2:f.up+2,confidence:null,rsi:f.rsi,entryIndex:i,entryTime:botCandles[i].t,exitTime:botCandles[i+duration].t,result,entryType:rule.pullback==='none'?'Continuación directa':'Retroceso'});
    i+=duration-1;
  }
  return rows;
}
function stats(rows){
  const wins=rows.filter(x=>x.result==='WIN').length, losses=rows.filter(x=>x.result==='LOSS').length, resolved=wins+losses;
  return {wins,losses,resolved,total:rows.length,accuracy:resolved?wins/resolved:null};
}
function wilsonLower(w,n,z=1.64){if(!n)return 0;const p=w/n,zz=z*z;return (p+zz/(2*n)-z*Math.sqrt((p*(1-p)+zz/(4*n))/n))/(1+zz/n);}
function ruleText(r){
  const dir=r.direction==='SELL'?'VENTA':'COMPRA';
  const pb=r.pullback==='none'?'continuación directa':r.pullback==='ema'?'retroceso a EMA9':r.pullback==='deep'?'retroceso 2+ velas':'retroceso 1–3 velas';
  return `${dir} · ${pb} + confirmación · fuerza ≥ ${r.votes}/5 · ${r.direction==='SELL'?`RSI ≤ ${r.rsiGate}`:`RSI ≥ ${r.rsiGate}`} · momentum ${r.momentum} · cuerpo ≥ ${Math.round(r.bodyMin*100)}% · rango ≥ ${r.rangeMin.toFixed(1)}×`;
}
function scoreCandidate(a,b){
  if(!a.resolved||!b.resolved)return -1;
  const pooledW=a.wins+b.wins, pooledN=a.resolved+b.resolved;
  const stability=1-Math.min(0.25,Math.abs(a.accuracy-b.accuracy));
  return Math.min(a.accuracy,b.accuracy)*0.55 + wilsonLower(pooledW,pooledN)*0.35 + stability*0.10;
}

async function runRobustValidation(duration,pullbackOnly){
  const cutA=Math.floor(botCandles.length*0.55), cutB=Math.floor(botCandles.length*0.70);
  const candidates=[], rules=candidateRules(pullbackOnly);
  for(let k=0;k<rules.length;k++){
    const rule=rules[k];
    const a=stats(evaluateRule(rule,duration,40,cutA));
    if(a.resolved>=30){
      const b=stats(evaluateRule(rule,duration,cutA,cutB));
      if(b.resolved>=8) candidates.push({rule,a,b,quality:scoreCandidate(a,b)});
    }
    if(k%80===0) await new Promise(r=>setTimeout(r,0));
  }
  candidates.sort((x,y)=>y.quality-x.quality || (y.a.resolved+y.b.resolved)-(x.a.resolved+x.b.resolved));
  const validated=candidates.find(x=>x.a.accuracy>=0.55 && x.b.accuracy>=0.53 && wilsonLower(x.a.wins+x.b.wins,x.a.resolved+x.b.resolved)>0.50);
  const best=validated || candidates.find(x=>(x.a.resolved+x.b.resolved)>=70) || candidates[0];
  if(!best) return {rows:[],a:null,b:null,test:null,rule:null,mode:'none'};
  const testRows=evaluateRule(best.rule,duration,cutB,botCandles.length-duration), test=stats(testRows);
  return {rows:testRows,a:best.a,b:best.b,test,rule:best.rule,mode:validated?'validated':'exploratory'};
}

function basicSignal(i,strategy){
  const f=botFeatureCache[i]; if(!f)return null;
  let signal=null,score=0;
  if(f.down>=4){signal='SELL';score=f.down+2;} else if(f.up>=4){signal='BUY';score=f.up+2;}
  if(!signal)return null;
  if(strategy==='validated' && (score<7||score>8)) return null;
  return {signal,score,confidence:Math.min(95,55+score*5),rsi:f.rsi};
}
function runFixedBacktest(strategy,duration){
  const out=[];
  for(let i=40;i<botCandles.length-duration;i++){
    const s=basicSignal(i,strategy);if(!s)continue;
    out.push({...s,entryIndex:i,entryTime:botCandles[i].t,exitTime:botCandles[i+duration].t,result:resultFor(botCandles,i,duration,s.signal),entryType:'Directa'});
    i+=duration-1;
  }
  return out;
}

async function runBacktest(){
  if(!botCandles.length) return;
  const duration=+$('#botDuration').value, strategy=$('#botStrategy').value;
  const old=runBotBtn.textContent; runBotBtn.disabled=true; runBotBtn.textContent='⏳ Analizando…';
  try{
    await new Promise(r=>setTimeout(r,40));
    if(strategy==='pullback') return renderRobust(await runRobustValidation(duration,true),duration,'Retrocesos');
    if(strategy==='robust') return renderRobust(await runRobustValidation(duration,false),duration,'Mixto');
    $('#walkForwardPanel').classList.add('hidden');
    renderBotResults(runFixedBacktest(strategy,duration),duration,strategy==='validated'?'Filtro selectivo':'Balanceado');
  } finally {runBotBtn.disabled=false;runBotBtn.textContent=old;}
}
runBotBtn?.addEventListener('click',()=>runBacktest().catch(e=>{console.error(e);alert('No se pudo completar el backtest: '+e.message);runBotBtn.disabled=false;runBotBtn.textContent='▶ Ejecutar backtest DEMO';}));

function renderRobust(v,duration,family){
  const panel=$('#walkForwardPanel'); panel.classList.remove('hidden');
  $('#trainLabel').textContent='DESARROLLO 55% + CONFIRMACIÓN 15%'; $('#testLabel').textContent='PRUEBA FINAL 30%';
  if(!v.rule){
    $('#selectedRule').textContent=`No hubo datos suficientes para evaluar ${family.toLowerCase()}.`;
    $('#trainAccuracy').textContent='—'; $('#testAccuracy').textContent='—'; $('#trainCount').textContent='0 señales'; $('#testCount').textContent='0 señales';
    $('#validationNote').textContent='No se fuerza una estrategia. Hace falta más historial o relajar criterios.';
    renderBotResults([],duration,`Validación ${family}`); return;
  }
  const devW=v.a.wins+v.b.wins, devN=v.a.resolved+v.b.resolved, devAcc=devN?devW/devN:null;
  $('#selectedRule').textContent=`${v.mode==='validated'?'CANDIDATO VALIDADO INTERNAMENTE':'MEJOR CANDIDATO EXPLORATORIO'}: ${ruleText(v.rule)}`;
  $('#trainAccuracy').textContent=devAcc===null?'—':`${(devAcc*100).toFixed(1)}%`;
  $('#testAccuracy').textContent=v.test.accuracy===null?'—':`${(v.test.accuracy*100).toFixed(1)}%`;
  $('#trainCount').textContent=`${devN} señales · bloques ${(v.a.accuracy*100).toFixed(1)}% / ${(v.b.accuracy*100).toFixed(1)}%`;
  $('#testCount').textContent=`${v.test.resolved} señales resueltas`;
  const verdict=v.mode==='exploratory'?'No pasó los mínimos internos; se muestra solo para diagnóstico.':v.test.resolved<15?'La prueba final tiene pocas señales; hace falta más historial.':v.test.accuracy>=0.58?'Mantiene una ventaja interesante en el 30% final. Debe validarse con días nuevos.':v.test.accuracy>=0.54?'Mantiene una ventaja modesta; necesita más datos nuevos.':'No mantiene una ventaja suficiente en la prueba final; no debe usarse como estrategia.';
  $('#validationNote').textContent=`Familia ${family}. La regla se buscó en el 55% inicial, tuvo que sobrevivir 15% de confirmación y solo después se evaluó en el 30% final. ${verdict}`;
  renderBotResults(v.rows,duration,v.mode==='validated'?'Prueba final fuera de muestra':'Diagnóstico final fuera de muestra');
}

function renderBotResults(rows,duration,label='Backtest'){
  const s=stats(rows);
  $('#botRows').textContent=`${botCandles.length} velas`; $('#botSignals').textContent=rows.length; $('#botWins').textContent=s.wins; $('#botLosses').textContent=s.losses; $('#botAccuracy').textContent=s.accuracy!==null?`${(s.accuracy*100).toFixed(1)}%`:'—';
  $('#botSummary').textContent=`${label}. Duración ${duration} min. DRAW no cuenta. La vela futura solo se usa después para calificar WIN/LOSS.`;
  const list=$('#botSignalList'); list.innerHTML='';
  rows.slice(-50).reverse().forEach(x=>{const d=document.createElement('div');d.className=`bot-signal-row ${x.signal.toLowerCase()}`;const dt=new Date(x.entryTime);const confidence=x.confidence==null?(x.entryType||'filtro histórico'):`confianza análisis ${x.confidence}%`;d.innerHTML=`<div><strong>${x.signal==='BUY'?'↑ COMPRA':'↓ VENTA'} · ${dt.toLocaleString()}</strong><small>score ${x.score} · ${confidence}</small></div><strong class="${x.result.toLowerCase()}">${x.result}</strong>`;list.appendChild(d);});
  $('#botResults').classList.remove('hidden'); $('#botResults').scrollIntoView({behavior:'smooth'});
}
