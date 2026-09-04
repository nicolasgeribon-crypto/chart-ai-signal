import WebSocket from 'ws';
import crypto from 'crypto';

function timeoutFetch(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function safeHeaderSubset(headers) {
  const names = ['server', 'content-type', 'cf-ray', 'cf-cache-status', 'x-request-id', 'location'];
  const out = {};
  for (const name of names) {
    const v = headers.get(name);
    if (v) out[name] = v.slice(0, 180);
  }
  return out;
}

function bodyFingerprint(text, body) {
  const result = {
    kind: body ? 'json' : 'text',
    length: text.length
  };
  if (body && typeof body === 'object') {
    result.top_level_keys = Object.keys(body).slice(0, 20);
    if (body.data && typeof body.data === 'object') {
      result.data_keys = Object.keys(body.data).filter(k => !/token|password|secret|cookie|email/i.test(k)).slice(0, 20);
    }
    const possibleCode = body.code ?? body.status ?? body.error_code ?? body?.data?.code;
    if (possibleCode !== undefined && possibleCode !== null) result.code = String(possibleCode).slice(0, 80);
  } else {
    const lower = text.toLowerCase();
    result.looks_like_cloudflare = lower.includes('cloudflare') || lower.includes('cf-ray') || lower.includes('attention required');
    result.looks_like_html = /<html|<!doctype/i.test(text);
  }
  return result;
}

function collectSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function cookieHeaderFromSetCookies(setCookies = []) {
  return setCookies.map(v => v.split(';', 1)[0]).filter(Boolean).join('; ');
}

async function attemptLogin({ platform, deviceId, email, password, locale, preflightCookies = '' }) {
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
    'content-type': 'application/json',
    'device-id': deviceId,
    'device-type': 'web',
    'origin': `https://${platform}`,
    'referer': `https://${platform}/`,
    'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
    'user-timezone': 'America/Montevideo'
  };
  const baseCookie = `authtoken=; device_type=web; device_id=${deviceId}`;
  headers.cookie = preflightCookies ? `${preflightCookies}; ${baseCookie}` : baseCookie;

  const resp = await timeoutFetch(
    `https://api.${platform}/passport/v2/sign_in?locale=${encodeURIComponent(locale)}`,
    { method: 'POST', headers, body: JSON.stringify({ email, password }), redirect: 'manual' },
    10000
  );
  const text = await resp.text();
  const body = safeJson(text);
  const authToken = body?.data?.authtoken;
  return {
    authToken,
    public: {
      locale,
      ok: Boolean(resp.ok && authToken),
      http_status: resp.status,
      headers: safeHeaderSubset(resp.headers),
      response: bodyFingerprint(text, body),
      authtoken_present: Boolean(authToken)
    }
  };
}

export async function diagnoseStockity({ email, password }) {
  const started = Date.now();
  const deviceId = crypto.randomUUID().replaceAll('-', '');
  const platform = 'stockity.id';

  const result = {
    version: 'v24-auth-diagnostic',
    mode: 'read-only',
    platform,
    credentials_present: Boolean(email && password),
    preflight: {},
    login_attempts: [],
    login: { ok: false },
    websocket: { ok: false, events: [], crypto_idx_seen: false },
    elapsed_ms: 0
  };

  if (!email || !password) {
    result.error = 'Faltan STOCKITY_EMAIL o STOCKITY_PASSWORD en Render.';
    return result;
  }

  let preflightCookies = '';
  try {
    const pre = await timeoutFetch(`https://${platform}/`, {
      method: 'GET',
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36'
      },
      redirect: 'manual'
    }, 8000);
    const setCookies = collectSetCookies(pre.headers);
    preflightCookies = cookieHeaderFromSetCookies(setCookies);
    result.preflight = {
      ok: pre.ok,
      http_status: pre.status,
      headers: safeHeaderSubset(pre.headers),
      cookie_names: setCookies.map(v => v.split('=', 1)[0]).filter(Boolean).slice(0, 20)
    };
    try { await pre.body?.cancel(); } catch {}
  } catch (err) {
    result.preflight = { ok: false, message: err?.name === 'AbortError' ? 'Timeout en preflight.' : String(err?.message || err) };
  }

  let authToken;
  for (const locale of ['id', 'en']) {
    try {
      const attempt = await attemptLogin({ platform, deviceId, email, password, locale, preflightCookies });
      result.login_attempts.push(attempt.public);
      if (attempt.authToken) {
        authToken = attempt.authToken;
        result.login = { ok: true, locale, http_status: attempt.public.http_status };
        break;
      }
    } catch (err) {
      result.login_attempts.push({ locale, ok: false, message: err?.name === 'AbortError' ? 'Timeout al conectar con Stockity.' : String(err?.message || err) });
    }
  }

  if (!authToken) {
    result.login = {
      ok: false,
      message: 'Stockity no entregó un authtoken en los intentos seguros. Revisar diagnóstico; no se expusieron credenciales ni cuerpo completo de respuesta.'
    };
    result.elapsed_ms = Date.now() - started;
    return result;
  }

  const wsHeaders = {
    Origin: `https://${platform}`,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
    'authorization-token': authToken,
    'device-id': deviceId,
    'device-type': 'web',
    Cookie: `authtoken=${authToken}; device_type=web; device_id=${deviceId};`
  };

  try {
    await new Promise((resolve) => {
      const ws = new WebSocket(`wss://ws.${platform}/?v=2&vsn=2.0.0`, { headers: wsHeaders, handshakeTimeout: 8000 });
      const eventSet = new Set();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        result.websocket.events = [...eventSet].slice(0, 25);
        try { ws.close(); } catch {}
        resolve();
      };
      const timer = setTimeout(finish, 7000);

      ws.on('open', () => {
        result.websocket.ok = true;
        const joins = [
          { topic: 'connection', event: 'phx_join', payload: {}, ref: '', join_ref: '6' },
          { topic: 'account', event: 'phx_join', payload: {}, ref: '', join_ref: '9' },
          { topic: 'asset', event: 'phx_join', payload: {}, ref: '', join_ref: '26' }
        ];
        for (const msg of joins) ws.send(JSON.stringify(msg));
      });

      ws.on('message', (data) => {
        const raw = data.toString();
        if (raw.includes('Z-CRY/IDX') || raw.toLowerCase().includes('crypto idx')) result.websocket.crypto_idx_seen = true;
        const parsed = safeJson(raw);
        if (parsed?.event) eventSet.add(String(parsed.event));
        if (parsed?.payload?.ric === 'Z-CRY/IDX') result.websocket.crypto_idx_seen = true;
      });

      ws.on('unexpected-response', (_req, response) => {
        result.websocket.ok = false;
        result.websocket.http_status = response.statusCode;
        result.websocket.message = `WebSocket rechazado con HTTP ${response.statusCode}.`;
        clearTimeout(timer);
        finish();
      });

      ws.on('error', (err) => {
        if (!result.websocket.message) result.websocket.message = String(err?.message || err);
      });

      ws.on('close', (code) => {
        result.websocket.close_code = code;
        clearTimeout(timer);
        finish();
      });
    });
  } catch (err) {
    result.websocket.message = String(err?.message || err);
  }

  result.elapsed_ms = Date.now() - started;
  return result;
}
