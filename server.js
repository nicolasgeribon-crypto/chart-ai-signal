import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

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

    const prompt = `Analiza esta captura de un gráfico de trading como análisis técnico visual educativo. La persona quiere una lectura clara de lo que ES VISIBLE en la imagen, sin inventar información.

Contexto de tiempo:
- Hora actual aproximada del teléfono: ${localTime}
- Zona horaria: ${timeZone}

Reglas obligatorias:
- Primero comprueba que realmente sea una captura de un gráfico financiero legible.
- No inventes activo, precio, timeframe, indicadores, soportes, resistencias ni patrones si no aparecen con claridad.
- Si está borrosa, recortada de forma insuficiente, no se ven velas/precio, el gráfico está desactualizado o no hay una configuración clara, signal debe ser "WAIT".
- Si existe una configuración visual razonablemente clara, signal puede ser "BUY" o "SELL".
- expiry_minutes debe ser siempre 5.
- Para BUY o SELL, entry_time debe ser una hora HH:MM cercana al momento actual, normalmente el siguiente minuto útil. Para WAIT, usa --:--.
- confidence expresa únicamente la claridad/confianza del análisis visual, NO la probabilidad de ganar. Debe estar entre 0 y 100.
- Sé conservador. Si dos lecturas se contradicen o falta contexto, usa WAIT.
- reason debe explicar en español qué elementos visibles sostienen la lectura y qué podría invalidarla.
- No prometas ganancias ni describas la señal como segura.

Devuelve únicamente JSON válido con esta forma exacta:
{
  "valid_chart": true,
  "asset": "texto o No identificado",
  "timeframe": "texto o No visible",
  "signal": "BUY|SELL|WAIT",
  "entry_time": "HH:MM o --:--",
  "expiry_minutes": 5,
  "confidence": 0,
  "trend": "alcista|bajista|lateral|incierta",
  "support": "texto breve o No visible",
  "resistance": "texto breve o No visible",
  "reason": "explicación breve en español",
  "setup": "texto breve describiendo la configuración visible o Sin configuración clara",
  "invalidation": "texto breve indicando qué invalidaría la lectura o No aplica",
  "risk_note": "La lectura se basa solo en una captura y no garantiza el movimiento futuro del precio."
}`;

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
            { type: 'input_image', image_url: dataUrl }
          ]
        }],
        max_output_tokens: 1000
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
