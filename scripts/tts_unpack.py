#!/usr/bin/env python3
"""Unpack a Tabletop Simulator save into an editable source tree.

    python3 -I scripts/tts_unpack.py <save.json> <out_dir> [--verify]

Writes:
  <out>/save.json          the save with every LuaScript / XmlUI / LuaScriptState string
                           blanked to "" (all other fields and object order untouched)
  <out>/scripts/global.lua, <out>/ui/global.xml, <out>/state/global.json
  <out>/scripts/<key>.lua, <out>/ui/<key>.xml, <out>/state/<key>.json  per object that has
                           a non-empty value (nested objects included; key = GUID, or
                           GUID.2, GUID.3 ... for repeated GUIDs in document order)
  <out>/manifest.json      one entry per object: key, GUID, nickname, kind, nesting path,
                           byte sizes of each extracted file

--verify re-packs the tree in memory straight after unpacking and asserts the result is
JSON-equal to the input; exits non-zero on any difference.

Standard library only, deterministic output.
"""

import argparse
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tts_save  # noqa: E402
import tts_pack  # noqa: E402


def unpack(save, out_dir):
    for sub in ("scripts", "ui", "state"):
        os.makedirs(os.path.join(out_dir, sub), exist_ok=True)

    manifest = {"global": {}, "objects": []}

    def extract(holder, key):
        sizes = {}
        for field, (sub, ext) in tts_save.FILE_FOR_FIELD.items():
            if field not in holder:
                continue
            value = holder[field]
            if not isinstance(value, str):
                raise SystemExit("%s on %s is not a string" % (field, key))
            if value:
                tts_save.write_text(os.path.join(out_dir, sub, key + ext), value)
                sizes[field] = len(value.encode("utf-8", "surrogatepass"))
            holder[field] = ""
        return sizes

    manifest["global"] = extract(save, tts_save.GLOBAL_KEY)

    for key, obj, path, via in tts_save.walk_objects(save):
        sizes = extract(obj, key)
        contained = obj.get("ContainedObjects") or []
        states = obj.get("States") or {}
        children = obj.get("ChildObjects") or []
        manifest["objects"].append({
            "key": key,
            "guid": obj.get("GUID", ""),
            "nickname": obj.get("Nickname", ""),
            "name": obj.get("Name", ""),
            "path": path,
            "via": via,
            "lua_bytes": sizes.get("LuaScript", 0),
            "xml_bytes": sizes.get("XmlUI", 0),
            "state_bytes": sizes.get("LuaScriptState", 0),
            "nested": len(contained) + len(states) + len(children),
        })

    tts_save.dump_save(save, os.path.join(out_dir, "save.json"))
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8", newline="\n") as fh:
        import json
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("save", help="TTS save JSON to unpack")
    parser.add_argument("out_dir", help="directory to write the source tree into (created; scripts/ ui/ state/ are cleared)")
    parser.add_argument("--verify", action="store_true", help="re-pack and assert JSON equality with the input")
    args = parser.parse_args(argv)

    original = tts_save.load_save(args.save)
    working = tts_save.load_save(args.save)

    for sub in ("scripts", "ui", "state"):
        shutil.rmtree(os.path.join(args.out_dir, sub), ignore_errors=True)
    os.makedirs(args.out_dir, exist_ok=True)

    manifest = unpack(working, args.out_dir)
    scripted = sum(1 for o in manifest["objects"] if o["lua_bytes"] or o["xml_bytes"] or o["state_bytes"])
    print("unpacked %d objects (%d with script/ui/state) to %s" % (len(manifest["objects"]), scripted, args.out_dir))

    if args.verify:
        repacked = tts_pack.pack(args.out_dir)
        if repacked == original:
            print("verify: round-trip is JSON-equal to %s" % args.save)
        else:
            print("verify: MISMATCH after round-trip", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
