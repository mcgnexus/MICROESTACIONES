#include "config.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>

namespace {

Preferences prefs;
StationConfig config;
bool server_dirty = false;

const char* NS = "tecrural";
const char* KEY_CFG = "cfg";
const char* KEY_SRV = "srv";
const char* KEY_VER = "ver";
// Subir esta version fuerza a descartar la config guardada en NVS y recargar los
// valores por defecto compilados. Necesario al cambiar umbrales por defecto.
constexpr uint32_t kSchemaVersion = 2;

bool inRange(int32_t v, int32_t lo, int32_t hi) {
  return v >= lo && v <= hi;
}

bool numberInRangeImpl(JsonVariantConst v, int32_t lo, int32_t hi, int32_t& out) {
  if (v.isNull()) return false;
  int32_t x = (int32_t)v.as<int64_t>();
  if (!inRange(x, lo, hi)) return false;
  out = x;
  return true;
}

}  // namespace

namespace ConfigStore {

bool validate(const StationConfig& c) {
  return inRange(c.interval_normal_s, 60, 86400) &&
         inRange(c.interval_risk_s, 60, 86400) &&
         inRange(c.interval_risk_min_s, 60, 86400) &&
         inRange(c.sync_interval_s, 60, 86400) &&
         c.interval_risk_min_s <= c.interval_normal_s &&
         c.interval_risk_s <= c.interval_normal_s &&
         inRange(c.battery_low_mv, 2500, 4200) &&
         inRange(c.battery_critical_mv, 2000, 4200) &&
         c.battery_critical_mv < c.battery_low_mv &&
         inRange((int32_t)(c.temp_alert_high_c * 100), -4000, 8500) &&
         inRange((int32_t)(c.temp_alert_low_c * 100), -4000, 8500) &&
         c.temp_alert_low_c < c.temp_alert_high_c &&
         inRange(c.humidity_alert_high_pct, 0, 100) &&
         inRange((int32_t)c.pressure_alert_low_pa, 30000, 110000);
}

void loadDefaults() {
  config.interval_normal_s = 300;
  config.interval_risk_s = 300;
  config.interval_risk_min_s = 300;
  config.sync_interval_s = 900;
  config.battery_low_mv = 3400;
  config.battery_critical_mv = 3200;
  config.temp_alert_high_c = 35.0f;
  config.temp_alert_low_c = 2.0f;
  config.humidity_alert_high_pct = 90;
  config.pressure_alert_low_pa = 88500;
  config.risk_mode_enabled = 1;
  config.sync_enabled = 1;
}

bool begin() {
  loadDefaults();
  if (!prefs.begin(NS, true)) return false;
  bool ok = loadFromFlash();
  prefs.end();
  return ok;
}

bool loadFromFlash() {
  if (prefs.getUInt(KEY_VER, 0) != kSchemaVersion) return false;
  if (prefs.getBytesLength(KEY_CFG) != sizeof(StationConfig)) return false;
  StationConfig tmp;
  if (prefs.getBytes(KEY_CFG, &tmp, sizeof(tmp)) != sizeof(tmp)) return false;
  if (!validate(tmp)) return false;
  config = tmp;
  return true;
}

bool saveToFlash() {
  if (!prefs.begin(NS, false)) return false;
  bool ok = prefs.putBytes(KEY_CFG, &config, sizeof(config)) > 0;
  if (ok) ok = prefs.putUInt(KEY_VER, kSchemaVersion) > 0;
  prefs.end();
  return ok;
}

void markServerValues() {
  server_dirty = true;
  saveToFlash();
}

bool dirty() {
  return server_dirty;
}

const StationConfig& current() {
  return config;
}

bool applyServerJson(const char* json, size_t len) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json, len);
  if (err) return false;
  JsonObject root = doc.as<JsonObject>();
  if (root.isNull()) return false;

  StationConfig candidate = config;
  int32_t v;

  if (numberInRangeImpl(root["interval_normal_s"], 60, 86400, v)) candidate.interval_normal_s = (uint32_t)v;
  if (numberInRangeImpl(root["interval_risk_s"], 60, 86400, v)) candidate.interval_risk_s = (uint32_t)v;
  if (numberInRangeImpl(root["interval_risk_min_s"], 60, 86400, v)) candidate.interval_risk_min_s = (uint32_t)v;
  if (numberInRangeImpl(root["sync_interval_s"], 60, 86400, v)) candidate.sync_interval_s = (uint32_t)v;
  if (numberInRangeImpl(root["battery_low_mv"], 2500, 4200, v)) candidate.battery_low_mv = (int16_t)v;
  if (numberInRangeImpl(root["battery_critical_mv"], 2000, 4200, v)) candidate.battery_critical_mv = (int16_t)v;
  if (numberInRangeImpl(root["humidity_alert_high_pct"], 0, 100, v)) candidate.humidity_alert_high_pct = (uint16_t)v;
  if (numberInRangeImpl(root["pressure_alert_low_pa"], 30000, 110000, v)) candidate.pressure_alert_low_pa = (uint32_t)v;

  if (!root["temp_alert_high_c"].isNull()) {
    float t = root["temp_alert_high_c"].as<float>();
    if (inRange((int32_t)(t * 100), -4000, 8500)) candidate.temp_alert_high_c = t;
  }
  if (!root["temp_alert_low_c"].isNull()) {
    float t = root["temp_alert_low_c"].as<float>();
    if (inRange((int32_t)(t * 100), -4000, 8500)) candidate.temp_alert_low_c = t;
  }
  if (!root["risk_mode_enabled"].isNull()) candidate.risk_mode_enabled = root["risk_mode_enabled"].as<bool>() ? 1 : 0;
  if (!root["sync_enabled"].isNull()) candidate.sync_enabled = root["sync_enabled"].as<bool>() ? 1 : 0;

  if (!validate(candidate)) return false;

  config = candidate;
  server_dirty = true;
  return saveToFlash();
}

}  // namespace ConfigStore