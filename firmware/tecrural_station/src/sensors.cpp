#include "sensors.h"

#include <Wire.h>
#include <Adafruit_BME280.h>
#include "config.h"

namespace {

class Bme280Driver : public SensorDriver {
 public:
  bool begin() override {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(400000);

    static const uint8_t kAddrs[] = {0x76, 0x77};
    for (uint8_t addr : kAddrs) {
      if (bme.begin(addr)) {
        bme.setSampling(Adafruit_BME280::MODE_FORCED,
                        Adafruit_BME280::SAMPLING_X1,
                        Adafruit_BME280::SAMPLING_X1,
                        Adafruit_BME280::SAMPLING_X1,
                        Adafruit_BME280::FILTER_OFF);
        ready = true;
        return true;
      }
    }
    return false;
  }

  const char* name() const override { return "BME280"; }

  bool read(float& temp_c, float& humidity_pct, float& pressure_pa) override {
    if (!ready) return false;
    bme.takeForcedMeasurement();
    temp_c = bme.readTemperature();
    humidity_pct = bme.readHumidity();
    pressure_pa = bme.readPressure();
    return isfinite(temp_c) && isfinite(humidity_pct) && isfinite(pressure_pa);
  }

 private:
  Adafruit_BME280 bme;
  bool ready = false;
};

bool range_ok_temp(float v) { return v >= SENSOR_TEMP_MIN_C && v <= SENSOR_TEMP_MAX_C; }
bool range_ok_hum(float v) { return v >= SENSOR_HUM_MIN_PCT && v <= SENSOR_HUM_MAX_PCT; }
bool range_ok_press(float v) { return v >= SENSOR_PRESS_MIN_PA && v <= SENSOR_PRESS_MAX_PA; }

}  // namespace

SensorDriver* createSensor() {
  static Bme280Driver instance;
  return &instance;
}

namespace Sensors {

bool begin() {
  SensorDriver* d = createSensor();
  if (!d->begin()) {
    Serial.printf("[sensors] driver %s no responde\n", d->name());
    return false;
  }
  Serial.printf("[sensors] driver %s listo (SDA=%d SCL=%d)\n", d->name(), PIN_I2C_SDA, PIN_I2C_SCL);
  return true;
}

const char* driverName() {
  return createSensor()->name();
}

bool read(Measurement& m) {
  SensorDriver* d = createSensor();
  float t = 0.0f, h = 0.0f, p = 0.0f;

  m.flags &= ~(FLAG_TEMP_VALID | FLAG_HUM_VALID | FLAG_PRESS_VALID |
               FLAG_TEMP_OUT_OF_RANGE | FLAG_HUM_OUT_OF_RANGE | FLAG_PRESS_OUT_OF_RANGE);

  if (d->read(t, h, p)) {
    if (range_ok_temp(t)) {
      m.temperature_c_x100 = (int32_t)(t * 100.0f);
      m.flags |= FLAG_TEMP_VALID;
    } else {
      m.flags |= FLAG_TEMP_OUT_OF_RANGE;
    }
    if (range_ok_hum(h)) {
      m.humidity_x100 = (uint32_t)(h * 100.0f + 0.5f);
      m.flags |= FLAG_HUM_VALID;
    } else {
      m.flags |= FLAG_HUM_OUT_OF_RANGE;
    }
    if (range_ok_press(p)) {
      m.pressure_pa = (uint32_t)p;
      m.flags |= FLAG_PRESS_VALID;
    } else {
      m.flags |= FLAG_PRESS_OUT_OF_RANGE;
    }
  } else {
    m.temperature_c_x100 = 0;
    m.humidity_x100 = 0;
    m.pressure_pa = 0;
  }

  m.alert = evaluateAlert(m);
  return measurementValid(m);
}

uint8_t evaluateAlert(const Measurement& m) {
  const StationConfig& c = ConfigStore::current();
  float t = m.temperature_c_x100 / 100.0f;
  uint8_t level = ALERT_NONE;

  if (flagSet(m.flags, FLAG_TEMP_OUT_OF_RANGE)) return ALERT_PRIORITY;

  if (flagSet(m.flags, FLAG_TEMP_VALID)) {
    if (t >= c.temp_alert_high_c) level = ALERT_PRIORITY;
    else if (t <= c.temp_alert_low_c) level = ALERT_WARNING;
  }
  if (flagSet(m.flags, FLAG_HUM_VALID) &&
      m.humidity_x100 / 100.0f >= (float)c.humidity_alert_high_pct) {
    if (level < ALERT_WARNING) level = ALERT_WARNING;
  }
  if (flagSet(m.flags, FLAG_PRESS_VALID) &&
      m.pressure_pa < c.pressure_alert_low_pa) {
    if (level < ALERT_WARNING) level = ALERT_WARNING;
  }
  return level;
}

}  // namespace Sensors