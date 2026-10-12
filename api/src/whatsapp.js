// Envío de WhatsApp. Proveedores: manual (piloto), meta, twilio, console y disabled.
// Las credenciales viven solo en el servidor; el navegador nunca las ve.
// Toda llamada sale con tiempo máximo y tope de reintentos (http-limits.js).
//
// Para iniciar conversación o escribir fuera de la ventana de 24 h el proveedor
// exige plantillas aprobadas: por eso, con `meta`/`twilio`, un mensaje sin
// descriptor de plantilla NO se manda como texto, se devuelve `template_required`
// y la cola lo deja pendiente de envío manual.
import { classifyHttp, providerNotConfigured, manualPending } from './notification-provider.js';
import { fetchJsonWithLimits } from './http-limits.js';
import { isProduction } from './env.js';

export function whatsappProvider(env = process.env) {
  return (env.WHATSAPP_PROVIDER || 'disabled').toLowerCase();
}

// ¿Qué proveedores exigen plantilla para todo envío automático? Como no se
// rastrea la ventana de 24 h, se asume fuera de ventana y se exige plantilla.
export function whatsappRequiresTemplate(env = process.env) {
  const provider = whatsappProvider(env);
  return provider === 'meta' || provider === 'twilio';
}

// Meta espera el número internacional en dígitos, sin «+». La normalización
// previa garantiza E.164, así que aquí solo se quita el signo.
const digits = (address) => String(address).replace(/[^\d]/g, '');

// Payload de plantilla de Meta: componentes de cuerpo con los parámetros y, para
// las plantillas de autenticación, el botón configurado (copia o URL).
export function metaTemplatePayload(address, template) {
  const components = [];
  if (template.params.length) {
    components.push({
      type: 'body',
      parameters: template.params.map((text) => ({ type: 'text', text })),
    });
  }
  if (template.category === 'authentication' && template.button && template.button !== 'none') {
    components.push({
      type: 'button', sub_type: template.button, index: '0',
      parameters: [{ type: 'text', text: template.params[0] ?? '' }],
    });
  }
  return {
    messaging_product: 'whatsapp',
    to: digits(address),
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length ? { components } : {}),
    },
  };
}

// Detalle del error del proveedor para poder registrarlo, sin convertirlo en éxito.
function providerError(result, payload) {
  const error = payload?.error ?? null;
  return {
    providerErrorCode: error?.code ?? payload?.code ?? null,
    providerErrorTitle: error?.title ?? null,
    providerErrorMessage: error?.message ?? payload?.message ?? null,
    ...result,
  };
}

export async function sendWhatsApp(address, text, env = process.env, { template = null } = {}) {
  const provider = whatsappProvider(env);
  if (provider === 'disabled') return providerNotConfigured();
  // Modo piloto: no se envía solo. El aviso queda en la bandeja para enviarlo a mano.
  if (provider === 'manual') return manualPending();
  if (provider === 'console') {
    // `console` vale para desarrollo, no para demostrar entrega real.
    if (isProduction(env)) return { ok: false, permanent: true, error: 'console_not_allowed_in_production' };
    console.log(`[whatsapp→${address}] ${text.replace(/\n+/g, ' | ')}`);
    return { ok: true, permanent: false, messageId: 'console' };
  }
  try {
    if (provider === 'meta') {
      if (!template?.name) return { ok: false, permanent: true, error: 'template_required' };
      const { response, data, bodyTimedOut } = await fetchJsonWithLimits(
        `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(metaTemplatePayload(address, template)),
        },
        env,
      );
      if (!response.ok) {
        // 429 confirma que no se aceptó el envío: es seguro reintentar desde la
        // cola. Un 5xx puede ser ambiguo, así que no reenviamos a ciegas.
        if (response.status === 429) return providerError({ ok: false, permanent: false, error: 'rate_limited' }, data);
        if (response.status >= 500) return providerError({ ok: false, permanent: true, ambiguous: true, error: `meta_${response.status}_delivery_unknown` }, data);
        const metaError = data?.error ?? null;
        return providerError({
          ok: false, ...classifyHttp(response.status),
          error: metaError?.code ? `meta_${metaError.code}` : `meta_${response.status}`,
        }, data);
      }
      return {
        ok: true, messageId: data?.messages?.[0]?.id ?? null,
        warning: bodyTimedOut ? 'provider_accepted_receipt_missing' : null,
      };
    }
    if (provider === 'twilio') {
      // Content API: la plantilla aprobada viaja como ContentSid con variables.
      if (!template?.contentSid) return { ok: false, permanent: true, error: 'template_required' };
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const variables = {};
      template.params.forEach((value, index) => { variables[String(index + 1)] = value; });
      const form = new URLSearchParams({
        From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`, To: `whatsapp:${address}`,
        ContentSid: template.contentSid, ContentVariables: JSON.stringify(variables), Body: text,
      });
      const { response, data, bodyTimedOut } = await fetchJsonWithLimits('https://api.twilio.com/2010-04-01/Accounts/'
        + `${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      }, env);
      if (!response.ok) {
        if (response.status === 429) return providerError({ ok: false, permanent: false, error: 'rate_limited' }, data);
        if (response.status >= 500) return providerError({ ok: false, permanent: true, ambiguous: true, error: `twilio_${response.status}_delivery_unknown` }, data);
        return providerError({
          ok: false, ...classifyHttp(response.status),
          error: data?.code ? `twilio_${data.code}` : `twilio_${response.status}`,
        }, data);
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
