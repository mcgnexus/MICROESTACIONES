import re
import json
import ssl
import urllib.request

SECRETS = r"C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware\tecrural_station\src\secrets.h"
BASE = "https://tecrural-microestacion.vercel.app"

content = open(SECRETS, encoding="utf-8").read()
token = re.search(r'#define DEVICE_API_TOKEN "([^"]+)"', content).group(1)
print("token_present=", len(token) >= 32)

ctx = ssl.create_default_context()

def get(path, auth=False):
    req = urllib.request.Request(BASE + path)
    if auth:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, str(e)

status, body = get("/health")
print("health=", status, body[:200])

status, body = get("/api/config", auth=True)
print("config=", status, body[:400])
