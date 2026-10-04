import serial, time

PORT = 'COM8'
BAUD = 115200
OUT = r'C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware\serial_check.txt'
DUR = 60

s = serial.Serial(PORT, BAUD, timeout=1)
# Reset via DTR/RTS to capture the boot from the start
s.setDTR(False)
s.setRTS(True)
time.sleep(0.1)
s.setRTS(False)
time.sleep(0.1)
s.setDTR(True)

start = time.time()
buf = bytearray()
while time.time() - start < DUR:
    chunk = s.read(4096)
    if chunk:
        buf += chunk
s.close()

with open(OUT, 'wb') as f:
    f.write(bytes(buf))
print('captured', len(buf), 'bytes ->', OUT)
