"""Execute Lua inside the running Tabletop Simulator and collect what it prints back.

Uses the External Editor API (https://api.tabletopsimulator.com/externaleditorapi/):
TTS listens on 127.0.0.1:39999 for {"messageID": 3, "guid": <guid>, "script": <lua>}
and sends print output (messageID 2), errors (3), custom messages (4) and return
values (5) to whatever listens on 127.0.0.1:39998. guid "-1" targets Global; any
other guid must already carry a script. Standard library only.
"""
import argparse
import json
import socket
import sys
import threading
import time

TTS_PORT = 39999
EDITOR_PORT = 39998


def listen(collected, stop, ready):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", EDITOR_PORT))
    srv.listen(8)
    srv.settimeout(0.2)
    ready.set()
    while not stop.is_set():
        try:
            conn, _ = srv.accept()
        except socket.timeout:
            continue
        with conn:
            buf = b""
            conn.settimeout(1.0)
            while True:
                try:
                    chunk = conn.recv(65536)
                except socket.timeout:
                    break
                if not chunk:
                    break
                buf += chunk
            try:
                collected.append(json.loads(buf.decode("utf-8")))
            except ValueError:
                collected.append({"raw": buf.decode("utf-8", "replace")})
    srv.close()


def execute(script, guid="-1", wait=2.0):
    collected, stop, ready = [], threading.Event(), threading.Event()
    t = threading.Thread(target=listen, args=(collected, stop, ready), daemon=True)
    t.start()
    ready.wait(2)
    with socket.create_connection(("127.0.0.1", TTS_PORT), timeout=3) as s:
        s.sendall(json.dumps({"messageID": 3, "guid": guid, "script": script}).encode("utf-8"))
    time.sleep(wait)
    stop.set()
    t.join(1)
    return collected


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", nargs="?", help="Lua source; '-' or omitted reads stdin")
    ap.add_argument("--guid", default="-1", help="object GUID to run in (default -1 = Global)")
    ap.add_argument("--wait", type=float, default=2.0, help="seconds to collect replies")
    args = ap.parse_args()
    src = sys.stdin.read() if args.script in (None, "-") else args.script
    msgs = execute(src, args.guid, args.wait)
    names = {2: "print", 3: "error", 4: "custom", 5: "return"}
    for m in msgs:
        kind = names.get(m.get("messageID"), str(m.get("messageID")))
        body = m.get("message") or m.get("error") or m.get("customMessage") or m.get("returnValue") or m.get("raw") or m
        print(f"[{kind}] {body}")
    if not msgs:
        print("(no reply within the wait window)")


if __name__ == "__main__":
    main()
