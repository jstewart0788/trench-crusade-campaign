"""Lay candidate terrain assets out in the running Tabletop Simulator so they can be compared.

survey   spawn assets nine at a time in the clear battlefield square, measure and screenshot
         each into <out>/shots/<id>.png, destroy them; resumable via <out>/measured.json
sheets   build <out>/sheet-<n>.png contact sheets from the shots
present  lay chosen assets out in the battlefield square, largest first, with floating labels
clear    destroy everything this tool spawned

Moves the host camera during survey. Never save the game while its pieces are on the table. Uses scripts/tts_exec.py.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts_exec import execute  # noqa: E402
from tts_measure_rest import spawn_state  # noqa: E402

TAG = "tc-board"
REPO = Path(__file__).resolve().parent.parent


def lua(script, wait=2.0):
    return execute(script, wait=wait)


def printed(msgs, prefix):
    for m in msgs:
        if m.get("messageID") == 2 and str(m.get("message", "")).startswith(prefix):
            return str(m["message"])[len(prefix):]
    errs = [m for m in msgs if m.get("messageID") == 3]
    if errs:
        raise SystemExit(f"TTS error: {errs[0]}")
    return None


def load_assets(ids):
    by_id = {a["id"]: a for a in json.load(open(REPO / "data/tts/catalog.json"))["assets"]}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise SystemExit(f"not in catalog: {missing}")
    return [by_id[i] for i in ids]


HIDE_Y = -30.0  # under the table: loads out of sight, locked so it does not fall
SURFACE_Y = 0.97  # table top under the battlefield square
SQUARE = (-22.0, -22.0, 44.0)  # x0, z0, size: the clear battlefield square between the dice trays


def read_tagged(wait=4.0):
    read = """
local out = {}
for _, o in ipairs(getObjectsWithTag("%s")) do
  local id
  for _, t in ipairs(o.getTags()) do if t:sub(1, %d) == "%s:" then id = t:sub(%d) end end
  if id then
    local b = o.getBounds()
    table.insert(out, {id = id, guid = o.getGUID(), name = o.getName(), loading = o.loading_custom, resting = o.resting, size = {b.size.x, b.size.y, b.size.z}, center = {b.center.x, b.center.y, b.center.z}})
  end
end
print("MEASURED " .. JSON.encode(out))""" % (TAG, len(TAG) + 1, TAG, len(TAG) + 2)
    return json.loads(printed(lua(read, wait=wait), "MEASURED ") or "[]")


def spawn(assets, spots, y=6.0, locked=False):
    states = []
    for a, (x, z) in zip(assets, spots):
        s = spawn_state(a, x, z, y=y, tag_id=f"{TAG}:{a['id']}")
        if s is None:
            continue
        s["Locked"] = locked
        s["Tags"] = [TAG, f"{TAG}:{a['id']}"]
        s["LuaScript"] = ""
        states.append(s)
    chunk = json.dumps(json.dumps(states))
    lua(f"local s = JSON.decode({chunk}) for _, d in ipairs(s) do spawnObjectData({{data = d}}) end print('SPAWNED ' .. #s)")
    return len(states)


def snap(r, path, rect):
    big = max(r["size"])
    lua("""for _, p in ipairs(Player.getPlayers()) do if p.host then p.lookAt({position = {%f, %f, %f}, pitch = 32, yaw = 200, distance = %f}) end end""" % (r["center"][0], r["center"][1], r["center"][2], max(6.0, big * 1.5)), wait=0.3)
    time.sleep(1.2)
    cmd = ["screencapture", "-x"] + (["-l", str(rect)] if rect else []) + [str(path)]
    subprocess.run(cmd, check=True)


def survey(ids, out, settle, batch, window):
    """Load assets a batch at a time, locked out of sight under the table; raise each in turn onto the
    centre of the battlefield square, measure and photograph it, then lower it and destroy the batch."""
    out.mkdir(parents=True, exist_ok=True)
    (out / "shots").mkdir(exist_ok=True)
    done = {r["id"]: r for r in json.loads((out / "measured.json").read_text())} if (out / "measured.json").exists() else {}
    todo = [i for i in ids if i not in done]
    lua('broadcastToAll("Asset survey running: the camera will move by itself. Please don\'t save.", {1, 0.8, 0.3})')
    for n in range(0, len(todo), batch):
        assets = load_assets(todo[n:n + batch])
        spawn(assets, [(-20.0 + 5 * k, -20.0) for k in range(len(assets))], y=HIDE_Y, locked=True)
        deadline = time.time() + settle * 4
        time.sleep(settle)
        rows = read_tagged()
        while any(r["loading"] for r in rows) and time.time() < deadline:
            time.sleep(3)
            rows = read_tagged()
        for r in rows:
            if r["loading"]:
                done[r["id"]] = r
                continue
            raised = printed(lua("""
