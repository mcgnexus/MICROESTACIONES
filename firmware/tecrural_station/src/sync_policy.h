#pragma once
#include <stdint.h>

// Sin dependencias Arduino: la política se comprueba durante la compilación.
namespace SyncPolicy {
constexpr bool elapsed(bool attempted, uint32_t now, uint32_t last, uint32_t interval) {
  return !attempted || (uint32_t)(now - last) >= interval;
}
constexpr bool due(bool enabled, uint32_t pending, bool attempted, uint32_t now,
                   uint32_t last, uint32_t interval, uint8_t failed_cycles) {
  return enabled && pending > 0 && (failed_cycles > 0 || pending >= 6
    || elapsed(attempted, now, last, interval));
}
constexpr bool recoverable(int status) {
  // Reiniciar no arregla un token rechazado ni un JSON inválido.
  return !(status >= 400 && status < 500 && status != 408 && status != 429);
}
constexpr uint8_t failedCycles(uint8_t previous, uint32_t before, uint32_t after, int status) {
  return after == 0 || after < before || !recoverable(status) ? 0
    : previous < 255 ? previous + 1 : 255;
}
constexpr bool restartDue(uint8_t failed_cycles) { return failed_cycles >= 3; }
}
