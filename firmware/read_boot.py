import serial, time, sys

port = sys.argv[1] if len(sys.argv) > 1 else 'COM9'
ser = serial.Serial()
ser.port = port
ser.baudrate = 115200
ser.dtr = False
ser.rts = False
ser.open()
time.sleep(0.3)
ser.dtr = True
time.sleep(0.1)
# reset en soft via RTS/DTR del USB-JTAG (esptool-style: rts toggles EN)
ser.rts = True
time.sleep(0.1)
ser.rts = False
ser.dtr = False
end = time.time() + 25
buf = b''
while time.time() < end:
    chunk = ser.read(512)
    if chunk:
        buf += chunk
        end = max(end, time.time() + 6)
try:
    print(buf.decode('utf-8', errors='replace'))
except Exception:
    print(buf)
ser.close()