local o = getObjectFromGUID("%s")
local b = o.getBounds()
local p = o.getPosition()
o.setPosition({p.x - b.center.x, p.y - (b.center.y - b.size.y / 2) + %f, p.z - b.center.z})
local q = o.getBounds()
print("RAISED " .. JSON.encode({size = {q.size.x, q.size.y, q.size.z}, center = {q.center.x, q.center.y, q.center.z}}))""" % (r["guid"], SURFACE_Y), wait=1.0), "RAISED ")
            r.update(json.loads(raised))
            snap(r, out / "shots" / f"{r['id']}.png", window)
            lua('local o = getObjectFromGUID("%s") local p = o.getPosition() o.setPosition({p.x, %f, p.z})' % (r["guid"], HIDE_Y), wait=0.5)
            done[r["id"]] = r
        lua('for _, o in ipairs(getObjectsWithTag("%s")) do o.destruct() end' % TAG)
        (out / "measured.json").write_text(json.dumps(list(done.values()), indent=1))
        print(f"surveyed {min(n + batch, len(todo))}/{len(todo)}", flush=True)


def present(ids, out, settle):
    """Lay the chosen assets out in the battlefield square, largest first, each with a floating label."""
    assets = load_assets(ids)
    x0, z0, size = SQUARE
    side = max(1, int(len(assets) ** 0.5 + 0.999))
    step = size / side
    spawn(assets, [(x0 + step / 2 + (k % side) * step, z0 + step / 2 + (k // side) * step) for k in range(len(assets))])
    time.sleep(settle)
    rows = read_tagged()
    rows.sort(key=lambda r: -(r["size"][0] * r["size"][2]))
    x, z, row_depth, gap = x0, z0, 0.0, 2.0
    moves = []
    for r in rows:
        w, d = r["size"][0], r["size"][2]
        if x + w > x0 + size:
            x, z, row_depth = x0, z + row_depth + gap + 1.5, 0.0
        moves.append({"guid": r["guid"], "x": x + w / 2, "z": z + d / 2, "label": f"{r['name'] or '?'} [{r['id'][:6]}]"})
        x += w + gap
        row_depth = max(row_depth, d)
    place = """
local m = JSON.decode(%s)
for _, v in ipairs(m) do
  local o = getObjectFromGUID(v.guid)
  if o then
    local p = o.getPosition()
    o.setPositionSmooth({v.x, p.y, v.z}, false, true)
    o.setLock(true)
    local b = o.getBounds()
    local t = spawnObject({type = "3DText", position = {v.x, 1.2, v.z - b.size.z / 2 - 0.7}, rotation = {90, 0, 0}})
    t.TextTool.setValue(v.label)
    t.TextTool.setFontSize(24)
    t.addTag("%s")
  end
end
print("PLACED " .. #m)""" % (json.dumps(json.dumps(moves)), TAG)
    lua(place, wait=3.0)
    print(f"presented {len(rows)} of {len(ids)}")


def sheets(out, per_sheet):
    from PIL import Image, ImageDraw
    rows = [r for r in json.loads((out / "measured.json").read_text()) if (out / "shots" / f"{r['id']}.png").exists()]
    thumbs = []
    for r in rows:
        im = Image.open(out / "shots" / f"{r['id']}.png").convert("RGB")
        im.thumbnail((480, 300))
        canvas = Image.new("RGB", (480, 330), "white")
        canvas.paste(im, ((480 - im.width) // 2, 0))
        ImageDraw.Draw(canvas).text((6, 308), f"{(r['name'] or '?')[:34]}  {r['id'][:6]}  {r['size'][0]:.1f}x{r['size'][2]:.1f}x{r['size'][1]:.1f}in", fill="black")
        thumbs.append(canvas)
    cols = 4
    for n in range(0, len(thumbs), per_sheet):
        page = thumbs[n:n + per_sheet]
        sheet = Image.new("RGB", (cols * 480, ((len(page) + cols - 1) // cols) * 330), "white")
        for i, t in enumerate(page):
            sheet.paste(t, ((i % cols) * 480, (i // cols) * 330))
        sheet.save(out / f"sheet-{n // per_sheet + 1}.png")
    print(f"{len(thumbs)} thumbnails in {(len(thumbs) + per_sheet - 1) // per_sheet} sheets")


def clear():
    print(lua('local n = 0 for _, o in ipairs(getObjectsWithTag("%s")) do o.destruct() n = n + 1 end print("CLEARED " .. n)' % TAG))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["survey", "sheets", "present", "clear"])
    ap.add_argument("--ids", help="file with one catalog asset id per line")
    ap.add_argument("--out", type=Path, default=Path("asset-board"))
    ap.add_argument("--settle", type=float, default=8.0)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--per-sheet", type=int, default=16)
    ap.add_argument("--window", type=int, help="TTS window id for screencapture -l; whole screen if omitted")
    a = ap.parse_args()
    ids = [l.strip() for l in open(a.ids) if l.strip() and not l.startswith("#")] if a.ids else []
    if a.command == "survey":
        survey(ids, a.out, a.settle, a.batch, a.window)
    elif a.command == "sheets":
        sheets(a.out, a.per_sheet)
    elif a.command == "present":
        present(ids, a.out, a.settle)
    else:
        clear()


if __name__ == "__main__":
    main()
