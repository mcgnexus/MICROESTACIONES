#include "timekeeper.h"

#include <time.h>
#include <sys/time.h>

namespace {

constexpr char kNtpServer[] = "pool.ntp.org";
constexpr long kGmtOffsetSec = 0;
constexpr uint32_t kSyncTimeoutMs = 8000;
constexpr uint32_t kFreshSyncSec = 3600;

uint32_t ref_epoch = 0;
uint32_t base_epoch = 0;
uint32_t uptime_base = 0;
uint32_t boot_millis = 0;
bool has_reference = false;

}  // namespace

namespace TimeKeeper {

bool begin() {
  boot_millis = millis();

  TimeState state = {};
  if (!Store::loadTimeState(&state)) {
    ref_epoch = 0;
    base_epoch = 0;
    uptime_base = 0;
    has_reference = false;
    return false;
  }

  ref_epoch = state.reference;
  base_epoch = state.base;
  uptime_base = state.uptime_base;
  has_reference = ref_epoch > 0;
  if (has_reference && base_epoch >= 1700000000UL) {
    // Restore the last NTP-backed estimate before HTTPS certificate validation.
    struct timeval restored = {};
    restored.tv_sec = (time_t)base_epoch;
    settimeofday(&restored, nullptr);
  }
  return has_reference;
}

bool sync() {
  configTime(kGmtOffsetSec, 0, kNtpServer);

  const uint32_t started = millis();
  struct tm timeinfo;
  time_t confirmed = 0;

  while (millis() - started < kSyncTimeoutMs) {
    if (getLocalTime(&timeinfo, 1000) > 0) {
      const time_t candidate = time(nullptr);
      if (candidate > 1700000000) {
        confirmed = candidate;
        break;
      }
    }
  }

  if (confirmed == 0) return false;

  const uint32_t up = uptimeSeconds();
  ref_epoch = (uint32_t)confirmed;
  base_epoch = ref_epoch;
  uptime_base = up;
  boot_millis = millis();
  has_reference = true;
  Store::saveTimeState({ref_epoch, base_epoch, uptime_base});
  return true;
}

bool isSynchronized() {
  return has_reference;
}

uint32_t now() {
  if (!has_reference) return 0;
  return base_epoch + (millis() - boot_millis) / 1000UL;
}

uint32_t uptimeSeconds() {
  return uptime_base + (millis() - boot_millis) / 1000UL;
}

uint32_t lastSyncEpoch() {
  return ref_epoch;
}

uint32_t msSinceSync() {
  if (!has_reference) return 0;
  const uint32_t current = now();
  if (current <= ref_epoch) return 0;
  return (current - ref_epoch) * 1000UL;
}

uint8_t quality() {
  if (!has_reference) return TIME_NO_REFERENCE;
  if (msSinceSync() <= kFreshSyncSec * 1000UL) return TIME_SYNCED;
  return TIME_ESTIMATED;
}

const char* qualityName(uint8_t q) {
  switch (q) {
    case TIME_NO_REFERENCE: return "sin referencia";
    case TIME_ESTIMATED: return "estimada";
    case TIME_SYNCED: return "sincronizada";
    default: return "desconocida";
  }
}

void advance(uint32_t sleep_seconds) {
  const uint32_t up = uptimeSeconds();

  if (has_reference) {
    base_epoch = now() + sleep_seconds;
  }
  boot_millis = millis();
  uptime_base = up;

  Store::saveTimeState({ref_epoch, base_epoch, uptime_base});
}

}  // namespace TimeKeeper
