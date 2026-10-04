import serial

print("pyserial", serial.VERSION)
s = serial.Serial()
s.port = "COM9"
for attr in ("dtr", "rts"):
    try:
        setattr(s, attr, False)
        print("pre-open %s=False -> OK" % attr)
    except Exception as e:
        print("pre-open %s=False -> RAISED %s: %s" % (attr, type(e).__name__, e))
