#pragma once

#include <Arduino.h>
#include "measurement.h"

#define STORE_FORMAT_VERSION 1
#define STORE_MIN_CAPACITY 32
#define STORE_MAX_CAPACITY 4000
#define STORE_FILE_PATH "/queue.bin"

enum TimeQuality : uint8_t {
  TIME_NO_REFERENCE = 0,
  TIME_ESTIMATED = 1,
  TIME_SYNCED = 2,
};

struct __attribute__((packed)) StoredRecord {
  uint32_t sequence;
  uint32_t ts;
  int16_t temp_c_x100;
  uint16_t hum_x100;
  uint32_t pressure_pa;
  uint16_t battery_mv;
  uint8_t flags;
  uint8_t quality;
  uint8_t alert;
  uint16_t crc;
};

static_assert(sizeof(StoredRecord) == 23, "StoredRecord layout must be stable");

struct TimeState {
  uint32_t reference;
  uint32_t base;
  uint32_t uptime_base;
};

namespace Store {

bool begin();
bool ready();
const char* faultReason();

uint32_t capacity();
uint32_t count();
uint32_t dropped();
uint32_t corrupt();
uint32_t ackedTotal();
uint32_t fileBytes();
uint32_t fsTotalBytes();
uint32_t fsFreeBytes();
uint8_t usagePercent();
bool nearLimit();
uint32_t lastSequence();
uint32_t oldestSequence();

bool push(const Measurement& m, uint32_t ts, uint8_t quality);
uint16_t read(StoredRecord* out, uint16_t max_items);
uint32_t acknowledgeThrough(uint32_t sequence);

bool loadTimeState(TimeState* out);
bool saveTimeState(const TimeState& s);

void report();

}  // namespace Store