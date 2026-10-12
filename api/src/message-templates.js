// Plantillas de WhatsApp por tipo de mensaje.
//
// La plataforma exige plantillas aprobadas para iniciar conversaciones y para
// escribir fuera de la ventana de atención de 24 horas: un aviso de helada puede
// salir días después del último mensaje del destinatario. Aquí se resuelve, para
// cada tipo, el nombre de plantilla y su idioma desde el entorno, y se arma el
// descriptor que se guarda en la cola para saber qué se intentó enviar.
//
// Las categorías (authentication / utility / marketing) y los precios los fija
// el proveedor y se confirman al implantar: esta guía no presupone que todos los
// mensajes sean gratuitos. El nombre de plantilla debe existir y estar aprobado
// con la MISMA forma que usa el código; si no coincide, el envío fallará y
// quedará registrado, nunca como un éxito ficticio.
//
// Escaparate de tipos de mensaje:
//   contact_verification  código de verificación (authentication)
//   alert                 aviso solicitado (utility)
//   lead_confirmation     confirmación de solicitud (utility)
//   commercial            novedades y ofertas (marketing)
//   test                  envío de prueba de administración (utility)
export const TEMPLATE_KINDS = ['contact_verification', 'alert', 'lead_confirmation', 'commercial', 'test'];

export const TEMPLATE_ENV_KEYS = {
  contact_verification: 'WHATSAPP_TEMPLATE_VERIFICATION',
  alert: 'WHATSAPP_TEMPLATE_ALERT',
  lead_confirmation: 'WHATSAPP_TEMPLATE_LEAD',
  commercial: 'WHATSAPP_TEMPLATE_COMMERCIAL',
  test: 'WHATSAPP_TEMPLATE_TEST',
};

export const TWILIO_CONTENT_ENV_KEYS = {
  contact_verification: 'TWILIO_CONTENT_VERIFICATION',
  alert: 'TWILIO_CONTENT_ALERT',
  lead_confirmation: 'TWILIO_CONTENT_LEAD',
  commercial: 'TWILIO_CONTENT_COMMERCIAL',
  test: 'TWILIO_CONTENT_TEST',
};

// Categoría declarada ante el proveedor. La usa el adaptador para decidir el
// botón de las plantillas de autenticación.
export const TEMPLATE_CATEGORIES = {
  contact_verification: 'authentication',
  alert: 'utility',
  lead_confirmation: 'utility',
  commercial: 'marketing',
  test: 'utility',
};

export const DEFAULT_TEMPLATE_LANGUAGE = 'es';
export const VERIFICATION_BUTTON_TYPES = ['none', 'copy_code', 'url'];

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export function templateLanguage(env = process.env) {
  return clean(env.WHATSAPP_TEMPLATE_LANG) || DEFAULT_TEMPLATE_LANGUAGE;
}

export function whatsappTemplateName(kind, env = process.env) {
  const key = TEMPLATE_ENV_KEYS[kind];
  return key ? clean(env[key]) || null : null;
}

export function twilioContentSid(kind, env = process.env) {
  const key = TWILIO_CONTENT_ENV_KEYS[kind];
  return key ? clean(env[key]) || null : null;
}

export function templateCategory(kind) {
  return TEMPLATE_CATEGORIES[kind] ?? null;
}

// Tipo de botón de la plantilla de verificación: `none` por defecto, para no
// exigir un botón que la plantilla aprobada pueda no tener.
export function verificationButtonType(env = process.env) {
  const value = clean(env.WHATSAPP_TEMPLATE_VERIFICATION_BUTTON).toLowerCase();
  return VERIFICATION_BUTTON_TYPES.includes(value) ? value : 'none';
}

// Descriptor listo para enviar, o null si no hay plantilla (ni de Meta ni
// Content API de Twilio) configurada para ese tipo. Nunca inventa parámetros: si
// el llamante no los pasa, se envía la plantilla sin componentes de cuerpo.
export function whatsappTemplate(kind, { env = process.env, params = [] } = {}) {
  const name = whatsappTemplateName(kind, env);
  const contentSid = twilioContentSid(kind, env);
  if (!name && !contentSid) return null;
  return {
    kind,
    name,
    contentSid,
    category: templateCategory(kind),
    language: templateLanguage(env),
    button: kind === 'contact_verification' ? verificationButtonType(env) : 'none',
    params: Array.isArray(params) ? params.map((value) => (value == null ? '' : String(value))) : [],
  };
}
