// Preferencias de alertas: qué categoría, por qué canal y a qué hora. Se aplican
// al elegir los destinatarios de un aviso. Sin fila de preferencias, se recibe todo.
import { z } from 'zod';

export const DEFAULT_PREFERENCES = {
  receiveFrost: true, receiveHeat: true, receiveStorm: true, receiveWind: true,
  receiveHumidity: true, receiveGeneral: true, channelWhatsapp: true, channelEmail: true,
  quietStart: null, quietEnd: null, zone: null, crop: null, customThresholds: {},
};

const TOGGLE_COLUMNS = [
  'receive_frost', 'receive_heat', 'receive_storm', 'receive_wind', 'receive_humidity',
  'receive_general', 'channel_whatsapp', 'channel_email',
];

export const CATEGORY_COLUMNS = {
  frost: 'receiveFrost', heat: 'receiveHeat', storm: 'receiveStorm',
  wind: 'receiveWind', humidity: 'receiveHumidity', general: 'receiveGeneral',
};

const snake = (camel) => camel.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

const minutesInMadrid = (date) => {
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).split(':').map(Number);
  return hour * 60 + minute;
};

// Horario silencioso: acepta ventanas que cruzan la medianoche (22:00–07:00).
export function isQuietHour(start, end, at = new Date()) {
  if (!start || !end) return false;
  const toMinutes = (value) => {
    const [hour, minute] = String(value).split(':').map(Number);
    return hour * 60 + minute;
  };
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === to) return false;
  const now = minutesInMadrid(at);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

// ¿El suscriptor quiere esta categoría, por este canal y a esta hora? Prioridad 1
// no respeta el horario silencioso. Un contacto sin preferencias recibe por defecto.
export function recipientWants(row, category, level, at = new Date()) {
  const pick = (camel, old) => row[camel] ?? row[old];
  const categoryKey = CATEGORY_COLUMNS[category] ?? 'receiveGeneral';
  if (pick(categoryKey, snake(categoryKey)) === false) return false;
  const channelKey = row.channel === 'whatsapp' ? 'channelWhatsapp' : 'channelEmail';
  if (pick(channelKey, snake(channelKey)) === false) return false;
  if (Number(level) !== 1 && isQuietHour(pick('quietStart', 'quiet_start'), pick('quietEnd', 'quiet_end'), at)) return false;
  return true;
}

const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

export const preferenceSchema = z.object({
  receive_frost: z.boolean().optional(),
  receive_heat: z.boolean().optional(),
  receive_storm: z.boolean().optional(),
  receive_wind: z.boolean().optional(),
  receive_humidity: z.boolean().optional(),
  receive_general: z.boolean().optional(),
  channel_whatsapp: z.boolean().optional(),
  channel_email: z.boolean().optional(),
  quiet_start: timeSchema.nullable().optional(),
  quiet_end: timeSchema.nullable().optional(),
  zone: z.string().trim().max(160).nullable().optional(),
  crop: z.string().trim().max(160).nullable().optional(),
  custom_thresholds: z.record(z.string(), z.number().finite()).optional(),
}).strict();

// Columnas a persistir desde un cuerpo validado, sin las indefinidas.
export function preferenceColumns(patch) {
  const columns = Object.fromEntries(TOGGLE_COLUMNS.map((key) => [key, patch[key]]));
  columns.quiet_start = patch.quiet_start;
  columns.quiet_end = patch.quiet_end;
  columns.zone = patch.zone;
  columns.crop = patch.crop;
  return Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));
}
