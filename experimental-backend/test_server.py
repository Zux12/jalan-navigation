"""Credential-free tests for the isolated Jalan diagnostic API."""
import importlib.util
import json
import socket
import sys
import threading
import types
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

# The module imports PyMongo, but these tests use a fake collection and
# deliberately never contact MongoDB or require secrets.
sys.modules.setdefault("pymongo", types.SimpleNamespace(MongoClient=object))
spec = importlib.util.spec_from_file_location("jalan_diagnostic_server", Path(__file__).with_name("server.py"))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

class FakeCollection:
    def __init__(self):
        self.documents = []
    def insert_one(self, doc):
        self.documents.append(dict(doc))

class TestValidation(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(api.validate({"experiment_id": "test-1", "reached": True})["experiment_id"], "test-1")
    def test_rejects_invalid(self):
        bad = [
            {}, {"experiment_id": ""}, {"experiment_id": "x", "latitude": 3.1},
            {"experiment_id": "x", "start_node": True},
            {"experiment_id": "x", "start_node": -1},
            {"experiment_id": "x", "snap_distance_m": -2},
            {"experiment_id": "x", "snap_distance_m": float("nan")},
            {"experiment_id": "x", "route_minutes": float("inf")},
            {"experiment_id": "x", "reached": "true"},
            {"experiment_id": "x", "notes": "x" * 301},
        ]
        for value in bad:
            with self.subTest(value=str(value)[:80]), self.assertRaises(ValueError):
                api.validate(value)

class TestHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
        cls.server.secret = "s" * 40
        cls.server.collection = FakeCollection()
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def request(self, path, body=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = Request(self.base + path, data=body, headers=headers, method="POST" if body is not None else "GET")
        try:
            with urlopen(req, timeout=3) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_health(self):
        status, payload = self.request("/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")

    def test_unauthorized(self):
        status, _ = self.request("/internal/diagnostics", b'{"experiment_id":"test"}')
        self.assertEqual(status, 401)

    def test_invalid(self):
        status, _ = self.request("/internal/diagnostics", b'{"experiment_id":"x","latitude":3.1}', "s" * 40)
        self.assertEqual(status, 400)

    def test_valid_write_to_fake_collection(self):
        before = len(self.server.collection.documents)
        status, payload = self.request("/internal/diagnostics", b'{"experiment_id":"unit-test","start_node":134009,"reached":true}', "s" * 40)
        self.assertEqual(status, 201)
        self.assertTrue(payload["stored"])
        self.assertEqual(len(self.server.collection.documents), before + 1)
        self.assertEqual(self.server.collection.documents[-1]["start_node"], 134009)

if __name__ == "__main__":
    unittest.main(verbosity=2)
