import { z } from 'zod';
import { sha256 } from './security.js';

export const ACTIVITIES = ['agricultura', 'ganaderia', 'mixta', 'otra'];
export const INTERESTS = ['heladas', 'calor', 'tormentas', 'viento', 'humedad', 'general'];
export const LEAD_STATUSES = ['nuevo', 'contactado', 'interesado', 'piloto_activo', 'cliente', 'descartado'];

// El teléfono se guarda normalizado (solo dígitos, prefijo internacional opcional)
// para poder abrir la conversación de WhatsApp sin ambigüedad.
export function normalizePhone(value) {
  return String(value ?? '').replace(/[\s().-]/g, '');
}

const phoneSchema = z.string().trim().max(30)
  .transform(normalizePhone)
  .refine((value) => /^\+?\d{7,15}$/.test(value));

// Contrato del formulario público. `consent` debe ser literalmente true: sin permiso
// explícito no se guarda la solicitud. `website` es un campo trampa invisible.
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
  };
}
