// Pipeline de validación de mediciones: separa el valor recibido del dato validado.
// Una lectura fuera de rango nunca se borra: se conserva en raw_payload y se marca
// is_validated=false con su motivo, de modo que las estadísticas puedan excluirla.

export const VFLAG = {
  TEMP: 1 << 0,
  HUM: 1 << 1,
  PRESS: 1 << 2,
  BATT: 1 << 3,
  LUX: 1 << 4,
  MANUAL: 1 << 5,
  TIME: 1 << 6,
  DEVICE: 1 << 7,
};

// Límites compatibles con las restricciones CHECK de la tabla measurements.
const CHANNELS = [
  { key: 'temp_c', column: 'temperature_c', vflag: VFLAG.TEMP, deviceBit: 1 << 0, min: -80, max: 100, label: 'temperatura' },
  { key: 'hum_pct', column: 'humidity_pct', vflag: VFLAG.HUM, deviceBit: 1 << 1, min: 0, max: 100, label: 'humedad' },
  { key: 'press_pa', column: 'pressure_pa', vflag: VFLAG.PRESS, deviceBit: 1 << 2, min: 30000, max: 120000, label: 'presión' },
  { key: 'batt_mv', column: 'battery_mv', vflag: VFLAG.BATT, deviceBit: 1 << 3, min: 0, max: 6000, label: 'batería' },
  { key: 'lux', column: 'lux', vflag: VFLAG.LUX, deviceBit: null, min: 0, max: 200000, label: 'lux' },
];

// Devuelve las columnas a guardar, is_validated, validation_flags, motivo y raw_payload.
export const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

export function evaluateMeasurement(record, { now = new Date(), futureToleranceMs = FUTURE_CLOCK_TOLERANCE_MS } = {}) {
  const columns = {};
  const raw = {};
  const reasons = [];
  let validationFlags = 0;
  let hasAdmissibleChannel = false;
  let timeValid = record.quality !== 0;

  for (const channel of CHANNELS) {
    const value = record[channel.key];
    if (value == null) {
      columns[channel.column] = null;
      continue;
    }
    const channelFlagValid = channel.deviceBit == null || (record.flags & channel.deviceBit) !== 0;
    if (value < channel.min || value > channel.max || !channelFlagValid) {
      // Valor imposible: la columna queda nula pero se conserva el original.
      columns[channel.column] = null;
      raw[channel.key] = value;
      validationFlags |= channel.vflag;
      reasons.push(value < channel.min || value > channel.max
        ? `${channel.label}_fuera_de_rango` : `${channel.label}_marcada_no_valida`);
      continue;
    }
    columns[channel.column] = value;
    hasAdmissibleChannel = true;
  }

  // time_quality 0 = TIME_NO_REFERENCE. Los valores se conservan, pero no
  // pueden alimentar métricas cronológicas ni alertas actuales.
  if (record.quality === 0) {
    validationFlags |= VFLAG.TIME;
    reasons.push('hora_sin_referencia');
    raw.ts = record.ts;
    raw.quality = record.quality;
  }

  if (record.ts != null && Number.isFinite(record.ts)
      && record.ts * 1000 > now.getTime() + futureToleranceMs) {
    validationFlags |= VFLAG.TIME;
    timeValid = false;
    raw.timestamp = record.ts;
    raw.quality = record.quality;
    reasons.push('hora_futura');
  }

  // is_validated significa que hay al menos un canal admisible y tiempo
  // utilizable. validation_flags conserva defectos parciales de otros canales.
  const isValidated = hasAdmissibleChannel && timeValid;

  return {
    columns,
    is_validated: isValidated,
    validation_flags: validationFlags,
    invalidated_reason: reasons.length ? reasons.join(',') : null,
    time_valid: timeValid,
    has_admissible_channel: hasAdmissibleChannel,
    valid_values: Object.fromEntries(CHANNELS
      .filter((channel) => columns[channel.column] != null)
      .map((channel) => [channel.key, columns[channel.column]])),
    raw_payload: Object.keys(raw).length ? raw : null,
  };
}

// Qué garantiza (y qué no) el pipeline automático. Lo usan los informes para no
// confundir «aceptada por controles» con «verificada frente a una referencia».
export const AUTOMATIC_VALIDATION_LIMITS = [
  'La validación automática comprueba rango físico, marcas del equipo y referencia temporal: no demuestra calibración, exactitud ni ausencia de influencia del emplazamiento (sol, pared o electrónica).',
  'Una lectura «aceptada» no es una lectura «verificada frente a una referencia»: afirmar exactitud exige compararla con un patrón colocado correctamente y registrar el error y sus condiciones.',
];

// La evaluación de reglas de aviso vive en alert-engine.js: allí están la
// duración mínima, la recuperación con margen y los detectores de sistema.
export const RULE_METRIC_KEYS = {
  temperature: 'temp_c',
  humidity: 'hum_pct',
  pressure: 'press_pa',
  battery: 'batt_mv',
  lux: 'lux',
};
