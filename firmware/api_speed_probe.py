import re
import ssl
import time
import urllib.request
import urllib.error

SECRETS = r"C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware\tecrural_station\src\secrets.h"
txt = open(SECRETS, encoding="utf-8", errors="ignore").read()


def get(name):
    m = re.search(r'#define\s+' + name + r'\s+"([^"]*)"', txt)
    return m.group(1) if m else None


base = get("API_BASE_URL")
token = get("DEVICE_API_TOKEN")
dev = get("DEVICE_ID")
print("base:", base, "| dev:", dev, "| token len:", len(token or ""))


def timed(req, label):
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read(300).decode("utf-8", "replace")
            print(f"{label}: HTTP {r.status} in {time.time()-t0:.2f}s body={body[:180]}")
    except urllib.error.HTTPError as e:
        print(f"{label}: HTTP {e.code} in {time.time()-t0:.2f}s body={e.read(300).decode('utf-8','replace')[:180]}")
    except Exception as e:
        print(f"{label}: ERROR in {time.time()-t0:.2f}s {e!r}")


timed(urllib.request.Request(base + "/api/config", headers={"Authorization": "Bearer " + token}), "GET /api/config")
timed(urllib.request.Request(base + "/health"), "GET /health")
timed(urllib.request.Request(base + "/api/measurements", method="OPTIONS"), "OPTIONS /api/measurements")
