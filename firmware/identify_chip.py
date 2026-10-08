import serial, time, sys

port = sys.argv[1] if len(sys.argv) > 1 else 'COM9'
ser = serial.Serial(port=None, timeout=1)
ser.port = port
ser.dtr = False
ser.rts = False
ser.open()
time.sleep(0.3)
ser.dtr = True  # HWCDC solo emite con DTR afirmado
ser.reset_input_buffer()
end = time.time() + 15
seen = b''
while time.time() < end:
    chunk = ser.read(512)
    if chunk:
        seen += chunk
        end = max(end, time.time() + 5)
try:
    print(seen.decode('utf-8', errors='replace'))
except Exception:
    print(seen)
ser.close()
