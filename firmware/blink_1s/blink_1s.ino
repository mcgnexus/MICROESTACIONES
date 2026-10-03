#define LED_PIN 8
#define LED_ON_MS 1000
#define LED_OFF_MS 1000

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("Firmware: LED parpadeo 1s");
  Serial.print("LED_PIN: GPIO");
  Serial.println(LED_PIN);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(LED_ON_MS);

  digitalWrite(LED_PIN, LOW);
  delay(LED_OFF_MS);
}