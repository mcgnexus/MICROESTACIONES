#include "sync_policy.h"

static_assert(SyncPolicy::elapsed(false, 0, 0, 900), "Primer envío inmediato");
static_assert(!SyncPolicy::elapsed(true, 899, 0, 900), "Respetar intervalo");
static_assert(SyncPolicy::elapsed(true, 900, 0, 900), "Enviar a los 15 minutos");
static_assert(SyncPolicy::elapsed(true, 16, UINT32_MAX - 15, 32), "Overflow del contador");
static_assert(!SyncPolicy::due(false, 20, false, 0, 0, 900, 3), "Respetar sync desactivado");
static_assert(!SyncPolicy::due(true, 0, false, 0, 0, 900, 3), "No enviar cola vacía");
static_assert(SyncPolicy::due(true, 6, true, 100, 99, 900, 0), "Evitar retraso con cola acumulada");
static_assert(SyncPolicy::due(true, 1, true, 100, 99, 900, 1), "Reintentar al despertar tras fallo");
static_assert(SyncPolicy::failedCycles(2, 6, 2, 200) == 0, "Acuse parcial es progreso");
static_assert(SyncPolicy::failedCycles(2, 6, 6, -1) == 3, "TLS o transporte sin progreso");
static_assert(SyncPolicy::failedCycles(2, 6, 6, 503) == 3, "Servidor temporalmente caído");
static_assert(SyncPolicy::failedCycles(2, 6, 6, 401) == 0, "No reiniciar por token inválido");
static_assert(SyncPolicy::failedCycles(2, 6, 6, 400) == 0, "No reiniciar por cuerpo inválido");
static_assert(SyncPolicy::failedCycles(2, 6, 6, 429) == 3, "Recuperación acotada tras 429");
static_assert(SyncPolicy::failedCycles(2, 6, 6, 200) == 3, "Sin acuse legible tampoco hay progreso");
static_assert(!SyncPolicy::restartDue(2) && SyncPolicy::restartDue(3), "Umbral tres ciclos");
