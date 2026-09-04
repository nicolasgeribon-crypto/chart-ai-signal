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

export async function diagnoseStockity({ email, password }) {
  const started = Date.now();
  const deviceId = crypto.randomUUID().replaceAll('-', '');
  const platform = 'stockity.id';
  const baseHeaders = {
    'content-type': 'application/json',
    'device-id': deviceId,
    'device-type': 'web',
    'origin': `https://${platform}`,
    'referer': `https://${platform}/`,
    'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/135 Mobile Safari/537.36',
    'user-timezone': 'America/Montevideo',
    'cookie': `authtoken=; device_type=web; device_id=${deviceId}`
  };

  const result = {
    mode: 'read-only',
    platform,
    credentials_present: Boolean(email && password),
    login: { ok: false },
    websocket: { ok: false, events: [], crypto_idx_seen: false },
    elapsed_ms: 0
  };

  if (!email || !password) {
    result.error = 'Faltan STOCKITY_EMAIL o STOCKITY_PASSWORD en Render.';
    return result;
  }

  let authToken;
  try {
    const loginResp = await timeoutFetch(
      `https://api.${platform}/passport/v2/sign_in?locale=en`,
      { method: 'POST', headers: baseHeaders, body: JSON.stringify({ email, password }) },
      10000
    );
    const text = await loginResp.text();
    const body = safeJson(text);
    authToken = body?.data?.authtoken;
    result.login = {
      ok: Boolean(loginResp.ok && authToken),
      http_status: loginResp.status,
      response_type: body ? 'json' : 'text'
    };
    if (!result.login.ok) {
      result.login.message = body?.message || body?.error || body?.data?.message || 'El login no devolvió un authtoken.';
      result.elapsed_ms = Date.now() - started;
      return result;
    }
  } catch (err) {
    result.login.message = err?.name === 'AbortError' ? 'Timeout al conectar con Stockity.' : String(err?.message || err);
    result.elapsed_ms = Date.now() - started;
    return result;
  }

  const wsHeaders = {
    Origin: `https://${platform}`,
    'User-Agent': baseHeaders['user-agent'],
    'authorization-token': authToken,
    'device-id': deviceId,
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
          { topic: 'connection', event: 'phx_join', payload: {}, ref: '1', join_ref: '1' },
          { topic: 'account', event: 'phx_join', payload: {}, ref: '2', join_ref: '2' },
          { topic: 'asset', event: 'phx_join', payload: {}, ref: '3', join_ref: '3' }
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
