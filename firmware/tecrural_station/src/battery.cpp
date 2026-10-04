#include "battery.h"

#if BATTERY_MONITOR_ENABLED
#include <esp_adc/adc_oneshot.h>
#include <esp_adc/adc_cali.h>
#include <esp_adc/adc_cali_scheme.h>
#include <esp_attr.h>
#endif
#include "config.h"

namespace {

#if BATTERY_MONITOR_ENABLED
constexpr adc_channel_t kAdcChannel = ADC_CHANNEL_1;
constexpr adc_atten_t kAtten = ADC_ATTEN_DB_12;
adc_oneshot_unit_handle_t adc_handle = nullptr;
adc_cali_handle_t cali_handle = nullptr;
bool calibrated = false;
RTC_DATA_ATTR int32_t previous_battery_mv = 0;
#endif
int32_t last_raw_mv = 0;
enum TrendState : uint8_t { TREND_UNKNOWN, TREND_RISING, TREND_STABLE, TREND_FALLING };
TrendState current_trend = TREND_UNKNOWN;

#if BATTERY_MONITOR_ENABLED
bool caliInit() {
  adc_cali_curve_fitting_config_t cfg = {};
  cfg.unit_id = ADC_UNIT_1;
  cfg.chan = kAdcChannel;
  cfg.atten = kAtten;
  cfg.bitwidth = ADC_BITWIDTH_DEFAULT;
  return adc_cali_create_scheme_curve_fitting(&cfg, &cali_handle) == ESP_OK;
}

int32_t rawToMv(int raw) {
  if (calibrated) {
    int mv = 0;
    if (adc_cali_raw_to_voltage(cali_handle, raw, &mv) == ESP_OK) return mv;
  }
  return -1;
}
#endif

}  // namespace

namespace Battery {

bool begin() {
#if !BATTERY_MONITOR_ENABLED
  last_raw_mv = 0;
  current_trend = TREND_UNKNOWN;
  return true;
#else
  adc_oneshot_unit_init_cfg_t unit_cfg = {};
  unit_cfg.unit_id = ADC_UNIT_1;
  if (adc_oneshot_new_unit(&unit_cfg, &adc_handle) != ESP_OK) {
    adc_handle = nullptr;
    return false;
  }
  adc_oneshot_chan_cfg_t chan_cfg = {};
  chan_cfg.atten = kAtten;
  chan_cfg.bitwidth = ADC_BITWIDTH_DEFAULT;
  if (adc_oneshot_config_channel(adc_handle, kAdcChannel, &chan_cfg) != ESP_OK) {
    return false;
  }
  calibrated = caliInit();
  return true;
#endif
}

uint16_t millivolts() {
#if !BATTERY_MONITOR_ENABLED
  return 0;
#else
  if (adc_handle == nullptr) return 0;
  int total = 0, samples = 0;
  for (int i = 0; i < 16; i++) {
    int raw = 0;
    if (adc_oneshot_read(adc_handle, kAdcChannel, &raw) == ESP_OK) {
      total += raw;
      samples++;
    }
    delay(3);
  }
  if (samples == 0) return 0;

  int32_t pin_mv = rawToMv(total / samples);
  if (pin_mv < 0) return 0;
  int32_t mv = pin_mv;
  mv = (int32_t)(mv * BATTERY_CAL_MULTIPLIER) + BATTERY_CAL_OFFSET_MV;
  last_raw_mv = mv * BATTERY_DIVIDER_NUM / BATTERY_DIVIDER_DEN;

  if (last_raw_mv < 0) last_raw_mv = 0;
  if (last_raw_mv > 5000) last_raw_mv = 5000;
  return (uint16_t)last_raw_mv;
#endif
}

const char* trend() {
  switch (current_trend) {
    case TREND_RISING: return "subiendo";
    case TREND_STABLE: return "estable";
    case TREND_FALLING: return "bajando";
    default: return "sin referencia";
  }
}

bool isLow() {
#if !BATTERY_MONITOR_ENABLED
  // A deliberately frozen monitor is treated as a healthy battery for station behavior.
  return false;
#else
  return last_raw_mv > 0 && last_raw_mv <= (uint16_t)ConfigStore::current().battery_low_mv;
#endif
}

bool isCritical() {
#if !BATTERY_MONITOR_ENABLED
  // Do not block alerts or double the sampling interval while voltage sensing is disabled.
  return false;
#else
  return last_raw_mv <= (uint16_t)ConfigStore::current().battery_critical_mv;
#endif
}

bool read(Measurement& m) {
#if !BATTERY_MONITOR_ENABLED
  m.battery_mv = 0;
  m.flags &= ~FLAG_BATTERY_VALID;
  current_trend = TREND_UNKNOWN;
  return false;
#else
  uint16_t mv = millivolts();
  m.battery_mv = mv;
  m.flags &= ~FLAG_BATTERY_VALID;
  if (mv > 0) {
    m.flags |= FLAG_BATTERY_VALID;
    if (previous_battery_mv > 0) {
      const int32_t delta = (int32_t)mv - previous_battery_mv;
      current_trend = delta > 20 ? TREND_RISING : delta < -20 ? TREND_FALLING : TREND_STABLE;
    }
    previous_battery_mv = mv;
  } else {
    current_trend = TREND_UNKNOWN;
  }
  return mv > 0;
#endif
}

void powerDown() {
#if BATTERY_MONITOR_ENABLED
  // Retain the last measured voltage so the next deep-sleep wake can report a trend.
  if (cali_handle) {
    adc_cali_delete_scheme_curve_fitting(cali_handle);
    cali_handle = nullptr;
    calibrated = false;
  }
  if (adc_handle) {
    adc_oneshot_del_unit(adc_handle);
    adc_handle = nullptr;
  }
#endif
}

}  // namespace Battery
