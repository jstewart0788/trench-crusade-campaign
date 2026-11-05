#!/usr/bin/env python3
"""Serve the warband fixtures the way the platform API will, so the mod's Warband
Importer can be exercised before the roster tool exists (ROADMAP TC-010 / TC-012).

    python3 -I scripts/tts_fixture_server.py [--host 127.0.0.1] [--port 3001] [--fixtures mod/fixtures]

GET /api/tts/warband/<code> answers with the fixture whose payload `code` matches
(NA-TEST-01 is mod/fixtures/warband-new-antioch.json); any other path or code is a JSON
404. Fixtures are re-read on every request so a regenerated file is served without a
restart. Standard library only.
"""

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

API_PREFIX = "/api/tts/warband/"


def load_fixtures(folder):
    by_code = {}
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(folder, name)
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        code = payload.get("code")
        if isinstance(code, str) and code:
            by_code[code] = payload
    return by_code


def make_handler(folder):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if not self.path.startswith(API_PREFIX):
                return self.reply(404, {"error": "not found", "hint": API_PREFIX + "<code>"})
            code = unquote(self.path[len(API_PREFIX):].split("?", 1)[0])
            fixtures = load_fixtures(folder)
            payload = fixtures.get(code)
            if payload is None:
                return self.reply(404, {"error": "unknown warband code", "code": code, "known": sorted(fixtures)})
            return self.reply(200, payload)

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))
            sys.stdout.flush()

    return Handler


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3001)
    parser.add_argument("--fixtures", default=os.path.join("mod", "fixtures"))
    args = parser.parse_args(argv)

    folder = os.path.abspath(args.fixtures)
    if not os.path.isdir(folder):
        print("fixtures folder not found: %s" % folder, file=sys.stderr)
        return 1
    codes = sorted(load_fixtures(folder))
    server = ThreadingHTTPServer((args.host, args.port), make_handler(folder))
    print("serving %s at http://%s:%d%s<code>  codes: %s" % (folder, args.host, args.port, API_PREFIX, ", ".join(codes) or "(none)"))
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
