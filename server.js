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

    const prompt = `Analiza esta captura como un gráfico de trading de VELAS DE 5 MINUTOS. La persona usa este módulo exclusivamente para capturas en timeframe 5m y quiere una lectura visual educativa, clara y conservadora.

Contexto:
- Hora actual aproximada del teléfono: ${localTime}
- Zona horaria: ${timeZone}
- Timeframe esperado: 5 minutos
- Duración de la operación simulada: 5 minutos

Primero:
1. Comprueba que sea una captura legible de un gráfico financiero.
2. Comprueba visualmente que el timeframe sea 5m. Si se ve claramente otro timeframe, usa WAIT y explica que la captura no está en 5m. Si el timeframe no puede verificarse, indícalo y sé más conservador.
3. Analiza solamente lo que aparece en la captura; no inventes precios, indicadores ni niveles.

Para decidir BUY / SELL / WAIT en 5m, evalúa en conjunto:
- dirección y estructura de las últimas velas;
- máximos y mínimos recientes;
- impulso y pérdida de impulso;
- retroceso después de un movimiento;
- rechazo o continuación visible;
- proximidad a soporte/resistencia visibles;
- tamaño relativo de cuerpos y mechas;
- si la última vela todavía está incompleta o la configuración necesita confirmación.

BUY:
- debe existir sesgo alcista razonablemente claro;
- preferentemente un retroceso/rechazo o continuación alcista visible;
- evita BUY justo debajo de una resistencia evidente o después de una subida agotada.

SELL:
- debe existir sesgo bajista razonablemente claro;
- preferentemente un retroceso/rechazo o continuación bajista visible;
- evita SELL justo encima de un soporte evidente o después de una caída agotada.

WAIT:
- úsalo cuando no haya ventaja visual clara, haya señales contradictorias, la última vela esté formando una situación ambigua, falte confirmación, el precio esté atrapado entre niveles cercanos o el gráfico no permita verificar bien el contexto.
- IMPORTANTE: si usas WAIT, reason y setup deben explicar exactamente QUÉ FALTA para considerar una COMPRA o una VENTA. No respondas solamente "sin entrada clara".

Reglas:
- expiry_minutes siempre 5.
- Para BUY o SELL, entry_time debe ser HH:MM cercano al momento actual.
- Para WAIT, entry_time debe ser --:--.
- confidence mide claridad del análisis visual, NO probabilidad de ganar.
- No prometas ganancias ni presentes ninguna señal como segura.
- Si hay una configuración suficientemente clara en 5m, no uses WAIT solo por ser conservador: elige BUY o SELL y explica la evidencia visible.

Devuelve únicamente JSON válido:
{
  "valid_chart": true,
  "asset": "texto o No identificado",
  "timeframe": "5m o No verificable",
  "signal": "BUY|SELL|WAIT",
  "entry_time": "HH:MM o --:--",
  "expiry_minutes": 5,
  "confidence": 0,
  "trend": "alcista|bajista|lateral|incierta",
  "support": "texto breve o No visible",
  "resistance": "texto breve o No visible",
  "setup": "qué configuración de 5m se observa; si WAIT, qué falta para operar",
  "reason": "explicación concreta basada en las velas visibles; si WAIT, indica qué confirmación convertiría la lectura en BUY o SELL",
  "invalidation": "qué movimiento visible invalidaría la lectura o No aplica",
  "risk_note": "Análisis visual educativo en 5m; una captura no permite predecir con certeza el próximo movimiento."
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
