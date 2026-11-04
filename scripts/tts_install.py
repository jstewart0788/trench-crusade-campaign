#!/usr/bin/env python3
"""Copy the packed mod into the local Tabletop Simulator Saves folder.

    python3 -I scripts/tts_install.py [--src mod/build/trench-crusade.json]
                                      [--dest "~/Library/Tabletop Simulator/Saves/TrenchCrusade-dev.json"]

TTS lists every *.json in its Saves folder under Games > Save & Load; the copy is a plain
file copy so the build stays the single source. Standard library only.
"""

import argparse
import os
import shutil
import sys

DEFAULT_SRC = os.path.join("mod", "build", "trench-crusade.json")
DEFAULT_DEST = os.path.join("~", "Library", "Tabletop Simulator", "Saves", "TrenchCrusade-dev.json")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", default=DEFAULT_SRC)
    parser.add_argument("--dest", default=DEFAULT_DEST)
    args = parser.parse_args(argv)

    src = os.path.abspath(args.src)
    dest = os.path.abspath(os.path.expanduser(args.dest))
    if not os.path.isfile(src):
        print("build not found: %s (run `pnpm mod:build` first)" % src, file=sys.stderr)
        return 1
    dest_dir = os.path.dirname(dest)
    if not os.path.isdir(dest_dir):
        print("Tabletop Simulator Saves folder not found: %s" % dest_dir, file=sys.stderr)
        return 1
    shutil.copyfile(src, dest)
    print("installed %s -> %s (%d bytes)" % (src, dest, os.path.getsize(dest)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
