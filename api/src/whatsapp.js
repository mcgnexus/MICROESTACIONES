// Envío de WhatsApp. Proveedores: manual (piloto), meta, twilio, console y disabled.
// Las credenciales viven solo en el servidor; el navegador nunca las ve.
// Toda llamada sale con tiempo máximo y tope de reintentos (http-limits.js).
import { classifyHttp, providerNotConfigured, manualPending } from './notification-provider.js';
import { fetchJsonWithLimits } from './http-limits.js';

export function whatsappProvider(env = process.env) {
  return (env.WHATSAPP_PROVIDER || 'disabled').toLowerCase();
}

const digits = (address) => String(address).replace(/[^\d]/g, '');

export async function sendWhatsApp(address, text, env = process.env) {
  const provider = whatsappProvider(env);
  if (provider === 'disabled') return providerNotConfigured();
  // Modo piloto: no se envía solo. El aviso queda en la bandeja para enviarlo a mano.
  if (provider === 'manual') return manualPending();
  if (provider === 'console') {
    console.log(`[whatsapp→${address}] ${text.replace(/\n+/g, ' | ')}`);
    return { ok: true, permanent: false, messageId: 'console' };
  }
  try {
    if (provider === 'meta') {
      const { response, data, bodyTimedOut } = await fetchJsonWithLimits(
        `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: digits(address), type: 'text', text: { body: text } }),
        },
        env,
      );
      if (!response.ok) {
        // 429 confirma que no se aceptó el envío: es seguro reintentar desde la
        // cola. Un 5xx puede ser ambiguo, así que no reenviamos a ciegas.
        if (response.status === 429) return { ok: false, permanent: false, error: 'rate_limited' };
        if (response.status >= 500) return { ok: false, permanent: true, ambiguous: true, error: `meta_${response.status}_delivery_unknown` };
        return { ok: false, ...classifyHttp(response.status), error: `meta_${response.status}` };
      }
      return {
        ok: true, messageId: data?.messages?.[0]?.id ?? null,
        warning: bodyTimedOut ? 'provider_accepted_receipt_missing' : null,
      };
    }
    if (provider === 'twilio') {
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const form = new URLSearchParams({
        From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`, To: `whatsapp:${address}`, Body: text,
      });
      const { response, data, bodyTimedOut } = await fetchJsonWithLimits('https://api.twilio.com/2010-04-01/Accounts/'
        + `${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      }, env);
      if (!response.ok) {
        if (response.status === 429) return { ok: false, permanent: false, error: 'rate_limited' };
        if (response.status >= 500) return { ok: false, permanent: true, ambiguous: true, error: `twilio_${response.status}_delivery_unknown` };
        return { ok: false, ...classifyHttp(response.status), error: `twilio_${response.status}` };
      }
      return { ok: true, messageId: data?.sid ?? null, warning: bodyTimedOut ? 'provider_accepted_receipt_missing' : null };
    }
    return { ok: false, permanent: true, error: `unknown_whatsapp_provider:${provider}` };
  } catch (error) {
    // En un timeout/red caída tras enviar el POST no sabemos si el proveedor lo
    // aceptó. Se termina en failed para revisión; reenviarlo podría duplicarlo.
    return {
      ok: false, permanent: true, ambiguous: true,
      error: error.code === 'timeout' ? `delivery_unknown_timeout_${provider}` : `delivery_unknown_${provider}:${error.message}`,
    };
  }
}
