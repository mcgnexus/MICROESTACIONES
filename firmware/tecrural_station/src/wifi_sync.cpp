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
volatile uint8_t last_disconnect_reason = 0;

// Fallos de conexion consecutivos (sobrevive a los deep sleeps). Si el SSID no
// aparece durante muchos ciclos seguidos, el stack WiFi puede quedar en un
// estado del que solo sale reiniciando el chip por completo.
RTC_DATA_ATTR uint8_t consecutive_wifi_failures = 0;
constexpr uint8_t kMaxConsecutiveWifiFailures = 8;

void noteWifiFailure() {
  if (consecutive_wifi_failures < 255) ++consecutive_wifi_failures;
  if (consecutive_wifi_failures < kMaxConsecutiveWifiFailures) return;
  Serial.printf("[wifi] %u fallos consecutivos: reinicio completo del chip\n",
                (unsigned)consecutive_wifi_failures);
  delay(300);
  ESP.restart();
}
bool event_registered = false;

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    last_disconnect_reason = (uint8_t)info.wifi_sta_disconnected.reason;
  }
}

const char* disconnectReasonText(uint8_t r) {
  switch (r) {
    case 1:
    case 201:
      return "red no encontrada o fuera de rango (probable banda 5 GHz)";
    case 2:
    case 3:
    case 4:
      return "autenticacion/asociacion expirada (posible contrasena)";
    case 15:
    case 204:
      return "handshake agotado - CONTRASENA incorrecta";
    case 202:
      return "autenticacion fallida - CONTRASENA incorrecta";
    case 203:
      return "fallo de asociacion";
    case 205:
      return "fallo de conexion";
    default:
      return "desconocido";
  }
}

bool apiConfigured() {
  return strlen(DEVICE_ID) > 0 && strlen(API_BASE_URL) > 8 &&
         strncmp(API_BASE_URL, "https://", 8) == 0 &&
         strstr(API_BASE_URL, "your-api.example.com") == nullptr &&
         strlen(DEVICE_API_TOKEN) >= 32 &&
         strstr(DEVICE_API_TOKEN, "provision-a-unique-token-for-this-device") == nullptr;
}

String apiUrl(const char* path) {
  String base(API_BASE_URL);
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + path;
}

