import sys
import time

import serial

ser = serial.Serial()
ser.port = "COM9"
ser.dtr = False
ser.rts = False
ser.timeout = 1
try:
    ser.open()
except Exception as exc:  # noqa: BLE001
    print("no se pudo abrir:", exc)
    sys.exit(1)
time.sleep(0.3)
try:
    ser.dtr = True
except Exception as exc:  # noqa: BLE001
    print("dtr:", exc)

end = time.time() + 12
data = b""
while time.time() < end:
    try:
        chunk = ser.read(4096)
    except Exception as exc:  # noqa: BLE001
        print("\nEXC:", exc)
        break
    if chunk:
        data += chunk
        sys.stdout.write(chunk.decode("utf-8", "replace"))
        sys.stdout.flush()
try:
    ser.close()
except Exception:  # noqa: BLE001
    pass
print("\n--- bytes leidos:", len(data))
