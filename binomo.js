import crypto from 'crypto';

function sanitizeErrors(value) {
  const scrub = (x) => {
    if (x == null) return x;
    if (typeof x === 'string') {
      return x
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/(password|authtoken|token|authorization)[^,}\]]*/gi, '$1:[redacted]')
        .slice(0, 240);
    }
    if (Array.isArray(x)) return x.slice(0, 10).map(scrub);
    if (typeof x === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(x).slice(0, 20)) {
        if (/password|authtoken|token|authorization|cookie/i.test(k)) out[k] = '[redacted]';
        else out[k] = scrub(v);
      }
      return out;
    }
    return x;
  };
  return scrub(value);
}

function headerSummary(headers) {
  const get = (k) => headers.get(k) || undefined;
  return {
    server: get('server'),
    'content-type': get('content-type'),
    'cf-ray': get('cf-ray'),
    'cf-cache-status': get('cf-cache-status'),
    location: get('location')
  };
}

async function parseResponse(resp) {
  const text = await resp.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { text, json };
}

export async function diagnoseBinomo({ email, password }) {
  const credentialsPresent = Boolean(email && password);
  const result = {
    version: 'v26-binomo-readonly-diagnostic',
    mode: 'read-only',
    platform: 'binomo.com',
    credentials_present: credentialsPresent,
    login: { ok: false },
    crypto_idx: { seen: false },
    websocket: { attempted: false, ok: false },
    historical: { attempted: false, available: false },
  };

  if (!credentialsPresent) {
    result.login.message = 'Faltan BINOMO_EMAIL y BINOMO_PASSWORD en Render.';
    return result;
  }

  const deviceId = crypto.randomInt(100000000, 999999999).toString();
  const headers = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'device-id': deviceId,
    'device-type': 'web',
    origin: 'https://binomo.com',
    referer: 'https://binomo.com/',
    'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    'user-timezone': 'America/Montevideo'
  };

  let resp;
  try {
    resp = await fetch('https://api.binomo.com/passport/v2/sign_in?locale=en', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    result.login.message = `No se pudo contactar el endpoint: ${e.name || 'error'}`;
    return result;
  }

  const parsed = await parseResponse(resp);
  result.login.http_status = resp.status;
  result.login.headers = headerSummary(resp.headers);
  result.login.response = parsed.json ? {
    kind: 'json',
    top_level_keys: Object.keys(parsed.json).slice(0, 20),
    errors_sanitized: sanitizeErrors(parsed.json.errors)
  } : { kind: 'text', length: parsed.text.length };

  const data = parsed.json?.data;
  const authtoken = data?.authtoken;
  result.login.authtoken_present = Boolean(authtoken);
  result.login.ok = resp.ok && Boolean(authtoken);

  if (!result.login.ok) {
    result.login.message = 'Binomo no devolvió un authtoken.';
    return result;
  }

  // Deliberadamente NO abrimos WebSocket ni realizamos operaciones en V26.
  // La biblioteca pública reporta que Crypto IDX aparece en su catálogo; esta fase
  // solo confirma si Render puede autenticarse de forma legítima.
  result.crypto_idx.note = 'Login OK. La siguiente fase puede consultar catálogo/RIC y luego explorar datos de mercado.';
  result.historical.note = 'No se consulta histórico todavía; primero confirmamos autenticación desde Render.';
  return result;
}
