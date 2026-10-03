#define LED_PIN 8

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("========================================");
  Serial.println("TECRURAL - Prueba ESP32-C3 OK");
  Serial.print("Chip: ");
  Serial.println(ESP.getChipModel());
  Serial.print("Cores: ");
  Serial.println(ESP.getChipCores());
  Serial.print("Frecuencia: ");
  Serial.print(ESP.getCpuFreqMHz());
  Serial.println(" MHz");
  Serial.print("Flash: ");
  Serial.print(ESP.getFlashChipSize() / (1024 * 1024));
  Serial.println(" MB");
  Serial.println("========================================");
}

void loop() {
  static uint32_t contador = 0;
  digitalWrite(LED_PIN, HIGH);
  Serial.print("LED ON  - ciclo ");
  Serial.println(contador);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  Serial.print("LED OFF - ciclo ");
  Serial.println(contador);
  delay(500);
  contador++;
}
