#pragma once

#include <Arduino.h>

namespace Power {

enum WakeReason : uint8_t {
  WAKE_POWERON = 0,
  WAKE_TIMER,
  WAKE_UNDEFINED,
  WAKE_OTHER,
};

bool begin();
WakeReason wakeReason();
const char* wakeReasonName();
uint32_t decideIntervalSeconds(bool risk_allowed, bool battery_ok);
void enterDeepSleep(uint32_t seconds);
void prepareForSleep();
void shutdown();

}  // namespace Power