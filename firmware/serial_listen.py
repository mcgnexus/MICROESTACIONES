import serial, serial.tools.list_ports, time

OUT = r'C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware\serial_check.txt'
LOG = r'C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware\serial_listen.log'
BAUD = 115200
TOTAL = 1200  # cover several deep-sleep wake cycles


def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write('%s %s\n' % (time.strftime('%H:%M:%S'), msg))


def find_port():
    """Devuelve el COM del ESP32 (VID 0x303A) o None si duerme."""
    for p in serial.tools.list_ports.comports():
        hwid = (p.hwid or '').upper()
        if p.vid == 0x303A or 'VID:PID=303A' in hwid or '303A' in hwid:
            return p.device
    return None


def flush(buf):
    with open(OUT, 'wb') as f:
        f.write(bytes(buf))


open(LOG, 'w').close()
log('listener start (pyserial %s)' % serial.VERSION)

buf = bytearray()
sessions = 0
deadline = time.time() + TOTAL
last_state = None

while time.time() < deadline:
    port = find_port()
    if not port:
        if last_state != 'sleep':
            log('sin puerto ESP32 (chip durmiendo o USJ apagado)')
            last_state = 'sleep'
        time.sleep(0.5)
        continue
    if last_state != port:
        log('puerto detectado: %s' % port)
        last_state = port
    try:
        s = serial.Serial()
        s.port = port
        s.baudrate = BAUD
        s.timeout = 2
        s.dtr = False
        s.rts = False
        s.open()
        sessions += 1
        log('abierto %s (sesion %d)' % (port, sessions))
        time.sleep(2)  # deja asentar el arranque
        if time.time() >= deadline:
            s.close()
            break
        s.dtr = True
        log('DTR afirmado')
        while time.time() < deadline:
            chunk = s.read(4096)
            if chunk:
                buf += chunk
                flush(buf)
                log('leidos %d bytes' % len(chunk))
        s.close()
    except Exception as e:
        log('excepcion: %s: %s' % (type(e).__name__, e))
        time.sleep(0.5)

flush(buf)
log('fin: sesiones=%d capturados=%d bytes' % (sessions, len(buf)))
print('sessions=%d captured=%d bytes -> %s' % (sessions, len(buf), OUT), flush=True)
