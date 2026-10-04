#include "sensors.h"

#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP280.h>
#include <Wire.h>

#include "config.h"

// El modulo del operador NO es un BME280: es un AHT20 + BMP280 en la misma
// placa.  Son dos chips I2C independientes:
//   - AHT20  @ 0x38        -> temperatura + humedad
//   - BMP280 @ 0x76 / 0x77 -> presion barometrica (+ temperatura)
// El driver BME280 anterior fallaba en begin() porque el ID de chip del
// BMP280 es 0x58, no 0x60 -> todo salia INVALIDA.

namespace {

class Aht20Bmp280Driver : public SensorDriver {
 public:
  bool begin() override {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(100000);

    // BMP280: presion.  La mayoria de modulos usan 0x76 o 0x77.
    static const uint8_t kAddrs[] = {0x76, 0x77};
    for (uint8_t addr : kAddrs) {
      if (bmp.begin(addr)) {
        bmp.setSampling(Adafruit_BMP280::MODE_FORCED,
                        Adafruit_BMP280::SAMPLING_X1,  // temperatura
                        Adafruit_BMP280::SAMPLING_X1,  // presion
                        Adafruit_BMP280::FILTER_OFF,
                        Adafruit_BMP280::STANDBY_MS_1);
        bmp_ready = true;
        break;
      }
    }

    // AHT20: temperatura + humedad (direccion fija 0x38).
    aht_ready = aht.begin();

    Serial.printf("[sensors] BMP280 %s\n", bmp_ready ? "ok" : "no responde");
    Serial.printf("[sensors] AHT20 %s\n", aht_ready ? "ok" : "no responde");

    return bmp_ready || aht_ready;
  }

  const char* name() const override { return "AHT20+BMP280"; }

  bool read(float& temp_c, float& humidity_pct, float& pressure_pa) override {
    temp_c = NAN;
    humidity_pct = NAN;
    pressure_pa = NAN;
    bool have_temp = false;

    if (aht_ready) {
      sensors_event_t hum_evt, temp_evt;
      if (aht.getEvent(&hum_evt, &temp_evt)) {
        if (isfinite(temp_evt.temperature)) {
          temp_c = temp_evt.temperature;
          have_temp = true;
        }
        if (isfinite(hum_evt.relative_humidity)) {
          humidity_pct = hum_evt.relative_humidity;
        }
      }
    }

    if (bmp_ready) {
      bmp.takeForcedMeasurement();
      float p = bmp.readPressure();
      if (isfinite(p) && p > 0.0f) pressure_pa = p;
      // Solo usamos la temperatura del BMP280 si el AHT20 no dio ninguna.
      if (!have_temp) {
        float t = bmp.readTemperature();
        if (isfinite(t)) {
          temp_c = t;
          have_temp = true;
        }
      }
    }

    return have_temp;
  }

 private:
  Adafruit_BMP280 bmp;
  Adafruit_AHTX0 aht;
  bool bmp_ready = false;
  bool aht_ready = false;
};

bool range_ok_temp(float v) { return v >= SENSOR_TEMP_MIN_C && v <= SENSOR_TEMP_MAX_C; }
bool range_ok_hum(float v) { return v >= SENSOR_HUM_MIN_PCT && v <= SENSOR_HUM_MAX_PCT; }
bool range_ok_press(float v) { return v >= SENSOR_PRESS_MIN_PA && v <= SENSOR_PRESS_MAX_PA; }

}  // namespace

SensorDriver* createSensor() {
  static Aht20Bmp280Driver instance;
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
  float t = NAN, h = NAN, p = NAN;

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

  // La helada es tan critica como la ola de calor en agricultura y ganaderia:
  // ambas disparan alerta prioritaria (y con ella el envio inmediato por riesgo).
  if (flagSet(m.flags, FLAG_TEMP_VALID)) {
    if (t >= c.temp_alert_high_c) level = ALERT_PRIORITY;
    else if (t <= c.temp_alert_low_c) level = ALERT_PRIORITY;
  }
  // Los avisos NO deben rebajar una alerta prioritaria ya fijada. El enum tiene
  // PRIORITY=1 < WARNING=2, asi que la comparacion numerica era incorrecta.
  if (level != ALERT_PRIORITY && flagSet(m.flags, FLAG_HUM_VALID) &&
      m.humidity_x100 / 100.0f >= (float)c.humidity_alert_high_pct) {
    level = ALERT_WARNING;
  }
  if (level != ALERT_PRIORITY && flagSet(m.flags, FLAG_PRESS_VALID) &&
      m.pressure_pa < c.pressure_alert_low_pa) {
    level = ALERT_WARNING;
  }
  return level;
}

}  // namespace Sensors
