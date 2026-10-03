#pragma once

#include <stdint.h>
#include <stddef.h>

struct StationConfig {
  uint16_t interval_normal_s;
  uint16_t interval_risk_s;
  uint16_t interval_risk_min_s;
  uint16_t sync_interval_s;
  int16_t  battery_low_mv;
  int16_t  battery_critical_mv;
  float    temp_alert_high_c;
  float    temp_alert_low_c;
  uint16_t humidity_alert_high_pct;
  uint32_t pressure_alert_low_pa;
  uint8_t  risk_mode_enabled;
  uint8_t  sync_enabled;
};

namespace ConfigStore {

bool begin();
void loadDefaults();
bool loadFromFlash();
bool saveToFlash();
bool applyServerJson(const char* json, size_t len);
bool dirty();
bool validate(const StationConfig& c);
void markServerValues();
const StationConfig& current();

}