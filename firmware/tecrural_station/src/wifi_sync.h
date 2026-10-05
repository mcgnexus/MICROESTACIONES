#pragma once

#include <Arduino.h>
#include "measurement.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#define DEVICE_ID ""
#define API_BASE_URL ""
#define DEVICE_API_TOKEN ""
#endif
#define SERVER_PATH_UPLOAD "/api/measurements"
#define SERVER_PATH_CONFIG "/api/config"
#define SYNC_BATCH_SIZE 4

namespace WiFiSync {

void begin();
bool connect(uint32_t timeout_ms);
void disconnect();
bool isConnected();
bool uploadBatch(uint32_t timeout_ms);
bool fetchConfig(uint32_t timeout_ms);
uint32_t failures();
int lastUploadStatus();

}  // namespace WiFiSync
