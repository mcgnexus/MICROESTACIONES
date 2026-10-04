import socket
import ssl
import http.client

HOST = "tecrural-microestacion.vercel.app"

print("=== TLS 443 ===")
try:
    ctx = ssl.create_default_context()
    with socket.create_connection((HOST, 443), timeout=12) as sock:
        with ctx.wrap_socket(sock, server_hostname=HOST) as ss:
            print("version :", ss.version())
            print("cipher  :", ss.cipher()[0])
            cert = ss.getpeercert()
            print("issuer  :", dict(x[0] for x in cert.get("issuer", [])))
            print("subject :", dict(x[0] for x in cert.get("subject", [])))
            print("notBefore:", cert.get("notBefore"))
            print("notAfter :", cert.get("notAfter"))
            print("SAN     :", cert.get("subjectAltName"))
except Exception as e:
    print("ERROR TLS:", repr(e))

print("=== HTTP 80 (Date header) ===")
try:
    c = http.client.HTTPConnection(HOST, 80, timeout=12)
    c.request("GET", "/health")
    r = c.getresponse()
    print("status  :", r.status)
    print("Date    :", r.getheader("Date"))
    print("Location:", r.getheader("Location"))
    print("Server  :", r.getheader("Server"))
except Exception as e:
    print("ERROR HTTP:", repr(e))
