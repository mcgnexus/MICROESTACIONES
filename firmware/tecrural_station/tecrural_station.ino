#include <Arduino.h>
#include "src/measurement.h"
#include "src/config.h"
#include "src/sensors.h"
#include "src/battery.h"
#include "src/store.h"
#include "src/timekeeper.h"
#include "src/wifi_sync.h"
#include "src/power.h"

namespace {

constexpr uint32_t kWifiConnectTimeoutMs = 25000;
constexpr uint32_t kWifiHttpTimeoutMs = 20000;
constexpr uint32_t kAlertSyncCooldownS = 900;

// Diagnostico por serie en cada arranque. Subir con -DTECRURAL_BOOT_DIAG_MS=12000
// para sesiones de banco; el valor por defecto minimiza el tiempo despierto.
#ifndef TECRURAL_BOOT_DIAG_MS
#define TECRURAL_BOOT_DIAG_MS 1500
#endif

// Permanencia despierta minima para comprobaciones. 0 = desactivado.
#ifndef TECRURAL_MIN_AWAKE_MS
#define TECRURAL_MIN_AWAKE_MS 300
#endif

RTC_DATA_ATTR uint32_t last_sync_attempt_stamp = 0;
RTC_DATA_ATTR bool last_sync_was_uptime = false;
RTC_DATA_ATTR bool has_attempted_sync = false;

void printHeader(const char* reason) {
  Serial.println();
  Serial.println("========================================");
  Serial.println("TECRURAL microestacion - arranque");
  Serial.printf("Motivo de despertar: %s\n", reason);
}

void printMeasurement(const Measurement& m) {
  Serial.printf("[lectura] seq=%u ts=%lu (%s)\n",
                (unsigned)m.sequence, (unsigned long)m.timestamp,
                TimeKeeper::qualityName(TimeKeeper::quality()));
  if (flagSet(m.flags, FLAG_TEMP_VALID)) {
    Serial.printf("  Temperatura: %ld.%02ld C\n",
                  m.temperature_c_x100 / 100, abs(m.temperature_c_x100 % 100));
  } else {
    Serial.println("  Temperatura: INVALIDA");
  }
  if (flagSet(m.flags, FLAG_HUM_VALID)) {
    Serial.printf("  Humedad: %lu.%02lu %%\n",
                  (unsigned long)(m.humidity_x100 / 100),
                  (unsigned long)(m.humidity_x100 % 100));
  } else {
    Serial.println("  Humedad: INVALIDA");
  }
  if (flagSet(m.flags, FLAG_PRESS_VALID)) {
    Serial.printf("  Presion: %lu.%02lu hPa\n",
                  (unsigned long)(m.pressure_pa / 100),
                  (unsigned long)(m.pressure_pa % 100));
  } else {
    Serial.println("  Presion: INVALIDA");
  }
  if (flagSet(m.flags, FLAG_BATTERY_VALID)) {
    Serial.printf("  Bateria: %u mV, tendencia %s\n", m.battery_mv, Battery::trend());
  } else {
#if BATTERY_MONITOR_ENABLED
    Serial.println("  Bateria: SIN LECTURA");
#else
    Serial.println("  Bateria: MEDICION CONGELADA");
#endif
  }
  Serial.printf("  Alerta: %s\n", m.alert == ALERT_PRIORITY ? "PRIORITARIA"
                            : m.alert == ALERT_WARNING ? "AVISO" : "ninguna");
}

bool cooldownElapsed(uint32_t stamp, bool stamp_is_uptime, uint32_t cooldown_s) {
  if (!has_attempted_sync) return true;
  if (stamp == 0) return true;
  // Sellos de bases distintas (epoch vs uptime) no son comparables: sincronizar.
  if (last_sync_was_uptime != stamp_is_uptime) return true;
  return (stamp - last_sync_attempt_stamp) >= cooldown_s;
}

// Red de seguridad: no dejar acumular mas de estas lecturas sin subir aunque el
// reloj o el cooldown se comporten de forma inesperada (se observo un retraso de
// ~52 min en el que el chip desperto 9 veces sin intentar sincronizar).
constexpr uint32_t kSyncBurstRecords = 6;

bool syncDue(uint32_t stamp, bool stamp_is_uptime) {
  if (!ConfigStore::current().sync_enabled) return false;
  const uint32_t pending = Store::count();
  if (pending == 0) return false;
  if (pending >= kSyncBurstRecords) return true;  // ~30 min de datos: subir ya
  return cooldownElapsed(stamp, stamp_is_uptime, ConfigStore::current().sync_interval_s);
}

bool alertSyncDue(uint32_t stamp, bool stamp_is_uptime) {
  return cooldownElapsed(stamp, stamp_is_uptime, kAlertSyncCooldownS);
}

void runCycle() {
  const StationConfig& cfg = ConfigStore::current();

  Measurement m = {};
  const bool sensors_ok = Sensors::read(m);
  Battery::read(m);

  const uint8_t quality = TimeKeeper::quality();
  const uint32_t stamp = (quality == TIME_NO_REFERENCE) ? TimeKeeper::uptimeSeconds()
                                                        : TimeKeeper::now();
  m.timestamp = stamp;
  if (quality != TIME_NO_REFERENCE) m.flags |= FLAG_TIME_VALID;
  const bool stamp_is_uptime = (quality == TIME_NO_REFERENCE);

  if (!Store::push(m, stamp, quality)) {
    Serial.printf("[almacen] no se pudo guardar la lectura: %s\n", Store::faultReason());
  }
  m.sequence = Store::lastSequence();

  printMeasurement(m);

  Serial.printf("[almacen] pendientes %u / %u, descartados %u, uso %u%%\n",
                (unsigned)Store::count(), (unsigned)Store::capacity(),
                (unsigned)Store::dropped(), (unsigned)Store::usagePercent());
  if (Store::nearLimit()) {
    Serial.println("[almacen] AVISO: cerca del limite, se descartaran las lecturas mas antiguas");
  }

  const bool battery_ok = !Battery::isCritical();
  const bool risk_allowed = cfg.risk_mode_enabled && m.alert == ALERT_PRIORITY && battery_ok;

  if (m.alert == ALERT_PRIORITY && !battery_ok) {
    Serial.println("[riesgo] alerta prioritaria contenida por bateria baja");
  }
  if (risk_allowed) {
    Serial.println("[riesgo] alerta prioritaria activa");
  }

  bool must_connect = syncDue(stamp, stamp_is_uptime);
  if (risk_allowed && !must_connect) {
    must_connect = alertSyncDue(stamp, stamp_is_uptime);
    if (must_connect) Serial.println("[wifi] envio extraordinario por alerta");
  }

  if (must_connect) {
    last_sync_attempt_stamp = stamp;
    last_sync_was_uptime = stamp_is_uptime;
    has_attempted_sync = true;

    if (WiFiSync::connect(kWifiConnectTimeoutMs)) {
      if (TimeKeeper::sync()) {
        Serial.printf("[hora] sincronizada, antiguedad de la referencia %lu s\n",
                      (unsigned long)(TimeKeeper::msSinceSync() / 1000UL));
      } else {
        Serial.println("[hora] sincronizacion NTP fallida (hora estimada)");
      }
      for (int attempt = 0; attempt < 5 && Store::count() > 0; ++attempt) {
        if (!WiFiSync::uploadBatch(kWifiHttpTimeoutMs)) {
          Serial.println("[wifi] reintento de subida");
          delay(500);
        }
      }
      WiFiSync::fetchConfig(kWifiHttpTimeoutMs);
      WiFiSync::disconnect();
    } else {
      Serial.println("[wifi] sin conexion: se conservan las lecturas");
    }
  }

  if (!sensors_ok) {
    Serial.println("[aviso] lectura de sensores incompleta");
  }

  const uint32_t next_s = Power::decideIntervalSeconds(risk_allowed, battery_ok);
  Serial.printf("[energia] proxima medicion en %lu s\n", (unsigned long)next_s);
  Serial.println("========================================");

#if TECRURAL_MIN_AWAKE_MS > 0
  // Ventana despierta minima: permite monitorizar el ciclo completo.
  {
    const uint32_t awake_ms = millis();
    if (awake_ms < TECRURAL_MIN_AWAKE_MS) {
      const uint32_t hold_ms = TECRURAL_MIN_AWAKE_MS - awake_ms;
      Serial.printf("[comprobacion] despierto %lu ms mas\n", (unsigned long)hold_ms);
      delay(hold_ms);
    }
  }
#endif

  Power::enterDeepSleep(next_s);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  const uint32_t serial_wait_started = millis();
  while (!Serial && millis() - serial_wait_started < 5000) {
    delay(10);
  }
  delay(200);

#if TECRURAL_BOOT_DIAG_MS > 0
  {
    const uint32_t diag_started = millis();
    while (millis() - diag_started < TECRURAL_BOOT_DIAG_MS) {
      Serial.printf("[diag] firmware en ejecucion, t=%u ms\n", (unsigned)millis());
      delay(500);
    }
  }
#endif

  Power::begin();
  printHeader(Power::wakeReasonName());

  ConfigStore::begin();
  Serial.printf("[config] intervalo normal %u s, riesgo %u s, sync %u s\n",
                ConfigStore::current().interval_normal_s,
                ConfigStore::current().interval_risk_s,
                ConfigStore::current().sync_interval_s);

  if (Store::begin()) {
    Store::report();
  } else {
    Serial.printf("[almacen] ERROR: %s\n", Store::faultReason());
  }

  if (TimeKeeper::begin()) {
    Serial.printf("[hora] referencia %lu, calidad %s\n",
                  (unsigned long)TimeKeeper::lastSyncEpoch(),
                  TimeKeeper::qualityName(TimeKeeper::quality()));
  } else {
    Serial.println("[hora] sin referencia: las lecturas se marcaran como estimadas");
  }

  WiFiSync::begin();
  Battery::begin();
#if !BATTERY_MONITOR_ENABLED
  Serial.println("[bateria] lectura desactivada temporalmente; circuito y codigo conservados");
#endif
  Sensors::begin();

  runCycle();
}

void loop() {
}
