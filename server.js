import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { diagnoseStockity } from './stockity.js';
import { diagnoseBinomo } from './binomo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Solo se permiten PNG, JPG o WEBP.'), ok);
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('La IA no devolvió un resultado válido.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function safeTimezone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 80) return 'UTC';
  try {
    new Intl.DateTimeFormat('es', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'UTC';
  }
}

function addMinutesToHHMM(value, minutes) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return '--:--';
  const total = ((Number(match[1]) * 60 + Number(match[2]) + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

app.get('/api/status', (_req, res) => {
  res.json({
    ai: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-5.6-luna'
  });
});


app.get('/api/stockity/status', (_req, res) => {
  res.json({
    configured: Boolean(process.env.STOCKITY_EMAIL && process.env.STOCKITY_PASSWORD),
    mode: 'read-only'
  });
});

app.post('/api/stockity/diagnose', async (_req, res) => {
  try {
    const result = await diagnoseStockity({
      email: process.env.STOCKITY_EMAIL,
      password: process.env.STOCKITY_PASSWORD
    });
    const status = result.credentials_present ? 200 : 503;
    res.status(status).json(result);
  } catch (err) {
    console.error('Stockity diagnostic:', err);
    res.status(500).json({ mode: 'read-only', error: 'Falló la prueba de conexión de Stockity.' });
  }
});


app.get('/api/binomo/status', (_req, res) => {
  res.json({
    configured: Boolean(process.env.BINOMO_EMAIL && process.env.BINOMO_PASSWORD),
    mode: 'read-only'
  });
});

app.post('/api/binomo/diagnose', async (_req, res) => {
  try {
    const result = await diagnoseBinomo({
      email: process.env.BINOMO_EMAIL,
      password: process.env.BINOMO_PASSWORD
    });
    const status = result.credentials_present ? 200 : 503;
    res.status(status).json(result);
  } catch (err) {
    console.error('Binomo diagnostic:', err);
    res.status(500).json({ mode: 'read-only', error: 'Falló la prueba de conexión de Binomo.' });
  }
});

app.post('/api/analyze', upload.single('chart'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Selecciona una captura del gráfico.' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'La aplicación está instalada, pero falta activar la IA en el servidor.',
        setup: true
      });
    }

    const timeZone = safeTimezone(req.body?.timezone);
    const now = new Date();
    const localTime = new Intl.DateTimeFormat('es', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const prompt = `Analiza SOLO la captura de velas 5m para una operación DEMO de 5 minutos. Hora: ${localTime} (${timeZone}).

Decide BUY, SELL o WAIT usando estructura reciente, impulso, máximos/mínimos, soporte/resistencia, cuerpos/mechas y confirmación.

Reglas clave:
- No inventes datos. Si no es gráfico legible o no es 5m, WAIT.
- BUY/SELL solo con ventaja visual clara.
- NO persigas movimientos extendidos: tras varias velas fuertes consecutivas cerca de máximo/resistencia o mínimo/soporte, WAIT salvo que exista un gatillo NUEVO (retroceso/retest + rechazo, consolidación + ruptura confirmada, o ruptura fresca tras pausa).
- Una sola mecha larga contra tendencia NO basta para operar reversión.
- Tendencia fuerte por sí sola NO basta para entrar tarde.
- WAIT si hay rango, contradicción, vela incompleta, agotamiento o falta confirmación.
- confidence = claridad visual, no probabilidad de ganar. Para WAIT usa 0.
- entry_time: BUY/SELL HH:MM cercano a ahora; WAIT --:--. expiry_minutes=5.
- Textos muy breves.

Devuelve SOLO JSON válido:
{"valid_chart":true,"asset":"texto","timeframe":"5m","signal":"BUY|SELL|WAIT","entry_time":"HH:MM|--:--","expiry_minutes":5,"confidence":0,"trend":"alcista|bajista|lateral|incierta","support":"breve","resistance":"breve","setup":"máx 15 palabras","reason":"máx 30 palabras","invalidation":"máx 15 palabras","risk_note":"Análisis visual educativo en 5m; no predice con certeza."}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: dataUrl, detail: 'low' }
          ]
        }],
        max_output_tokens: 350
      })
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('OpenAI API:', response.status, body);
      return res.status(502).json({ error: 'No se pudo completar el análisis con IA.' });
    }

    const body = await response.json();
    const text = body.output_text ||
      body.output?.flatMap(o => o.content || []).find(c => c.type === 'output_text')?.text || '';
    const result = extractJson(text);

    result.expiry_minutes = 5;
    result.confidence = Math.max(0, Math.min(100, Number(result.confidence) || 0));
    if (!['BUY', 'SELL', 'WAIT'].includes(result.signal)) result.signal = 'WAIT';
    if (result.signal === 'WAIT') result.entry_time = '--:--';
    result.exit_time = result.signal === 'WAIT' ? '--:--' : addMinutesToHHMM(result.entry_time, 5);
    if (!result.valid_chart) {
      result.signal = 'WAIT';
      result.entry_time = '--:--';
      result.exit_time = '--:--';
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error inesperado.' });
  }
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'Archivo inválido.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Chart AI Signal listo en http://localhost:${PORT}`));
