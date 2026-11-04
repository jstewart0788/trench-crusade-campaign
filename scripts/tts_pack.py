#!/usr/bin/env python3
"""Pack a source tree produced by tts_unpack.py back into one Tabletop Simulator save.

    python3 -I scripts/tts_pack.py <src_dir> <out.json> [--verify-against <original.json>]
                                                       [--allow-orphans]

Reads <src>/save.json, walks its objects in document order (same key derivation as the
unpacker) and fills LuaScript / XmlUI / LuaScriptState from scripts/<key>.lua,
ui/<key>.xml and state/<key>.json where those files exist. A file left over for an object
that no longer exists in save.json is an orphan and fails the build unless --allow-orphans
is given, so a stripped tree cannot silently carry stale scripts.

Standard library only, deterministic output.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tts_save  # noqa: E402


def pack(src_dir, allow_orphans=False):
    save = tts_save.load_save(os.path.join(src_dir, "save.json"))
    used = set()

    def fill(holder, key):
        for field, (sub, ext) in tts_save.FILE_FOR_FIELD.items():
            path = os.path.join(src_dir, sub, key + ext)
            if os.path.isfile(path):
                holder[field] = tts_save.read_text(path)
                used.add(os.path.join(sub, key + ext))
            elif field in holder and holder[field] not in ("", None):
                raise SystemExit("%s/%s.json carries a non-empty %s but no %s file exists" % (src_dir, "save", field, path))

    fill(save, tts_save.GLOBAL_KEY)
    for key, obj, _path, _via in tts_save.walk_objects(save):
        fill(obj, key)

    orphans = []
    for sub, ext in tts_save.FILE_FOR_FIELD.values():
        folder = os.path.join(src_dir, sub)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            rel = os.path.join(sub, name)
            if name.endswith(ext) and rel not in used:
                orphans.append(rel)
    if orphans:
        message = "orphan files with no matching object in save.json:\n  " + "\n  ".join(orphans)
        if allow_orphans:
            print("warning: " + message, file=sys.stderr)
        else:
            raise SystemExit(message)
    return save


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("src_dir", help="source tree written by tts_unpack.py")
    parser.add_argument("out", help="path of the packed save JSON to write")
    parser.add_argument("--verify-against", metavar="ORIGINAL", help="assert the packed save is JSON-equal to this file")
    parser.add_argument("--allow-orphans", action="store_true", help="warn instead of failing on leftover script files")
    args = parser.parse_args(argv)

    save = pack(args.src_dir, allow_orphans=args.allow_orphans)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    tts_save.dump_save(save, args.out)
    print("packed %s (%d bytes)" % (args.out, os.path.getsize(args.out)))

    if args.verify_against:
        if save == tts_save.load_save(args.verify_against):
            print("verify: JSON-equal to %s" % args.verify_against)
        else:
            print("verify: MISMATCH against %s" % args.verify_against, file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
