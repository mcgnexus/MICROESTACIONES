import serial.tools.list_ports, time

end = time.time() + 480
seen = set()
print('probe start', flush=True)
while time.time() < end:
    for p in serial.tools.list_ports.comports():
        if p.device not in seen:
            seen.add(p.device)
            print('%s | vid=%s pid=%s | %s | %s' % (p.device, p.vid, p.pid, p.description, p.hwid), flush=True)
    time.sleep(1.5)
print('probe done', flush=True)
