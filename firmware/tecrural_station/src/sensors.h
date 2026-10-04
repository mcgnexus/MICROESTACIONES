#pragma once

#include <Arduino.h>
#include "measurement.h"

#define PIN_I2C_SDA 6
#define PIN_I2C_SCL 7

#define SENSOR_TEMP_MIN_C (-40.0f)
#define SENSOR_TEMP_MAX_C (85.0f)
#define SENSOR_HUM_MIN_PCT (0.0f)
#define SENSOR_HUM_MAX_PCT (100.0f)
#define SENSOR_PRESS_MIN_PA (30000UL)
#define SENSOR_PRESS_MAX_PA (110000UL)

class SensorDriver {
 public:
  virtual ~SensorDriver() {}
  virtual bool begin() = 0;
  virtual const char* name() const = 0;
  virtual bool read(float& temp_c, float& humidity_pct, float& pressure_pa) = 0;
};

SensorDriver* createSensor();

namespace Sensors {

bool begin();
bool read(Measurement& m);
const char* driverName();
uint8_t evaluateAlert(const Measurement& m);

}  // namespace Sensors