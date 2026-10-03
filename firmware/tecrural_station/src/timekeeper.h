#pragma once

#include <Arduino.h>
#include "store.h"

namespace TimeKeeper {

bool begin();
bool sync();
bool isSynchronized();
uint32_t now();
uint32_t uptimeSeconds();
uint32_t lastSyncEpoch();
uint32_t msSinceSync();
uint8_t quality();
const char* qualityName(uint8_t q);
void advance(uint32_t sleep_seconds);

}  // namespace TimeKeeper