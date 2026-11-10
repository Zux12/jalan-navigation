# Jalan experimental MongoDB diagnostics backend

Isolated development-branch prototype. **Not deployed, not connected to the live frontend, and not safe to expose publicly.**

- Atlas project: Cryptoloop
- Cluster: cryptoloop-cluster
- Database: `jalan_navigation`
- Collection: `routing_snap_diagnostics` (new; existing collections are untouched)
- Python dependency: PyMongo
- Local endpoints: `GET /health`, `POST /internal/diagnostics`
- POST requires server-side Bearer token; do not put this token or MongoDB URI into browser JavaScript.
- Local loopback only. No CORS headers or public browser endpoint.
- Only allowlisted diagnostic fields accepted; no raw GPS coordinates or user identifiers.
- Use a dedicated least-privilege MongoDB database user restricted to the required collection where supported; rotate credentials and enforce TLS.
- Rate limiting, identity management, monitoring, automated tests, production hosting, privacy review, and route-safety checks are outstanding.
- The local graph and SQLite spatial index remain on the Mac and have not been transferred.

To test later: create a local virtual environment, install `requirements.txt`, set secrets as environment variables outside GitHub, then run `python server.py`. Do not deploy this service to a public host in its current form.
