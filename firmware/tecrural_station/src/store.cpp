#include "store.h"

#include <LittleFS.h>
#include <stddef.h>
#include <string.h>

namespace {

constexpr char kPartition[] = "spiffs";
constexpr char kBasePath[] = "/littlefs";
constexpr char kMode[] = "r+";

constexpr uint32_t kMagic = 0x53545231;
constexpr uint32_t kHeaderSlotBytes = 4096;
constexpr uint32_t kHeaderSlots = 2;
constexpr uint32_t kRecordsOffset = kHeaderSlotBytes * kHeaderSlots;
constexpr uint32_t kSafetyMarginPercent = 20;
constexpr uint32_t kNearLimitPercent = 80;

struct __attribute__((packed)) LogHeader {
  uint32_t magic;
  uint16_t version;
  uint16_t record_size;
  uint32_t generation;
  uint32_t capacity;
  uint32_t count;
  uint32_t write_index;
  uint32_t dropped;
  uint32_t next_sequence;
  uint32_t acked_total;
  uint32_t oldest_sequence;
  uint32_t time_reference;
  uint32_t time_base;
  uint32_t uptime_base;
  uint16_t crc;
};

static_assert(sizeof(LogHeader) == 54, "LogHeader layout must be stable");

LogHeader header;
bool store_ready = false;
const char* fault = "";
uint32_t corrupt_count = 0;
uint32_t fs_total = 0;
uint32_t fs_used = 0;

uint16_t crc16(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)((uint16_t)data[i] << 8);
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (uint16_t)((uint16_t)(crc << 1) ^ 0x1021);
      } else {
        crc = (uint16_t)(crc << 1);
      }
    }
  }
  return crc;
}

uint16_t headerCrc(const LogHeader& h) {
  return crc16((const uint8_t*)&h, offsetof(LogHeader, crc));
}

uint16_t recordCrc(const StoredRecord& r) {
  return crc16((const uint8_t*)&r, offsetof(StoredRecord, crc));
}

int16_t clampI16(int32_t v) {
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return (int16_t)v;
}

uint16_t clampU16(uint32_t v) {
  return v > 65535UL ? 65535 : (uint16_t)v;
}

uint32_t recordOffset(uint32_t slot) {
  return kRecordsOffset + slot * (uint32_t)sizeof(StoredRecord);
}

bool writeHeader(File& f) {
  header.crc = headerCrc(header);
  uint32_t slot = header.generation % kHeaderSlots;
  if (!f.seek(slot * kHeaderSlotBytes, SeekSet)) return false;
  if (f.write((const uint8_t*)&header, sizeof(header)) != sizeof(header)) return false;
  f.flush();
  return true;
}

bool loadHeaderSlot(File& f, uint32_t slot, LogHeader* out) {
  memset(out, 0, sizeof(*out));
  if (!f.seek(slot * kHeaderSlotBytes, SeekSet)) return false;
  if (f.read((uint8_t*)out, sizeof(LogHeader)) != sizeof(LogHeader)) return false;
  if (out->magic != kMagic) return false;
  if (out->version != STORE_FORMAT_VERSION) return false;
  if (out->record_size != sizeof(StoredRecord)) return false;
  if (out->capacity < STORE_MIN_CAPACITY || out->capacity > STORE_MAX_CAPACITY) return false;
  if (out->count > out->capacity) return false;
  if (out->write_index >= out->capacity) return false;
  if (out->crc != headerCrc(*out)) return false;
  return true;
}

bool readHeader(File& f) {
  LogHeader a;
  LogHeader b;
  const bool ok_a = loadHeaderSlot(f, 0, &a);
  const bool ok_b = loadHeaderSlot(f, 1, &b);
  if (ok_a && ok_b) {
    header = (b.generation > a.generation) ? b : a;
    return true;
  }
  if (ok_a) {
    header = a;
    return true;
  }
  if (ok_b) {
    header = b;
    return true;
  }
  return false;
}

