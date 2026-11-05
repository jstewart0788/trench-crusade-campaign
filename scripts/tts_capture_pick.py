"""Capture models from the running TTS as loadout picks in data/tts/model-picks.json.

Usage: python3 -I scripts/tts_capture_pick.py GUID UNIT_ID [ITEM_ID ...] [--note TEXT]
Reads the object's data through the External Editor API (scripts/tts_exec.py), flattens nested
ChildObjects into one list of parts relative to the base (some sculpts nest the figure under a
plinth, and the importer spawns one level of children), and adds or replaces the pick for
(UNIT_ID, ITEM_IDs). Composition assumes children rotate about Y only and that each parent's
X and Z scales are equal, which holds for the sculpts captured so far; anything else is refused.
"""
import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_exec import execute  # noqa: E402

PICKS = Path("data/tts/model-picks.json")


def read_object(guid):
    lua = 'local o = getObjectFromGUID("%s") if o then print("DATA " .. JSON.encode(o.getData())) else print("DATA null") end' % guid
    for m in execute(lua, wait=3):
        if m.get("messageID") == 2 and str(m.get("message", "")).startswith("DATA "):
            return json.loads(m["message"][5:])
    raise SystemExit("no reply from TTS (is the game open?)")


def flatten(children, origin=(0.0, 0.0, 0.0), yaw=0.0, scale=(1.0, 1.0, 1.0)):
    parts = []
    for ch in children or []:
        t = ch["Transform"]
        if abs(t["rotX"]) > 1 or abs(t["rotZ"]) > 1 or abs(scale[0] - scale[2]) > 1e-3:
            raise SystemExit(f"child {ch.get('GUID')} tilts or sits under a non-uniform XZ scale; capture by hand")
        lx, ly, lz = t["posX"] * scale[0], t["posY"] * scale[1], t["posZ"] * scale[2]
        a = math.radians(yaw)
        px = origin[0] + lx * math.cos(a) + lz * math.sin(a)
        pz = origin[2] - lx * math.sin(a) + lz * math.cos(a)
        py = origin[1] + ly
        ryaw = (yaw + t["rotY"]) % 360
        sc = (scale[0] * t["scaleX"], scale[1] * t["scaleY"], scale[2] * t["scaleZ"])
        cm, ab = ch.get("CustomMesh"), ch.get("CustomAssetbundle")
        if ch["Name"] in ("Custom_Model", "Custom_Assetbundle") and (cm or ab):
            parts.append({
                "kind": ch["Name"],
                "meshUrl": cm["MeshURL"] if cm else None,
                "diffuseUrl": (cm.get("DiffuseURL") or None) if cm else None,
                "colliderUrl": (cm.get("ColliderURL") or None) if cm else None,
                "assetBundleUrl": ab["AssetbundleURL"] if ab else None,
                "position": [round(px, 4) + 0.0, round(py, 4) + 0.0, round(pz, 4) + 0.0],
                "rotation": [0.0, round(ryaw, 4) + 0.0, 0.0],
                "scale": [round(v, 4) + 0.0 for v in sc],
            })
        parts += flatten(ch.get("ChildObjects"), (px, py, pz), ryaw, sc)
    return parts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("guid")
    ap.add_argument("unit_id")
    ap.add_argument("item_ids", nargs="*")
    ap.add_argument("--note", default="")
    ap.add_argument("--mod-id", default="3700111403")
    a = ap.parse_args()
    d = read_object(a.guid)
    if d is None:
        raise SystemExit(f"no object {a.guid} on the table")
    base, t = d["CustomMesh"], d["Transform"]
    model = {
        "modId": a.mod_id, "guid": a.guid, "nickname": d.get("Nickname", ""),
        "meshUrl": base["MeshURL"], "diffuseUrl": base.get("DiffuseURL") or None, "colliderUrl": base.get("ColliderURL") or None,
        "scale": [round(t["scaleX"], 4) + 0.0, round(t["scaleY"], 4) + 0.0, round(t["scaleZ"], 4) + 0.0],
        "parts": flatten(d.get("ChildObjects")),
    }
    doc = json.loads(PICKS.read_text()) if PICKS.exists() else {"$schema": "tc-tts-model-picks-v1", "picks": []}
    key = (a.unit_id, tuple(sorted(a.item_ids)))
    doc["picks"] = [p for p in doc["picks"] if (p["unitId"], tuple(sorted(p["matchItemIds"]))) != key]
    doc["picks"].append({"unitId": a.unit_id, "matchItemIds": a.item_ids, "note": a.note, "model": model})
    doc["picks"].sort(key=lambda p: (p["unitId"], p["matchItemIds"]))
    PICKS.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"{a.unit_id} {a.item_ids or '(default)'} <- {a.guid} '{model['nickname']}' with {len(model['parts'])} part(s)")


if __name__ == "__main__":
    main()
