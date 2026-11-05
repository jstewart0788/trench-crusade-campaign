"""Measure terrain assets' rest heights inside the running Tabletop Simulator.

For every catalog asset without a rest height (TC:Map-only), spawn it over a clear corner of
the table via the External Editor API (scripts/tts_exec.py), wait for physics to settle, record
its resting position and bounds, then destroy it. Rest height is stored relative to the surface
it settled on (surfaceTopY), which is what a generator needs on any table. Standard library only.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_exec import execute  # noqa: E402

SPOTS = [(50.0, -80.0), (62.0, -80.0), (74.0, -80.0), (86.0, -80.0)]
SPAWN_Y = 6.0
TAG = "tc-measure"


def spawn_state(asset, x, z):
    kind = asset["kind"]
    urls = asset["urls"]
    sx, sy, sz = asset["scale"]
    state = {
        "Name": kind,
        "Nickname": asset["nicknames"][0]["nickname"] if asset["nicknames"] else asset["id"],
        "Transform": {"posX": x, "posY": SPAWN_Y, "posZ": z, "rotX": 0, "rotY": 0, "rotZ": 0, "scaleX": sx, "scaleY": sy, "scaleZ": sz},
        "ColorDiffuse": {"r": asset["colorDiffuse"][0], "g": asset["colorDiffuse"][1], "b": asset["colorDiffuse"][2]},
        "Locked": False,
        "Tags": [TAG, "tc-measure:" + asset["id"]],
    }
    if kind == "Custom_Assetbundle":
        state["CustomAssetbundle"] = {"AssetbundleURL": urls["primary"], "AssetbundleSecondaryURL": urls.get("secondary") or "", "MaterialIndex": 0, "TypeIndex": 0, "LoopingEffectIndex": 0}
    elif kind in ("Custom_Model", "Custom_Model_Bag", "Custom_Model_Infinite_Bag"):
        state["Name"] = "Custom_Model"
        state["CustomMesh"] = {"MeshURL": urls["primary"], "DiffuseURL": urls.get("diffuse") or "", "NormalURL": urls.get("normal") or "", "ColliderURL": urls.get("collider") or "", "Convex": True, "MaterialIndex": 0, "TypeIndex": 0, "CastShadows": True}
    elif kind in ("Custom_Token", "Custom_Tile", "Custom_Board"):
        state["CustomImage"] = {"ImageURL": urls["primary"], "ImageSecondaryURL": "", "ImageScalar": 1.0, "WidthScale": 0.0}
    else:
        return None
    return state


def lua_spawn(states):
    return "local states = JSON.decode(%s)\nfor _, s in ipairs(states) do spawnObjectData({data = s}) end\nprint('spawned ' .. #states)" % json.dumps(json.dumps(states))


LUA_READ = """
local out = {}
for _, o in ipairs(getObjectsWithTag("%s")) do
  local b = o.getBounds()
  local id = nil
  for _, t in ipairs(o.getTags()) do if t:sub(1, 11) == "tc-measure:" then id = t:sub(12) end end
  local p = o.getPosition()
  table.insert(out, {id = id, resting = o.resting, y = p.y, x = p.x, z = p.z, size = {b.size.x, b.size.y, b.size.z}, center = {b.center.x, b.center.y, b.center.z}, loading = o.loading_custom})
end
print("MEASURE " .. JSON.encode(out))
""" % TAG

LUA_DESTROY = 'local n = 0 for _, o in ipairs(getObjectsWithTag("%s")) do o.destruct() n = n + 1 end print("destroyed " .. n)' % TAG

LUA_SURFACE = """
local best, top = nil, nil
for _, o in ipairs(getAllObjects()) do
  local b = o.getBounds()
  if b.size.x > 100 and b.size.z > 100 then best = o; top = b.center.y + b.size.y / 2 end
end
print("SURFACE " .. tostring(top))
"""


def prints(msgs, prefix):
    for m in msgs:
        if m.get("messageID") == 2 and str(m.get("message", "")).startswith(prefix):
            return str(m["message"])[len(prefix):]
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--catalog", default="data/tts/catalog.json")
    ap.add_argument("--out", default="data/tts/rest-heights-measured.json")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--settle", type=float, default=25.0, help="max seconds to wait for resting")
    args = ap.parse_args()

    catalog = json.load(open(args.catalog))
    todo = [a for a in catalog["assets"] if a.get("restHeight") is None and a.get("tcMapPosY")]
    if args.limit:
        todo = todo[: args.limit]
    surface = prints(execute(LUA_SURFACE, wait=2), "SURFACE ")
    surface_top = float(surface) if surface not in (None, "nil") else None
    print(f"surface top y = {surface_top}; measuring {len(todo)} assets in batches of {len(SPOTS)}", flush=True)
    execute(LUA_DESTROY, wait=1)

    results = {}
    for i in range(0, len(todo), len(SPOTS)):
        batch = todo[i : i + len(SPOTS)]
        states = []
        for asset, (x, z) in zip(batch, SPOTS):
            st = spawn_state(asset, x, z)
            if st is None:
                results[asset["id"]] = {"error": f"unsupported kind {asset['kind']}"}
            else:
                states.append(st)
        if states:
            execute(lua_spawn(states), wait=1.5)
            deadline = time.time() + args.settle
            last = []
            while time.time() < deadline:
                raw = prints(execute(LUA_READ, wait=1.5), "MEASURE ")
                last = json.loads(raw) if raw else []
                if last and len(last) >= len(states) and all(r["resting"] and not r.get("loading") for r in last):
                    break
            for r in last:
                results[r["id"]] = {
                    "restY": round(r["y"], 3),
                    "surfaceTopY": surface_top,
                    "restHeightAboveSurface": round(r["y"] - surface_top, 3) if surface_top is not None else None,
                    "boundsSize": [round(v, 3) for v in r["size"]],
                    "boundsCenterY": round(r["center"][1], 3),
                    "settled": bool(r["resting"]),
                    "loading": bool(r.get("loading")),
                }
            for asset in batch:
                if asset["id"] not in results:
                    results[asset["id"]] = {"error": "never appeared (spawn failed or asset did not load)"}
            execute(LUA_DESTROY, wait=1)
        done = min(i + len(SPOTS), len(todo))
        print(f"  {done}/{len(todo)} measured", flush=True)

    out = {
        "$schema": "tc-tts-rest-heights-v1",
        "measuredAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "method": "spawned in the running TTS via the External Editor API, read position/bounds after physics settled",
        "surfaceTopY": surface_top,
        "assets": dict(sorted(results.items())),
    }
    Path(args.out).write_text(json.dumps(out, indent=2) + "\n")
    ok = sum(1 for r in results.values() if "restY" in r and r["settled"])
    print(f"wrote {args.out}: {ok} settled, {len(results) - ok} problems", flush=True)


if __name__ == "__main__":
    main()
