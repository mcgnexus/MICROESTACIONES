#pragma once

#include <stdint.h>

enum MeasurementFlags : uint8_t {
  FLAG_TEMP_VALID    = 1 << 0,
  FLAG_HUM_VALID     = 1 << 1,
  FLAG_PRESS_VALID   = 1 << 2,
  FLAG_BATTERY_VALID = 1 << 3,
  FLAG_TIME_VALID    = 1 << 4,
  FLAG_TEMP_OUT_OF_RANGE  = 1 << 5,
  FLAG_HUM_OUT_OF_RANGE   = 1 << 6,
  FLAG_PRESS_OUT_OF_RANGE = 1 << 7,
};

enum AlertLevel : uint8_t {
  ALERT_NONE      = 0,
  ALERT_PRIORITY  = 1,
  ALERT_WARNING   = 2,
};

struct Measurement {
  uint32_t timestamp;
  int32_t  temperature_c_x100;
  uint32_t humidity_x100;
  uint32_t pressure_pa;
  uint16_t battery_mv;
  uint8_t  flags;
  uint8_t  alert;
  uint16_t sequence;
};

inline bool flagSet(uint8_t flags, MeasurementFlags f) {
  return (flags & static_cast<uint8_t>(f)) != 0;
}

inline bool measurementValid(const Measurement& m) {
  return flagSet(m.flags, FLAG_TEMP_VALID) &&
         flagSet(m.flags, FLAG_HUM_VALID) &&
         flagSet(m.flags, FLAG_PRESS_VALID);
}