import { z } from 'zod';

export const measurementSchema = z.object({
  device_id: z.string().min(1).max(80),
  sequence: z.number().int().min(0).max(4294967295),
  ts: z.number().int().min(0).max(4102444800),
  quality: z.number().int().min(0).max(3),
  temp_c: z.number().finite().min(-80).max(100).optional(),
  hum_pct: z.number().finite().min(0).max(100).optional(),
  press_pa: z.number().int().min(30000).max(120000).optional(),
  batt_mv: z.number().int().min(0).max(6000).optional(),
  flags: z.number().int().min(0).max(255),
  alert: z.number().int().min(0).max(2),
}).strict();
