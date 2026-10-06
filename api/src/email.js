// Envío de correo. Proveedores: resend, console y disabled. La clave del
// proveedor vive solo en el servidor.
import { classifyHttp, providerNotConfigured } from './notification-provider.js';

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
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: address, subject, text }),
      });
      if (!response.ok) return { ok: false, ...classifyHttp(response.status), error: `resend_${response.status}` };
      const data = await response.json();
      return { ok: true, messageId: data?.id ?? null };
    }
    return { ok: false, permanent: true, error: `unknown_email_provider:${provider}` };
  } catch (error) {
    return { ok: false, permanent: false, error: error.message };
  }
}
