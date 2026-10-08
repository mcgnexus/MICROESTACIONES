// Envío de correo. Proveedores: resend, console y disabled. La clave del
// proveedor vive solo en el servidor. Toda llamada sale con tiempo máximo.
import { classifyHttp, providerNotConfigured } from './notification-provider.js';
import { fetchJsonWithLimits } from './http-limits.js';

export function emailProvider(env = process.env) {
  return (env.EMAIL_PROVIDER || 'disabled').toLowerCase();
}

export async function sendEmail(address, subject, text, env = process.env) {
  const provider = emailProvider(env);
  if (provider === 'disabled') return providerNotConfigured();
  if (provider === 'console') {
    console.log(`[email→${address}] ${subject} | ${text.replace(/\n+/g, ' | ')}`);
    return { ok: true, permanent: false, messageId: 'console' };
  }
  try {
    if (provider === 'resend') {
      const { response, data, bodyTimedOut } = await fetchJsonWithLimits('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: address, subject, text }),
      }, env);
      if (!response.ok) {
        // 429 confirma rechazo y se reintenta desde la cola. Un 5xx/timeout es
        // ambiguo: el proveedor puede haber aceptado el correo antes del fallo.
        if (response.status === 429) return { ok: false, permanent: false, error: 'rate_limited' };
        if (response.status >= 500) return { ok: false, permanent: true, ambiguous: true, error: `resend_${response.status}_delivery_unknown` };
        return { ok: false, ...classifyHttp(response.status), error: `resend_${response.status}` };
      }
      return { ok: true, messageId: data?.id ?? null, warning: bodyTimedOut ? 'provider_accepted_receipt_missing' : null };
    }
    return { ok: false, permanent: true, error: `unknown_email_provider:${provider}` };
  } catch (error) {
    // No repetir un POST cuyo resultado sea ambiguo: evitar duplicar correo.
    return {
      ok: false, permanent: true, ambiguous: true,
      error: error.code === 'timeout' ? `delivery_unknown_timeout_${provider}` : `delivery_unknown_${provider}:${error.message}`,
    };
  }
}
