#!/usr/bin/env python3
"""Syntax-check every Lua script in the mod with `luac -p` and scan it for known malware.

    python3 -I scripts/tts_lint.py mod/scripts [more dirs, .lua files or save .json files...]

TTS runs MoonSharp, which accepts `!=` where PUC Lua only takes `~=`. The LCT scripts
listed in MOONSHARP_ONLY still use `!=`; each is allowed to fail luac on a line that
contains `!=` and nothing else, so the allowance cannot hide a different error. Every
other file must parse. Standard library only; needs `luac` on PATH.

Every .lua file, and every LuaScript in a save .json passed on the command line (Global
and every object, nested ones included), is also scanned for the self-replicating
"tcejbo gninwapS" TTS virus (its markers in MALWARE_MARKERS) and for a WebRequest that
can reach a host other than API_HOSTS: a literal URL argument must name an allowed host,
and a script whose WebRequest takes a computed URL may only quote URLs on API_HOSTS or
Steam's asset CDN (ASSET_HOSTS).
"""

import json
import os
import re
import shutil
import subprocess
import sys

MOONSHARP_ONLY = {
    "839fcc.lua": "Red/Blue Custom Dice Table, blue copy (LCT)",
    "acae21.lua": "Red/Blue Custom Dice Table, red copy (LCT)",
}

ERROR_LINE = re.compile(r":(\d+):")

MALWARE_MARKERS = ("tcejbo gninwapS", "--[[Object base code]]")
API_HOSTS = {"tc.rynfin.org"}
# Steam's asset CDN: models and images the importer spawns, never a request target.
ASSET_HOSTS = {"steamusercontent-a.akamaihd.net", "steamuserimages-a.akamaihd.net", "cloud-3.steamusercontent.com"}
WEB_REQUEST = re.compile(r"WebRequest\s*\.\s*\w+\s*\(\s*([^,)]*)")
QUOTED_URL = re.compile(r"[\"']\s*https?://([^/\"'\s:]+)")


def lua_files(paths):
    for path in paths:
        if os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                if name.endswith(".lua"):
                    yield os.path.join(path, name)
        elif path.endswith(".lua"):
            yield path


def save_scripts(path):
    """Yield (label, LuaScript) for Global and every object in a TTS save file."""
    with open(path, "r", encoding="utf-8", errors="surrogatepass") as fh:
        save = json.load(fh)

    def walk(objs, trail):
        for obj in objs or []:
            label = "%s/%s" % (trail, obj.get("GUID", "?"))
            yield label, obj.get("LuaScript") or ""
            yield from walk(obj.get("ContainedObjects"), label)
            yield from walk(obj.get("ChildObjects"), label)
            for state in (obj.get("States") or {}).values():
                yield from walk([state], label)

    yield path + ":Global", save.get("LuaScript") or ""
    yield from walk(save.get("ObjectStates"), path)


def malware_findings(text):
    found = ["contains %r" % m for m in MALWARE_MARKERS if m in text]
    calls = WEB_REQUEST.findall(text)
    for arg in calls:
        host = QUOTED_URL.match(arg.strip())
        if host and host.group(1).lower() not in API_HOSTS:
            found.append("WebRequest to %s" % host.group(1))
    if any(not QUOTED_URL.match(arg.strip()) for arg in calls):
        for host in QUOTED_URL.findall(text):
            if host.lower() not in API_HOSTS | ASSET_HOSTS:
                found.append("computed WebRequest URL in a script that quotes %s" % host)
    return found


def scan_malware(argv):
    sources = []
    for path in argv:
        if path.endswith(".json") and os.path.isfile(path):
            sources.extend(save_scripts(path))
    for path in lua_files(argv):
        with open(path, "r", encoding="utf-8", errors="surrogatepass") as fh:
            sources.append((path, fh.read()))
    bad = 0
    for label, text in sources:
        for finding in malware_findings(text):
            print("MALWARE CHECK: %s %s" % (label, finding))
            bad += 1
    print("malware scan: %d scripts, %d finding(s)" % (len(sources), bad))
    return bad


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    luac = shutil.which("luac")
    if not luac:
        print("luac not found on PATH (brew install lua)", file=sys.stderr)
        return 2

    ok = allowed = failed = 0
    seen_allowances = set()
    for path in lua_files(argv):
        result = subprocess.run([luac, "-p", path], capture_output=True, text=True)
        name = os.path.basename(path)
        if result.returncode == 0:
            ok += 1
            if name in MOONSHARP_ONLY:
                print("note: %s parses now; drop it from MOONSHARP_ONLY" % path)
            continue
        message = result.stderr.strip()
        if name in MOONSHARP_ONLY:
            seen_allowances.add(name)
            match = ERROR_LINE.search(message)
            line_no = int(match.group(1)) if match else 0
            with open(path, "r", encoding="utf-8", errors="surrogatepass") as fh:
                lines = fh.read().split("\n")
            offending = lines[line_no - 1] if 0 < line_no <= len(lines) else ""
            if "!=" in offending:
                allowed += 1
                continue
            print("%s: allowed only for `!=`, but luac stopped elsewhere:\n  %s" % (path, message))
            failed += 1
            continue
        print(message)
        failed += 1

    for name in sorted(set(MOONSHARP_ONLY) - seen_allowances):
        print("note: %s was not checked (missing or already parses)" % name)

    print("luac -p: %d ok, %d allowed (!=), %d failed" % (ok, allowed, failed))
    flagged = scan_malware(argv)
    return 1 if failed or flagged else 0


if __name__ == "__main__":
    sys.exit(main())
