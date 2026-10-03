#include "wifi_sync.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <string.h>
#include "store.h"
#include "timekeeper.h"
#include "config.h"

namespace {

uint32_t failure_counter = 0;
constexpr size_t kMaxPayloadBytes = 6000;

bool apiConfigured() {
  return strlen(DEVICE_ID) > 0 && strlen(API_BASE_URL) > 8 &&
         strncmp(API_BASE_URL, "https://", 8) == 0 &&
         strstr(API_BASE_URL, "your-api.example.com") == nullptr &&
         strlen(DEVICE_API_TOKEN) >= 32 &&
         strstr(DEVICE_API_TOKEN, "provision-a-unique-token-for-this-device") == nullptr &&
         strstr(SERVER_ROOT_CA, "-----BEGIN CERTIFICATE-----") != nullptr &&
         strstr(SERVER_ROOT_CA, "-----END CERTIFICATE-----") != nullptr &&
         strstr(SERVER_ROOT_CA, "...") == nullptr;
}

String apiUrl(const char* path) {
  String base(API_BASE_URL);
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + path;
}

}  // namespace

namespace WiFiSync {

void begin() {
  Serial.printf("[wifi] identidad de dispositivo: %s\n", DEVICE_ID[0] ? DEVICE_ID : "SIN CONFIGURAR");
}

bool connect(uint32_t timeout_ms) {
  if (isConnected()) return true;

  if (strlen(WIFI_SSID) == 0 || strcmp(WIFI_SSID, "your-wifi-name") == 0) {
    Serial.println("[wifi] sin SSID configurado, se omite la conexion");
    return false;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeout_ms) {
    delay(100);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] conectado en %lus\n", (millis() - start) / 1000);
    return true;
  }
  failure_counter++;
  Serial.printf("[wifi] fallo de conexion tras %lus\n", (millis() - start) / 1000);
  return false;
}

void disconnect() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool isConnected() {
  return WiFi.status() == WL_CONNECTED;
}

bool uploadBatch(uint32_t timeout_ms) {
  if (!isConnected()) return false;
  if (!apiConfigured()) {
    Serial.println("[wifi] falta identidad, URL HTTPS, token o certificado raiz real de la API");
    return false;
  }
  if (Store::count() == 0) return false;

  StoredRecord batch[SYNC_BATCH_SIZE];
  const uint16_t available = Store::read(batch, SYNC_BATCH_SIZE);
  if (available == 0) {
    Serial.println("[wifi] ninguna lectura integra disponible");
    return false;
  }

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  uint16_t n = 0;

  for (uint16_t i = 0; i < available; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["device_id"] = DEVICE_ID;
    o["sequence"] = batch[i].sequence;
    o["ts"] = batch[i].ts;
    o["quality"] = batch[i].quality;
    if (flagSet(batch[i].flags, FLAG_TEMP_VALID)) o["temp_c"] = batch[i].temp_c_x100 / 100.0f;
    if (flagSet(batch[i].flags, FLAG_HUM_VALID)) o["hum_pct"] = batch[i].hum_x100 / 100.0f;
    if (flagSet(batch[i].flags, FLAG_PRESS_VALID)) o["press_pa"] = batch[i].pressure_pa;
    if (flagSet(batch[i].flags, FLAG_BATTERY_VALID)) o["batt_mv"] = batch[i].battery_mv;
    o["flags"] = batch[i].flags;
    o["alert"] = batch[i].alert;
    if (measureJson(doc) > kMaxPayloadBytes) {
      arr.remove(arr.size() - 1);
      break;
    }
    n++;
  }

  if (n == 0) return false;

  String payload;
  serializeJson(doc, payload);

  WiFiClientSecure tls;
  tls.setCACert(SERVER_ROOT_CA);
  HTTPClient http;
  http.setConnectTimeout((int32_t)timeout_ms);
  http.setTimeout((uint16_t)timeout_ms);
  if (!http.begin(tls, apiUrl(SERVER_PATH_UPLOAD))) {
    failure_counter++;
    Serial.println("[wifi] no se pudo inicializar HTTPS para subir el lote");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_API_TOKEN);
  const int code = http.POST(payload);
  String response = (code > 0) ? http.getString() : String();
  http.end();

  if (code < 200 || code >= 300) {
    failure_counter++;
    Serial.printf("[wifi] envio fallo (HTTP %d), se conservan %u lecturas\n",
                  code, (unsigned)Store::count());
    return false;
  }

  JsonDocument ack_doc;
  if (deserializeJson(ack_doc, response)) {
    failure_counter++;
    Serial.printf("[wifi] respuesta sin confirmacion legible (HTTP %d), se conservan %u lecturas\n",
                  code, (unsigned)Store::count());
    return false;
  }

  JsonObject ack = ack_doc.as<JsonObject>();
  if (ack.isNull() || !ack["ack_through"].is<uint32_t>()) {
    failure_counter++;
    Serial.printf("[wifi] servidor no confirmo secuencias (HTTP %d), se conservan %u lecturas\n",
                  code, (unsigned)Store::count());
    return false;
  }

  const uint32_t acked_through = ack["ack_through"].as<uint32_t>();
  if (acked_through != batch[n - 1].sequence) {
    failure_counter++;
    Serial.printf("[wifi] confirmacion inesperada (%lu; esperado %lu), se conservan las lecturas\n",
                  (unsigned long)acked_through, (unsigned long)batch[n - 1].sequence);
    return false;
  }
  const uint32_t removed = Store::acknowledgeThrough(acked_through);

  Serial.printf("[wifi] lote %u lecturas, confirmadas hasta seq %lu, liberadas %lu, pendientes %u\n",
                (unsigned)n, (unsigned long)acked_through, (unsigned long)removed,
                (unsigned)Store::count());
  return removed > 0;
}

bool fetchConfig(uint32_t timeout_ms) {
  if (!isConnected()) return false;
  if (!apiConfigured()) {
    Serial.println("[wifi] falta identidad, URL HTTPS, token o certificado raiz real de la API");
    return false;
  }

  WiFiClientSecure tls;
  tls.setCACert(SERVER_ROOT_CA);
  HTTPClient http;
  http.setConnectTimeout((int32_t)timeout_ms);
  http.setTimeout((uint16_t)timeout_ms);
  if (!http.begin(tls, apiUrl(SERVER_PATH_CONFIG))) {
    failure_counter++;
    Serial.println("[wifi] no se pudo inicializar HTTPS para consultar la configuracion");
    return false;
  }
  http.addHeader("Authorization", String("Bearer ") + DEVICE_API_TOKEN);

  int code = http.GET();
  if (code != 200) {
    http.end();
    failure_counter++;
    Serial.printf("[wifi] config no disponible (HTTP %d)\n", code);
    return false;
  }

  String body = http.getString();
  http.end();

  bool ok = ConfigStore::applyServerJson(body.c_str(), body.length());
  if (ok) {
    Serial.println("[wifi] configuracion remota aplicada");
  } else {
    failure_counter++;
    Serial.println("[wifi] configuracion remota rechazada (validacion)");
  }
  return ok;
}

uint32_t failures() {
  return failure_counter;
}

}  // namespace WiFiSync
