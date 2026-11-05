#!/usr/bin/env python3
"""Syntax-check every Lua script in the mod with `luac -p`.

    python3 -I scripts/tts_lint.py mod/scripts [more dirs or files...]

TTS runs MoonSharp, which accepts `!=` where PUC Lua only takes `~=`. The LCT scripts
listed in MOONSHARP_ONLY still use `!=`; each is allowed to fail luac on a line that
contains `!=` and nothing else, so the allowance cannot hide a different error. Every
other file must parse. Standard library only; needs `luac` on PATH.
"""

import os
import re
import shutil
import subprocess
import sys

MOONSHARP_ONLY = {
    "738804.lua": "Start Menu (LCT)",
    "839fcc.lua": "Red/Blue Custom Dice Table, blue copy (LCT)",
    "acae21.lua": "Red/Blue Custom Dice Table, red copy (LCT)",
}

ERROR_LINE = re.compile(r":(\d+):")


def lua_files(paths):
    for path in paths:
        if os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                if name.endswith(".lua"):
                    yield os.path.join(path, name)
        elif path.endswith(".lua"):
            yield path


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
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
