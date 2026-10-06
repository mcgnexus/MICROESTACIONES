// Envío de WhatsApp. Proveedores: manual (piloto), meta, twilio, console y disabled.
// Las credenciales viven solo en el servidor; el navegador nunca las ve.
import { classifyHttp, providerNotConfigured, manualPending } from './notification-provider.js';

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
      const response = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: digits(address), type: 'text', text: { body: text } }),
      });
      if (!response.ok) return { ok: false, ...classifyHttp(response.status), error: `meta_${response.status}` };
      const data = await response.json();
      return { ok: true, messageId: data?.messages?.[0]?.id ?? null };
    }
    if (provider === 'twilio') {
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const form = new URLSearchParams({
        From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`, To: `whatsapp:${address}`, Body: text,
      });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      if (!response.ok) return { ok: false, ...classifyHttp(response.status), error: `twilio_${response.status}` };
      const data = await response.json();
      return { ok: true, messageId: data?.sid ?? null };
    }
    return { ok: false, permanent: true, error: `unknown_whatsapp_provider:${provider}` };
  } catch (error) {
    return { ok: false, permanent: false, error: error.message };
  }
}
