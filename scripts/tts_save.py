"""Shared walker for Tabletop Simulator save files.

A TTS save is one JSON document: global fields (LuaScript, XmlUI, LuaScriptState) plus an
ObjectStates tree. Objects nest three ways: ContainedObjects (bags, decks), States
(alternate states of one object, keyed "1", "2", ...) and ChildObjects (attached objects).
Every object gets a stable key derived from its GUID in document order; TTS allows the same
GUID to appear more than once inside containers, so repeats get a ".2", ".3" suffix.

Standard library only. Both tts_unpack.py and tts_pack.py import this file by explicit path
so they stay usable under `python3 -I`.
"""

import json

SCRIPT_FIELDS = ("LuaScript", "XmlUI", "LuaScriptState")

FILE_FOR_FIELD = {
    "LuaScript": ("scripts", ".lua"),
    "XmlUI": ("ui", ".xml"),
    "LuaScriptState": ("state", ".json"),
}

GLOBAL_KEY = "global"


def load_save(path):
    with open(path, "r", encoding="utf-8", errors="surrogatepass") as fh:
        return json.load(fh)


def dump_save(save, path):
    with open(path, "w", encoding="utf-8", errors="surrogatepass", newline="\n") as fh:
        json.dump(save, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def walk_objects(save):
    """Yield (key, obj, path, via) for every object in document order.

    `path` is the list of ancestor keys from the top level down; `via` names the edge from
    the parent ("top", "contained", "state:<n>", "child").
    """
    seen = {}

    def key_for(obj):
        guid = obj.get("GUID") or "noguid"
        n = seen.get(guid, 0) + 1
        seen[guid] = n
        return guid if n == 1 else "%s.%d" % (guid, n)

    def visit(obj, path, via):
        key = key_for(obj)
        yield key, obj, path, via
        child_path = path + [key]
        for child in obj.get("ContainedObjects") or []:
            yield from visit(child, child_path, "contained")
        for state_id, child in (obj.get("States") or {}).items():
            yield from visit(child, child_path, "state:%s" % state_id)
        for child in obj.get("ChildObjects") or []:
            yield from visit(child, child_path, "child")

    for top in save.get("ObjectStates") or []:
        yield from visit(top, [], "top")


def read_text(path):
    with open(path, "r", encoding="utf-8", errors="surrogatepass", newline="") as fh:
        return fh.read()


def write_text(path, text):
    with open(path, "w", encoding="utf-8", errors="surrogatepass", newline="") as fh:
        fh.write(text)
