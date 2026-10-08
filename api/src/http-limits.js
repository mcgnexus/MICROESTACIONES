// Límites para toda llamada externa.
//
// Cada proveedor (Meta, Twilio, Resend, AEMET, Open-Meteo) se consulta con un
// tiempo máximo y con reintentos acotados: una llamada colgada no debe agotar el
// presupuesto de CPU ni de peticiones del alojamiento contratado. Los valores
// son conservadores y se ajustan por entorno.
//
//   HTTP_TIMEOUT_MS    tiempo máximo para recibir cabeceras (8 s).
//   HTTP_MAX_MS        tope duro de la llamada completa, incluido el cuerpo (15 s).

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function httpLimits(env = process.env) {
  const timeoutMs = clamp(Number(env.HTTP_TIMEOUT_MS), 500, 60000, 8000);
  const maxMs = clamp(Number(env.HTTP_MAX_MS), timeoutMs, 120000, Math.max(timeoutMs, 15000));
  return { timeoutMs, maxMs };
}

function timeoutError(ms) {
  const error = new Error(`timeout after ${ms}ms`);
  error.code = 'timeout';
  // Un tiempo máximo es reintental, nunca un rechazo definitivo.
  error.permanent = false;
  return error;
}

// Igual de presupuesto, pero para respuestas binarias (p. ej. el tar de CAP
// de AEMET): devuelve el ArrayBuffer bajo el mismo tope completo.
export async function fetchBinaryWithLimits(url, options = {}, env = process.env) {
  const { timeoutMs, maxMs } = httpLimits(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  try {
    const response = await fetch(url, { ...options, signal: options.signal ?? controller.signal });
    const buffer = await response.arrayBuffer();
    return { response, buffer };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw timeoutError(maxMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Llamada completa (cabeceras + cuerpo JSON) bajo un único presupuesto. Un
// timeout al recibir cabeceras es ambiguo: el proveedor pudo aceptar el POST, así
// que quien envía no debe reenviarlo automáticamente. Si ya llegaron cabeceras
// 2xx y solo se atasca el cuerpo, el envío sí está aceptado y se devuelve sin id.
export async function fetchJsonWithLimits(url, options = {}, env = process.env) {
  const { timeoutMs, maxMs } = httpLimits(env);
  const controller = new AbortController();
  const started = Date.now();
  let timer = setTimeout(() => controller.abort(), timeoutMs);
  let response = null;
  try {
    response = await fetch(url, { ...options, signal: options.signal ?? controller.signal });
    clearTimeout(timer);
    timer = null;

    const remaining = Math.max(1, maxMs - (Date.now() - started));
    timer = setTimeout(() => controller.abort(), remaining);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* respuesta no JSON */ }
    return { response, data, text, bodyTimedOut: false };
  } catch (error) {
    const timedOut = controller.signal.aborted || error?.name === 'AbortError';
    if (timedOut && response?.ok) {
      // El POST fue aceptado por HTTP; no lo repitamos aunque falte el recibo
      // (provider_message_id). Se marca sent y se deja visible la falta de recibo.
      return { response, data: null, text: '', bodyTimedOut: true };
    }
    if (timedOut) throw timeoutError(Math.max(timeoutMs, maxMs));
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
