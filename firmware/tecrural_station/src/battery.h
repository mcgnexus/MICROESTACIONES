#pragma once

#include <Arduino.h>
#include "measurement.h"

#define PIN_BATTERY_ADC 1

#define BATTERY_MONITOR_ENABLED 0

// Set these only after verifying the physical divider and calculating its ratio:
// battery voltage = ADC pin voltage * (R_TOP + R_BOTTOM) / R_BOTTOM.
#define BATTERY_DIVIDER_NUM 0
#define BATTERY_DIVIDER_DEN 0
#define BATTERY_CAL_MULTIPLIER 1.00f
#define BATTERY_CAL_OFFSET_MV 0

#if BATTERY_MONITOR_ENABLED && (BATTERY_DIVIDER_NUM <= 0 || BATTERY_DIVIDER_DEN <= 0)
#error "Verify the battery divider circuit and set BATTERY_DIVIDER_NUM/DEN before building."
#endif

namespace Battery {

bool begin();
bool read(Measurement& m);
uint16_t millivolts();
const char* trend();
bool isLow();
bool isCritical();
void powerDown();

}  // namespace Battery
