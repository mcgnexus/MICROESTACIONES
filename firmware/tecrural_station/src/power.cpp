#include "power.h"

#include <esp_sleep.h>
#include "config.h"
#include "battery.h"
#include "timekeeper.h"

namespace {

Power::WakeReason reason_at_boot = Power::WAKE_POWERON;

}  // namespace

namespace Power {

bool begin() {
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER) {
    reason_at_boot = WAKE_TIMER;
  } else if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_UNDEFINED) {
    reason_at_boot = WAKE_POWERON;
  } else {
    reason_at_boot = WAKE_OTHER;
  }
  return true;
}

WakeReason wakeReason() {
  return reason_at_boot;
}

const char* wakeReasonName() {
  switch (reason_at_boot) {
    case WAKE_TIMER: return "temporizador";
    case WAKE_POWERON: return "encendido";
    case WAKE_OTHER: return "otro";
    default: return "desconocido";
  }
}

uint16_t decideIntervalSeconds(bool risk_allowed, bool battery_ok) {
  const StationConfig& c = ConfigStore::current();

  if (!battery_ok) {
    return c.interval_normal_s * 2;
  }

  if (risk_allowed && c.risk_mode_enabled) {
    uint16_t risk = c.interval_risk_s;
    if (risk < c.interval_risk_min_s) risk = c.interval_risk_min_s;
    if (risk < 60) risk = 60;
    return risk;
  }

  if (c.interval_normal_s < 60) return 60;
  return c.interval_normal_s;
}

void prepareForSleep() {
  Battery::powerDown();
}

void enterDeepSleep(uint32_t seconds) {
  prepareForSleep();
  if (seconds < 10) seconds = 10;
#ifdef TECRURAL_SLEEP_CAP_S
  if (seconds > TECRURAL_SLEEP_CAP_S) seconds = TECRURAL_SLEEP_CAP_S;
#endif
  TimeKeeper::advance(seconds);
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  esp_deep_sleep_start();
}

void shutdown() {
  prepareForSleep();
}

}  // namespace Power