bool initialize(File& f) {
  const uint32_t total = (uint32_t)LittleFS.totalBytes();
  const uint32_t used = (uint32_t)LittleFS.usedBytes();
  const uint32_t available = (used < total) ? (total - used) : 0;
  const uint32_t with_margin = total * (100UL - kSafetyMarginPercent) / 100UL;

  uint32_t usable = with_margin;
  if (usable > available) usable = available;
  if (usable <= kRecordsOffset) return false;

  uint32_t cap = (usable - kRecordsOffset) / (uint32_t)sizeof(StoredRecord);
  if (cap > STORE_MAX_CAPACITY) cap = STORE_MAX_CAPACITY;
  if (cap < STORE_MIN_CAPACITY) return false;

  memset(&header, 0, sizeof(header));
  header.magic = kMagic;
  header.version = STORE_FORMAT_VERSION;
  header.record_size = sizeof(StoredRecord);
  header.generation = 1;
  header.capacity = cap;
  header.count = 0;
  header.write_index = 0;
  header.dropped = 0;
  header.next_sequence = 1;
  header.acked_total = 0;
  header.oldest_sequence = 1;
  header.time_reference = 0;
  header.time_base = 0;
  header.uptime_base = 0;
  return writeHeader(f);
}

}  // namespace

namespace Store {

bool begin() {
  fault = "";
  store_ready = false;
  corrupt_count = 0;

  if (!LittleFS.begin(false, kBasePath, 4, kPartition)) {
    if (!LittleFS.begin(true, kBasePath, 4, kPartition)) {
      fault = "no se pudo montar LittleFS en la particion spiffs";
      return false;
    }
    Serial.println("[almacen] AVISO: LittleFS ilegible o sin formato; se formateo y la cola anterior se perdio");
  }

  fs_total = (uint32_t)LittleFS.totalBytes();
  fs_used = (uint32_t)LittleFS.usedBytes();

  File f = LittleFS.open(STORE_FILE_PATH, kMode, true);
  if (!f) {
    // La cola no existe (p. ej. tras formatear LittleFS): crearla en blanco.
    f = LittleFS.open(STORE_FILE_PATH, FILE_WRITE);
    if (!f) {
      fault = "no se pudo crear la cola persistente";
      return false;
    }
    if (!initialize(f)) {
      f.close();
      fault = "no se pudo inicializar la cola persistente";
      return false;
    }
    f.close();
    store_ready = true;
    return true;
  }

  if (!readHeader(f) && !initialize(f)) {
    f.close();
    fault = "no se pudo inicializar la cola persistente";
    return false;
  }

  f.close();
  store_ready = true;
  return true;
}

bool ready() {
  return store_ready;
}

const char* faultReason() {
  return fault;
}

uint32_t capacity() {
  return store_ready ? header.capacity : 0;
}

uint32_t count() {
  return store_ready ? header.count : 0;
}

uint32_t dropped() {
  return store_ready ? header.dropped : 0;
}

uint32_t corrupt() {
  return corrupt_count;
}

uint32_t ackedTotal() {
  return store_ready ? header.acked_total : 0;
}

uint32_t fileBytes() {
  return kRecordsOffset + capacity() * (uint32_t)sizeof(StoredRecord);
}

uint32_t fsTotalBytes() {
  return fs_total;
}

uint32_t fsFreeBytes() {
  return (fs_used < fs_total) ? (fs_total - fs_used) : 0;
}

uint8_t usagePercent() {
  const uint32_t cap = capacity();
  if (cap == 0) return 0;
  return (uint8_t)((count() * 100UL) / cap);
}

bool nearLimit() {
  return usagePercent() >= kNearLimitPercent;
}

uint32_t lastSequence() {
  return store_ready ? (header.next_sequence - 1) : 0;
}

uint32_t oldestSequence() {
  return store_ready ? header.oldest_sequence : 0;
}

bool push(const Measurement& m, uint32_t ts, uint8_t quality) {
  if (!store_ready) return false;

  File f = LittleFS.open(STORE_FILE_PATH, kMode, true);
  if (!f) return false;

  StoredRecord rec;
  rec.sequence = header.next_sequence;
  rec.ts = ts;
  rec.temp_c_x100 = clampI16(m.temperature_c_x100);
  rec.hum_x100 = clampU16(m.humidity_x100);
  rec.pressure_pa = m.pressure_pa;
  rec.battery_mv = m.battery_mv;
  rec.flags = (uint8_t)(m.flags & (uint8_t)(~FLAG_TIME_VALID));
  rec.quality = quality;
  rec.alert = m.alert;
  rec.crc = recordCrc(rec);

  bool ok = f.seek(recordOffset(header.write_index), SeekSet);
  if (ok) {
    ok = f.write((const uint8_t*)&rec, sizeof(rec)) == sizeof(rec);
  }

  if (ok) {
    f.flush();
    const LogHeader before = header;
    if (header.count >= header.capacity) {
      header.dropped++;
      header.oldest_sequence++;
    } else {
      header.count++;
    }
    header.write_index = (header.write_index + 1) % header.capacity;
    header.next_sequence++;
    header.generation++;
    ok = writeHeader(f);
    if (!ok) header = before;
  }

  f.close();
  return ok;
}

uint16_t read(StoredRecord* out, uint16_t max_items) {
  if (!store_ready || header.count == 0 || out == nullptr || max_items == 0) return 0;

  File f = LittleFS.open(STORE_FILE_PATH, kMode, true);
  if (!f) return 0;

  uint16_t wanted = (uint16_t)header.count;
  if (wanted > max_items) wanted = max_items;
  const uint32_t start = (header.write_index + header.capacity - header.count) % header.capacity;

  uint16_t produced = 0;
  for (uint16_t i = 0; i < wanted; i++) {
    const uint32_t slot = (start + i) % header.capacity;
    if (!f.seek(recordOffset(slot), SeekSet)) break;

    StoredRecord rec;
    if (f.read((uint8_t*)&rec, sizeof(rec)) != sizeof(rec)) break;
    if (rec.crc != recordCrc(rec)) {
      corrupt_count++;
      Serial.printf("[almacen] registro corrupto (slot %u), omitido\n", (unsigned)slot);
      continue;
    }
    out[produced++] = rec;
  }

  f.close();
  return produced;
}

uint32_t acknowledgeThrough(uint32_t sequence) {
  if (!store_ready || header.count == 0) return 0;
  if (sequence < header.oldest_sequence) return 0;

  uint32_t contiguous = sequence - header.oldest_sequence + 1;
  if (contiguous > header.count) contiguous = header.count;
  if (contiguous == 0) return 0;

  File f = LittleFS.open(STORE_FILE_PATH, kMode, true);
  if (!f) return 0;

  const LogHeader before = header;
  header.oldest_sequence += contiguous;
  header.count -= contiguous;
  header.acked_total += contiguous;
  header.generation++;

  bool ok = writeHeader(f);
  if (!ok) header = before;
  f.close();
  return ok ? contiguous : 0;
}

bool loadTimeState(TimeState* out) {
  if (!store_ready || out == nullptr) return false;
  out->reference = header.time_reference;
  out->base = header.time_base;
  out->uptime_base = header.uptime_base;
  return true;
}

bool saveTimeState(const TimeState& s) {
  if (!store_ready) return false;
  if (header.time_reference == s.reference && header.time_base == s.base &&
      header.uptime_base == s.uptime_base) {
    return true;
  }

  File f = LittleFS.open(STORE_FILE_PATH, kMode, true);
  if (!f) return false;

  const LogHeader before = header;
  header.time_reference = s.reference;
  header.time_base = s.base;
  header.uptime_base = s.uptime_base;
  header.generation++;

  bool ok = writeHeader(f);
  if (!ok) header = before;
  f.close();
  return ok;
}

void report() {
  Serial.printf("[almacen] formato v%u, registro %u B\n",
                (unsigned)STORE_FORMAT_VERSION, (unsigned)sizeof(StoredRecord));
  Serial.printf("[almacen] particion %u B totales, %u B libres\n", fs_total, fsFreeBytes());
  Serial.printf("[almacen] cola %u B de %u B utiles (margen %u%%)\n",
                fileBytes(), capacity() * (uint32_t)sizeof(StoredRecord) + kRecordsOffset,
                (unsigned)kSafetyMarginPercent);
  Serial.printf("[almacen] pendientes %u / %u (%u%%), uso %u%%\n",
                count(), capacity(), (unsigned)usagePercent(), (unsigned)usagePercent());
  Serial.printf("[almacen] secuencia %u..%u, confirmados %u, descartados %u, corruptos %u\n",
                oldestSequence(), lastSequence(), ackedTotal(), dropped(), corrupt_count);
  if (nearLimit()) {
    Serial.println("[almacen] AVISO: la cola se acerca al limite");
  }
}

}  // namespace Store