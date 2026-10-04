import json
import re
import time
import urllib.error
import urllib.request

SECRETS = r"C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware\tecrural_station\src\secrets.h"
txt = open(SECRETS, encoding="utf-8", errors="ignore").read()


def get(name):
    m = re.search(r'#define\s+' + name + r'\s+"([^"]*)"', txt)
    return m.group(1) if m else None


base = get("API_BASE_URL")
token = get("DEVICE_API_TOKEN")


def post(body, label):
    req = urllib.request.Request(
        base + "/api/measurements",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"{label}: HTTP {r.status} in {time.time()-t0:.2f}s {r.read(200).decode('utf-8','replace')[:160]}")
    except urllib.error.HTTPError as e:
        print(f"{label}: HTTP {e.code} in {time.time()-t0:.2f}s {e.read(200).decode('utf-8','replace')[:160]}")
    except Exception as e:
        print(f"{label}: ERROR in {time.time()-t0:.2f}s {e!r}")


# Array vacio: pasa requireDevice (consulta la BD) y falla en zod SIN escribir nada.
post([], "POST [] (auth BD, sin escribir)")
post([], "POST [] otra vez (caliente)")
