"""Local-only diagnostic ingestion prototype. Not a public navigation API."""
import hmac
import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pymongo import MongoClient

DB = "jalan_navigation"
COLLECTION = "routing_snap_diagnostics"
MAX_BYTES = 8192
ALLOWED_KEYS = {"experiment_id", "start_node", "goal_node", "snap_distance_m",
                "route_minutes", "reached", "strategy", "notes"}

def validate(payload):
    if not isinstance(payload, dict) or not payload or set(payload) - ALLOWED_KEYS:
        raise ValueError("Unexpected fields")
    if not isinstance(payload.get("experiment_id"), str) or not 1 <= len(payload["experiment_id"]) <= 80:
        raise ValueError("Invalid experiment_id")
    for key in ("start_node", "goal_node"):
        if key in payload and (type(payload[key]) is not int or not 0 <= payload[key] < 6922512):
            raise ValueError("Invalid " + key)
    for key in ("snap_distance_m", "route_minutes"):
        if key in payload:
            value = payload[key]
            if type(value) not in (float, int) or not 0 <= value <= (2000 if key == "snap_distance_m" else 100000):
                raise ValueError("Invalid " + key)
    if "reached" in payload and type(payload["reached"]) is not bool:
        raise ValueError("Invalid reached")
    for key in ("strategy", "notes"):
        if key in payload and (not isinstance(payload[key], str) or len(payload[key]) > (80 if key == "strategy" else 300)):
            raise ValueError("Invalid " + key)
    return dict(payload)

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"status": "ok", "mode": "local_experimental"})
        self.reply(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/internal/diagnostics":
            return self.reply(404, {"error": "Not found"})
        supplied = self.headers.get("Authorization", "")
        expected = "Bearer " + self.server.secret
        if not hmac.compare_digest(supplied, expected):
            return self.reply(401, {"error": "Unauthorized"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_BYTES:
                return self.reply(413, {"error": "Invalid body size"})
            payload = json.loads(self.rfile.read(length))
            doc = validate(payload)
        except (ValueError, TypeError, UnicodeError, json.JSONDecodeError):
            return self.reply(400, {"error": "Invalid diagnostic payload"})
        doc["recorded_at"] = datetime.now(timezone.utc)
        try:
            self.server.collection.insert_one(doc)
        except Exception:
            self.log_error("Database insert failed")
            return self.reply(503, {"error": "Storage unavailable"})
        self.reply(201, {"stored": True})

def main():
    uri = os.environ.get("MONGODB_URI")
    secret = os.environ.get("JALAN_DIAGNOSTICS_TOKEN", "")
    host = os.environ.get("JALAN_BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("JALAN_BACKEND_PORT", "8787"))
    if not uri or len(secret) < 32:
        raise SystemExit("Set MONGODB_URI and a token of at least 32 characters")
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("Local-only prototype: non-loopback binding refused")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    server = ThreadingHTTPServer((host, port), Handler)
    server.secret = secret
    server.collection = client[DB][COLLECTION]
    print("Local diagnostic API listening on", host, port, flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        client.close()

if __name__ == "__main__":
    main()
