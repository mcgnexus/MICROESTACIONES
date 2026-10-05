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
export function evaluateMeasurement(record) {
  const columns = {};
  const raw = {};
  const reasons = [];
  let validationFlags = 0;
  let isValidated = true;

  for (const channel of CHANNELS) {
    const value = record[channel.key];
    if (value == null) {
      columns[channel.column] = null;
      continue;
    }
    if (value < channel.min || value > channel.max) {
      // Valor imposible: la columna queda nula pero se conserva el original.
      columns[channel.column] = null;
      raw[channel.key] = value;
      validationFlags |= channel.vflag;
      isValidated = false;
      reasons.push(`${channel.label}_fuera_de_rango`);
      continue;
    }
    columns[channel.column] = value;
    if (channel.deviceBit != null && (record.flags & channel.deviceBit) === 0) {
      validationFlags |= channel.vflag;
      isValidated = false;
      reasons.push(`${channel.label}_marcada_no_valida`);
    }
  }

  // quality 0 = TIME_NO_REFERENCE: la hora observada no es fiable.
  if (record.quality === 0) {
    validationFlags |= VFLAG.TIME;
    isValidated = false;
    reasons.push('hora_sin_referencia');
  }

  return {
    columns,
    is_validated: isValidated,
    validation_flags: validationFlags,
    invalidated_reason: isValidated ? null : reasons.join(','),
    raw_payload: Object.keys(raw).length ? raw : null,
  };
}

// La evaluación de reglas de aviso vive en alert-engine.js: allí están la
// duración mínima, la recuperación con margen y los detectores de sistema.
export const RULE_METRIC_KEYS = {
  temperature: 'temp_c',
  humidity: 'hum_pct',
  pressure: 'press_pa',
  battery: 'batt_mv',
  lux: 'lux',
};