String apiHost() {
  String base(API_BASE_URL);
  int sep = base.indexOf("://");
  if (sep >= 0) base.remove(0, sep + 3);
  int slash = base.indexOf('/');
  if (slash >= 0) base.remove(slash);
  return base;
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

  if (!event_registered) {
    WiFi.onEvent(onWifiEvent);
    event_registered = true;
  }
  last_disconnect_reason = 0;
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  // El modem-sleep descarta respuestas DNS/NTP (paquetes durante el reposo):
  // la resolucion devolvia 0.0.0.0 y el NTP fallaba. Alimentado por USB, sin ahorro.
  WiFi.setSleep(false);

  // El punto de acceso suele ser un hotspot movil que desaparece al quedarse
  // inactivo. Si el SSID no esta en el aire no tiene sentido esperar el timeout
  // completo de asociacion: se listan las redes y se sale enseguida.
  const int visible = WiFi.scanNetworks();
  bool ssid_visible = false;
  Serial.printf("[wifi] %d redes visibles en 2.4 GHz\n", visible);
  for (int i = 0; i < visible; ++i) {
    Serial.printf("    SSID \"%s\" (%d dBm)%s\n", WiFi.SSID(i).c_str(),
                  (int)WiFi.RSSI(i),
                  WiFi.SSID(i) == WIFI_SSID ? "  <- COINCIDE con SSID configurado" : "");
    if (WiFi.SSID(i) == WIFI_SSID) ssid_visible = true;
  }
  WiFi.scanDelete();
  if (!ssid_visible) {
    failure_counter++;
    Serial.println("[wifi] SSID configurado no visible; no se intenta asociar");
    noteWifiFailure();
    return false;
  }

  // Causa clasica de "veo la red pero no asocio" en el ESP32-C3: potencia de
  // transmision por encima de lo que la antena soporta; el AP no llega a oir las
  // tramas de asociacion. Se reduce la potencia y se reintenta hasta 3 veces.
  WiFi.setTxPower(WIFI_POWER_8_5dBm);

  uint32_t start = millis();
  bool connected = false;
  for (int attempt = 0; attempt < 3 && !connected && millis() - start < timeout_ms; ++attempt) {
    if (attempt > 0) {
      WiFi.disconnect(false);
      delay(150);
    }
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED && millis() - start < timeout_ms) {
      delay(100);
    }
    connected = WiFi.status() == WL_CONNECTED;
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (consecutive_wifi_failures != 0) {
      Serial.printf("[wifi] recuperado tras %u intentos fallidos\n",
                    (unsigned)consecutive_wifi_failures);
    }
    consecutive_wifi_failures = 0;
    Serial.printf("[wifi] conectado en %lus, IP %s, gw %s, rssi %d\n",
                  (millis() - start) / 1000, WiFi.localIP().toString().c_str(),
                  WiFi.gatewayIP().toString().c_str(), (int)WiFi.RSSI());
    return true;
  }
  failure_counter++;
  Serial.printf("[wifi] fallo de conexion tras %lus (motivo %u: %s)\n",
                (millis() - start) / 1000, (unsigned)last_disconnect_reason,
                disconnectReasonText(last_disconnect_reason));
  noteWifiFailure();
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

  const String host = apiHost();
  IPAddress resolved;
  bool dns_ok = false;
  for (int attempt = 1; attempt <= 3 && !dns_ok; ++attempt) {
    if (WiFi.hostByName(host.c_str(), resolved) && resolved != IPAddress(0, 0, 0, 0)) {
      dns_ok = true;
      Serial.printf("[wifi] DNS %s -> %s (intento %d)\n", host.c_str(),
                    resolved.toString().c_str(), attempt);
    } else {
      Serial.printf("[wifi] DNS fallo intento %d para %s\n", attempt, host.c_str());
      delay(1000);
    }
  }

  WiFiClientSecure tls;
  tls.useBuiltinCACertBundle();
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
  Serial.printf("[wifi] subida: %u lecturas, %u bytes\n", n, (unsigned)payload.length());
  const uint32_t post_started = millis();
  const int code = http.POST(payload);
  const uint32_t post_ms = millis() - post_started;
  String response = (code > 0) ? http.getString() : String();
  char tls_msg[160] = {};
  const int tls_err = tls.lastError(tls_msg, sizeof(tls_msg));
  http.end();

  if (code < 200 || code >= 300) {
    failure_counter++;
    Serial.printf("[wifi] envio fallo (HTTP %d: %s) tras %lu ms, tls=%d (%s), se conservan %u lecturas\n",
                  code, http.errorToString(code).c_str(), (unsigned long)post_ms, tls_err, tls_msg,
                  (unsigned)Store::count());
    return false;
  }
  Serial.printf("[wifi] lote aceptado en %lu ms\n", (unsigned long)post_ms);

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
  tls.useBuiltinCACertBundle();
  HTTPClient http;
  http.setConnectTimeout((int32_t)timeout_ms);
  http.setTimeout((uint16_t)timeout_ms);
  if (!http.begin(tls, apiUrl(SERVER_PATH_CONFIG))) {
    failure_counter++;
    Serial.println("[wifi] no se pudo inicializar HTTPS para consultar la configuracion");
    return false;
  }
  http.collectAllHeaders();
  http.addHeader("Authorization", String("Bearer ") + DEVICE_API_TOKEN);

  int code = http.GET();
  if (code != 200) {
    http.end();
    failure_counter++;
    Serial.printf("[wifi] config no disponible (HTTP %d)\n", code);
    return false;
  }

  String body = http.getString();
  // Hora real del servidor (cabecera Date). Esta red bloquea NTP, asi que es la
  // unica fuente de tiempo fiable; corrige el reloj de respaldo de compilacion.
  const String server_date = http.header("Date");
  http.end();

  if (server_date.length() > 0 && TimeKeeper::setFromHttpDate(server_date.c_str())) {
    Serial.printf("[hora] hora del servidor aplicada: %lu\n",
                  (unsigned long)TimeKeeper::now());
  }

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
