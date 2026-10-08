import { z } from 'zod';
import { sha256 } from './security.js';
import { normalizeAcquisition } from './consent.js';

export const ACTIVITIES = ['agricultura', 'ganaderia', 'mixta', 'otra'];
export const INTERESTS = ['heladas', 'calor', 'tormentas', 'viento', 'humedad', 'general', 'futura_instalacion'];
export const LEAD_STATUSES = ['nuevo', 'contactado', 'interesado', 'piloto_activo', 'cliente', 'descartado'];

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
// `website` es un campo trampa invisible.
export const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  activity: z.enum(ACTIVITIES).optional(),
  zone: z.string().trim().max(160).optional(),
  crop_or_livestock: z.string().trim().max(160).optional(),
  interest: z.enum(INTERESTS).optional(),
  notes: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
  commercial_consent: z.boolean().optional(),
  campaign: campaignSchema.optional(),
  website: z.string().max(200).optional(),
}).strict();

// Si el campo trampa trae texto, el envío es de un bot: se responde igual pero no se guarda.
export const isHoneypot = (lead) => Boolean(lead?.website && lead.website.trim());

export function leadRateLimitKeys(ip, phone) {
  return [
    sha256(`lead-ip:${String(ip || 'unknown').slice(0, 200)}`),
    sha256(`lead-phone:${normalizePhone(phone)}`),
  ];
}

// Campos que se persisten, sin el campo trampa ni el consentimiento derivado.
// La captación se sanea aquí (parámetros conocidos y con formato seguro): a la
// base nunca llega un utm_* crudo ni desconocido.
export function leadColumns(lead, source = 'web') {
  return {
    name: lead.name,
    phone: lead.phone,
    email: lead.email ?? null,
    activity: lead.activity ?? 'agricultura',
    zone: lead.zone ?? null,
    crop_or_livestock: lead.crop_or_livestock ?? null,
    interest: lead.interest ?? null,
    notes: lead.notes ?? null,
    source,
    campaign: normalizeAcquisition(lead.campaign),
  };
}

// Canales sobre los que el visitante quiere recibir novedades y ofertas. La
// publicidad es opcional: sin la casilla marcada no hay ningún canal.
export function commercialConsentChannels(lead) {
  if (!lead?.commercial_consent) return [];
  return lead.email ? ['whatsapp', 'email'] : ['whatsapp'];
}

// Canales por los que se autorizó a atender la solicitud (finalidad de servicio).
export function serviceConsentChannels(lead) {
  return lead.email ? ['whatsapp', 'email'] : ['whatsapp'];
}
