import { z } from 'zod';

// El contrato admite lecturas fuera del rango físico: la detección de valores
// extraños (y su conservación en raw_payload) la hace el pipeline de validación.
export const measurementSchema = z.object({
  device_id: z.string().min(1).max(80),
  sequence: z.number().int().min(0).max(4294967295),
  ts: z.number().int().min(0).max(4102444800),
  quality: z.number().int().min(0).max(3),
  temp_c: z.number().finite().min(-150).max(150),
  hum_pct: z.number().finite().min(-20).max(120),
  press_pa: z.number().int().min(0).max(200000),
  batt_mv: z.number().int().min(0).max(65535),
  // Canal opcional: solo lo envía la estación cuando el sensor de lux está instalado.
  lux: z.number().finite().min(0).max(10000000),
  // Fuente de la transmisión; el firmware actual no lo envía y por defecto es Wi-Fi.
  source: z.enum(['wifi', 'lora']),
  // Versión de configuración que el equipo tiene aplicada. Es lo que convierte
  // un cambio remoto en "aplicado": sin este campo la versión sigue pendiente.
  config_version: z.number().int().min(1).max(100000),
  flags: z.number().int().min(0).max(255),
  alert: z.number().int().min(0).max(2),
}).partial({
  temp_c: true, hum_pct: true, press_pa: true, batt_mv: true, lux: true, source: true, config_version: true,
}).superRefine((record, ctx) => {
  // Sin marca de valor presente no hay lectura que conservar.
  if (record.temp_c === undefined && record.hum_pct === undefined
      && record.press_pa === undefined && record.batt_mv === undefined && record.lux === undefined) {
    ctx.addIssue({ code: 'custom', message: 'measurement_without_values' });
  }
}).strict();
