#include "timekeeper.h"

#include <string.h>
#include <time.h>
#include <sys/time.h>

namespace {

constexpr long kGmtOffsetSec = 0;
constexpr uint32_t kSyncTimeoutMs = 12000;
constexpr uint32_t kFreshSyncSec = 3600;

uint32_t ref_epoch = 0;
uint32_t base_epoch = 0;
uint32_t uptime_base = 0;
uint32_t boot_millis = 0;
bool has_reference = false;
bool build_time_fallback = false;

void setSystemClock(uint32_t epoch) {
  struct timeval tv = {};
  tv.tv_sec = (time_t)epoch;
  settimeofday(&tv, nullptr);
}

// Reloj de respaldo: hora de compilacion del firmware (__DATE__/__TIME__).
// Esta red bloquea NTP (UDP/123); sin un reloj valido, mbedTLS rechaza el
// certificado TLS de Vercel por "aun no valido" y la subida falla.
time_t buildEpoch() {
  // __DATE__ = "Oct  4 2026", __TIME__ = "11:33:14". Se evitan sscanf/mktime
  // porque la particion de aplicacion esta al 99%.
  static const char kMon[] = "JanFebMarAprMayJunJulAugSepOctNovDec";
  char mon[4] = {__DATE__[0], __DATE__[1], __DATE__[2], 0};
  const char* p = strstr(kMon, mon);
  const int month = p ? (int)((p - kMon) / 3) + 1 : 1;
  const int day = (__DATE__[4] == ' ') ? (__DATE__[5] - '0')
                                       : (__DATE__[4] - '0') * 10 + (__DATE__[5] - '0');
  const int year = (__DATE__[7] - '0') * 1000 + (__DATE__[8] - '0') * 100 +
                   (__DATE__[9] - '0') * 10 + (__DATE__[10] - '0');
  const int hour = (__TIME__[0] - '0') * 10 + (__TIME__[1] - '0');
  const int minute = (__TIME__[3] - '0') * 10 + (__TIME__[4] - '0');
  const int second = (__TIME__[6] - '0') * 10 + (__TIME__[7] - '0');

  static const int kMonthDays[] = {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334};
  const long y = year - 1970;
  long days = y * 365 + (y + 3) / 4 + kMonthDays[month - 1] + (day - 1);
  if (month > 2 && (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0))) days += 1;
  return (time_t)days * 86400L + hour * 3600L + minute * 60L + second;
}

}  // namespace

namespace TimeKeeper {

bool begin() {
  boot_millis = millis();

  const uint32_t build = (uint32_t)buildEpoch();

  TimeState state = {};
  if (!Store::loadTimeState(&state) || state.base < 1700000000UL) {
    // Sin referencia guardada: arrancamos con la hora de compilacion para que la
    // validacion del certificado TLS no falle. Se marca como estimada.
    ref_epoch = build;
    base_epoch = build;
    uptime_base = 0;
    has_reference = true;
    build_time_fallback = true;
    setSystemClock(build);
    return true;
  }

  ref_epoch = state.reference;
  base_epoch = state.base;
  uptime_base = state.uptime_base;
  has_reference = ref_epoch > 0;
  build_time_fallback = false;
  if (has_reference && base_epoch >= 1700000000UL) {
    // Restore the last estimate before HTTPS certificate validation.
    setSystemClock(base_epoch);
  }
  return has_reference;
}

bool sync() {
  static const char* const kServers[] = {"pool.ntp.org", "time.google.com"};

  for (const char* server : kServers) {
    configTime(kGmtOffsetSec, 0, server);

    const uint32_t started = millis();
    struct tm timeinfo;
    while (millis() - started < kSyncTimeoutMs) {
      if (getLocalTime(&timeinfo, 1000) > 0) {
        const time_t candidate = time(nullptr);
        if (candidate > 1700000000) {
          const uint32_t up = uptimeSeconds();
          ref_epoch = (uint32_t)candidate;
          base_epoch = ref_epoch;
          uptime_base = up;
          boot_millis = millis();
          has_reference = true;
          build_time_fallback = false;
          Store::saveTimeState({ref_epoch, base_epoch, uptime_base});
          return true;
        }
      }
    }
  }
  return false;
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
  if (build_time_fallback) return TIME_ESTIMATED;
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
