import { z } from 'zod';
import { sha256 } from './security.js';
import { normalizeAcquisition } from './consent.js';

export const ACTIVITIES = ['agricultura', 'ganaderia', 'mixta', 'otra'];
export const INTERESTS = ['heladas', 'calor', 'tormentas', 'viento', 'humedad', 'general', 'futura_instalacion'];
export const LEAD_STATUSES = ['nuevo', 'contactado', 'interesado', 'piloto_activo', 'cliente', 'descartado'];
// Modalidad de la solicitud, declarada por el origen del envío o por el
// visitante: consulta de instalación o entrada en el piloto.
export const REQUEST_TYPES = ['installation_info', 'pilot'];

// El teléfono se guarda normalizado (solo dígitos, prefijo internacional opcional)
// para poder abrir la conversación de WhatsApp sin ambigüedad.
export function normalizePhone(value) {
  return String(value ?? '').replace(/[\s().-]/g, '');
}

const phoneSchema = z.string().trim().max(30)
  .transform(normalizePhone)
  .refine((value) => /^\+?\d{7,15}$/.test(value));

const campaignSchema = z.object({
  source: z.string().max(80).optional(),
  medium: z.string().max(80).optional(),
  campaign: z.string().max(80).optional(),
  content: z.string().max(80).optional(),
  term: z.string().max(80).optional(),
  ref: z.string().max(80).optional(),
}).strict();

// Contrato del formulario público. `consent` debe ser literalmente true: sin permiso
// explícito no se guarda la solicitud. La publicidad es una casilla aparte y sin
// marcar por defecto: `commercial_consent` es opcional e independiente del acceso.
// `website` es un campo trampa invisible. El contacto es email o WhatsApp a
// elección del visitante: el canal elegido exige su dato, el otro es opcional
// (segundo canal para después).
export const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  preferred_channel: z.enum(['email', 'whatsapp']),
  request_type: z.enum(REQUEST_TYPES),
  phone: phoneSchema.optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  activity: z.enum(ACTIVITIES).optional(),
  zone: z.string().trim().min(2).max(160),
  crop_or_livestock: z.string().trim().max(160).optional(),
  interest: z.enum(INTERESTS).optional(),
  notes: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
  commercial_consent: z.boolean().optional(),
  campaign: campaignSchema.optional(),
  website: z.string().max(200).optional(),
}).strict().superRefine((lead, ctx) => {
  if (lead.preferred_channel === 'email' && !lead.email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Falta el correo electrónico del canal elegido.' });
  }
  if (lead.preferred_channel === 'whatsapp' && !lead.phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Falta el teléfono de WhatsApp del canal elegido.' });
  }
});

// Si el campo trampa trae texto, el envío es de un bot: se responde igual pero no se guarda.
export const isHoneypot = (lead) => Boolean(lead?.website && lead.website.trim());

// Contacto efectivo del lead: el canal elegido si está, o cualquiera que traiga.
// Sirve tanto para limitar reenvíos como para deduplicar la solicitud.
export function leadContact(lead) {
  return lead.phone || lead.email || '';
}

// Clave de contacto normalizada y etiquetada por canal. Un email no pasa por la
// normalización de teléfono (perdería puntos y guiones) y un contacto solo-email
// nunca comparte clave con otro: no hay un hash de teléfono vacío común.
export function leadContactKey(lead) {
  const parts = [];
  const preferredFirst = lead?.preferred_channel === 'email'
    ? ['email', 'whatsapp'] : ['whatsapp', 'email'];
  for (const channel of preferredFirst) {
    if (channel === 'whatsapp' && lead?.phone) parts.push(`whatsapp:${normalizePhone(lead.phone)}`);
    if (channel === 'email' && lead?.email) parts.push(`email:${String(lead.email).trim().toLowerCase()}`);
  }
  return parts.length ? parts.join('|') : null;
}

export function leadRateLimitKeys(ip, lead) {
  return [
    sha256(`lead-ip:${String(ip || 'unknown').slice(0, 200)}`),
    sha256(`lead-contact:${leadContactKey(lead) ?? ''}`),
  ];
}

// Campos que se persisten, sin el campo trampa ni el consentimiento derivado.
// La captación se sanea aquí (parámetros conocidos y con formato seguro): a la
// base nunca llega un utm_* crudo ni desconocido.
export function leadColumns(lead, source = 'web') {
  return {
    name: lead.name,
    preferred_channel: lead.preferred_channel,
    request_type: lead.request_type,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    activity: lead.activity ?? null,
    zone: lead.zone,
    crop_or_livestock: lead.crop_or_livestock ?? null,
    interest: lead.interest ?? null,
    notes: lead.notes ?? null,
    source,
    campaign: normalizeAcquisition(lead.campaign),
  };
}

// Canales sobre los que el visitante quiere recibir novedades y ofertas. La
// publicidad es opcional: sin la casilla marcada no hay ningún canal. Solo se
// registran los canales con contacto real, empezando por el preferido.
export function commercialConsentChannels(lead) {
  if (!lead?.commercial_consent) return [];
  return serviceConsentChannels(lead);
}

// Canales por los que se autorizó a atender la solicitud (finalidad de servicio).
export function serviceConsentChannels(lead) {
  const channels = [];
  const preferredFirst = lead.preferred_channel === 'email' ? ['email', 'whatsapp'] : ['whatsapp', 'email'];
  for (const channel of preferredFirst) {
    if (channel === 'whatsapp' && lead.phone) channels.push('whatsapp');
    if (channel === 'email' && lead.email) channels.push('email');
  }
  return channels;
}
