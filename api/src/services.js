// Servicios contratados. El plan comercial NO sustituye a la asignación de
// estación: los derechos dependen del estado del servicio y de la asignación
// vigente, no de un indicador de pago enviado por el navegador.

export const SERVICE_STATUSES = [
  'solicitado', 'aprobado', 'pendiente_instalacion', 'piloto_activo', 'activo', 'suspendido', 'finalizado',
];

// Estados con servicio privado disponible.
export const ACTIVE_SERVICE_STATUSES = ['piloto_activo', 'activo'];

// Derechos por estado. `historyDays` es el histórico consultable del servicio;
// los avisos solo se consideran operativos en `activo` (el piloto los valida).
export function serviceRights(status) {
  const active = ACTIVE_SERVICE_STATUSES.includes(status);
  return {
    status: status ?? null,
    stationAccess: active,
    historyDays: active ? 90 : 0,
    export: active,
    alerts: status === 'activo',
  };
}

export function servicePayload(row) {
  const status = row.status ?? null;
  return {
    id: String(row.id),
    subscriberId: row.subscriberId ?? row.subscriber_id ?? null,
    deviceId: row.deviceId ?? row.device_id ?? null,
    subscriberEmail: row.subscriberEmail ?? row.subscriber_email ?? null,
    deviceName: row.deviceName ?? row.device_name ?? null,
    status,
    offer: row.offer ?? {},
    monthlyFeeCents: row.monthlyFeeCents ?? row.monthly_fee_cents ?? null,
    taxes: row.taxes ?? {},
    conditions: row.conditions ?? {},
    startedAt: row.startedAt ?? row.started_at ?? null,
    endedAt: row.endedAt ?? row.ended_at ?? null,
    rights: serviceRights(status),
  };
}
