"""Raycast the collider profile of trench pieces inside the running Tabletop Simulator.

Spawns each asset Locked at rotY 0 over the clear measuring corner (scripts/tts_exec.py), casts rays
straight down on a 0.1in grid over its 4in cell and horizontally from the cell centre at three heights,
prints the result as JSON, then destroys everything tagged tc-measure. Used to find which wall of a
trench piece carries its fire-step ledge and where the inner wall faces sit (data/tts/VERTICALITY.md).
Standard library only.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_exec import execute  # noqa: E402
from tts_measure_rest import LUA_DESTROY, TAG, lua_spawn, prints, spawn_state  # noqa: E402

SURFACE = 0.900002598762512
SPOTS = [(46.0, -48.0), (62.0, -48.0), (78.0, -48.0), (46.0, -64.0), (62.0, -64.0), (78.0, -64.0)]

LUA_PROFILE = """
local target = nil
for _, o in ipairs(getObjectsWithTag("%(tag)s")) do for _, t in ipairs(o.getTags()) do if t == "tc-measure:%(id)s" then target = o end end end
if not target then print("PROFILE nil") return end
local function top(px, pz)
  local best = nil
  for _, h in ipairs(Physics.cast({origin = {px, %(surface)f + 8, pz}, direction = {0, -1, 0}, type = 1, max_distance = 12})) do
    if h.hit_object == target then local y = h.point.y if best == nil or y > best then best = y end end
  end
  return best
end
local function face(dx, dz, hy)
  for _, h in ipairs(Physics.cast({origin = {%(x)f, %(surface)f + hy, %(z)f}, direction = {dx, 0, dz}, type = 1, max_distance = 4})) do
    if h.hit_object == target then return h.distance end
  end
  return nil
end
local grid = {}
for i = -20, 20, 1 do local row = {} for j = -20, 20, 1 do local y = top(%(x)f + i * 0.1, %(z)f + j * 0.1) table.insert(row, y and math.floor((y - %(surface)f) * 100 + 0.5) / 100 or -1) end table.insert(grid, row) end
local faces = {}
for _, hy in ipairs({0.8, 1.4, 2.0}) do faces[tostring(hy)] = {E = face(1, 0, hy), W = face(-1, 0, hy), N = face(0, 1, hy), S = face(0, -1, hy)} end
local b = target.getBounds()
local p = target.getPosition()
print("PROFILE " .. JSON.encode({grid = grid, faces = faces, pos = {p.x, p.y, p.z}, bsize = {b.size.x, b.size.y, b.size.z}, bcenter = {b.center.x, b.center.y, b.center.z}}))
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--catalog", default="data/tts/catalog.json")
    ap.add_argument("--ids", required=True, help="comma-separated catalog ids (at most six)")
    ap.add_argument("--rest", type=float, default=1.5, help="pivot height above the surface to spawn at (1.5 for the trench family)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    catalog = {a["id"]: a for a in json.load(open(args.catalog))["assets"]}
    ids = args.ids.split(",")[: len(SPOTS)]
    states = []
    for aid, (x, z) in zip(ids, SPOTS):
        state = spawn_state(catalog[aid], x, z, y=SURFACE + args.rest)
        state["Locked"] = True
        states.append(state)
    execute(LUA_DESTROY, wait=1)
    execute(lua_spawn(states), wait=2)
    time.sleep(8)
    out = {}
    for aid, (x, z) in zip(ids, SPOTS):
        raw = prints(execute(LUA_PROFILE % {"tag": TAG, "id": aid, "surface": SURFACE, "x": x, "z": z}, wait=4), "PROFILE ")
        out[aid] = json.loads(raw) if raw and raw != "nil" else None
        print(aid, "profiled" if out[aid] else "missing", flush=True)
    execute(LUA_DESTROY, wait=1.5)
    Path(args.out).write_text(json.dumps(out) + "\n")


if __name__ == "__main__":
    main()
