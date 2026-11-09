-- Offline test for the objective marker (mod/scripts/a18feb.lua, copied to 8f0c3a.lua).
--
--     lua mod/test/objective_test.lua        (from the repo root; pnpm mod:test)
--
-- Stubs the TTS object API: the disc is sized to 40mm, its colliders become triggers, the
-- spot and ring are drawn just above its top face, a band is still drawn for a marker that
-- is given one, the marker seats on terrain (also on a tile seam) or else the table felt,
-- it reports ready only once settled, and Move / Delete / save-load behave.

local here = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = here .. "/../.."
local SCRIPT = root .. "/mod/scripts/a18feb.lua"

local failures, checks = 0, 0
local function check(cond, what)
  checks = checks + 1
  if not cond then failures = failures + 1; print("FAIL: " .. what) end
end
local function near(a, b, what) check(type(a) == "number" and math.abs(a - b) < 1e-6, what .. ": " .. tostring(a) .. " vs " .. tostring(b)) end

JSON = { encode = function(t) return t end, decode = function(s) return s end }
local deferred = nil
Wait = { condition = function(f) if deferred then deferred[#deferred + 1] = f else f() end end }
local VARS = { mat_GUID = "4ee1f2", felt_GUID = "28865a" }
Global = { getVar = function(k) return VARS[k] end }
function broadcastToColor() end

local function tagged(guid, tags)
  return { getGUID = function() return guid end, hasTag = function(t) return tags[t] == true end }
end
local mat = tagged("4ee1f2", {})
local felt = tagged("28865a", {})
local tile = tagged("tile01", { ["tc-terrain"] = true })
local ruin = tagged("ruin01", { ["tc-terrain"] = true })
local model = tagged("mdl001", { ["tc-spawned"] = true })
local other = tagged("obj002", { ["tc-token:objective"] = true })

-- Board: a 36" board of ground tiles 3.45 high with a seam along x = 0 and a ruin floor at 4.2
-- around x = 10, on the table felt (top 0.90); the old 40k mat is parked under the felt.
Physics = { cast = function(p)
  local x = p.origin.x
  local hits = { { hit_object = felt, point = { y = 0.90 } }, { hit_object = mat, point = { y = 0.68 } }, { hit_object = model, point = { y = 6 } }, { hit_object = other, point = { y = 5 } } }
  if math.abs(x) > 1e-9 and math.abs(x) < 18 then hits[#hits + 1] = { hit_object = tile, point = { y = 3.45 } } end
  if x > 9 and x < 11 then hits[#hits + 1] = { hit_object = ruin, point = { y = 4.2 } } end
  return hits
end }

-- The Custom_Tile circle as TTS reports it at scale 1: an assumed 2.2" x 0.1" disc, pivot
-- at its bottom face (measured on the importer tile). The script must not depend on the
-- width guess: it measures and rescales.
local CHIP_IN, CHIP_H = 2.2, 0.1
local function newMarker(pos)
  local comps = { BoxCollider = { { vars = {} } }, MeshCollider = { { vars = {} } } }
  for _, list in pairs(comps) do for _, c in ipairs(list) do local cc = c; cc.set = function(k, v) cc.vars[k] = v end end end
  local m = { comps = comps, menu = {}, pos = pos, scale = { x = 1, y = 1, z = 1 }, locked = nil, destroyed = false }
  m.obj = {
    spawning = false, loading_custom = false, use_gravity = true,
    getScale = function() return { x = m.scale.x, y = m.scale.y, z = m.scale.z } end,
    setScale = function(s) m.scale = { x = s[1], y = s[2], z = s[3] } end,
    setRotation = function(r) m.rot = r end,
    getComponentsInChildren = function(kind) return comps[kind] or {} end,
    setLock = function(v) m.locked = v end,
    setVectorLines = function(l) m.lines = l end,
    addContextMenuItem = function(label, fn) m.menu[label] = fn end,
    getPosition = function() return { x = m.pos.x, y = m.pos.y, z = m.pos.z } end,
    setPosition = function(p) m.pos = { x = p.x, y = p.y, z = p.z } end,
    getBoundsNormalized = function() return { size = { x = CHIP_IN * m.scale.x, y = CHIP_H * m.scale.y, z = CHIP_IN * m.scale.z } } end,
    getBounds = function() return { center = { y = m.pos.y + CHIP_H * m.scale.y / 2 }, size = { y = CHIP_H * m.scale.y } } end,
    destruct = function() m.destroyed = true end,
  }
  return m
end

local function load(m, saved)
  self = m.obj
  dofile(SCRIPT)
  onLoad(saved or "")
  return m
end

local function lineRadius(m, line, i)
  local p = line.points[i or 1]
  return math.sqrt((p.x * m.scale.x) ^ 2 + (p.y * m.scale.z) ^ 2)
end

---------------------------------------------------------------- open objective --

local a = load(newMarker({ x = 4, y = 9, z = -3 }))
near(CHIP_IN * a.scale.x, 40 / 25.4, "disc is exactly 40mm (1.575in) across (p146)")
near(CHIP_IN * a.scale.z, 40 / 25.4, "both footprint axes 40mm")
near(a.scale.y, 1, "disc thickness unchanged")
check(a.locked == true and a.obj.use_gravity == false, "locked, gravity off")
for kind, list in pairs(a.comps) do
  for _, c in ipairs(list) do check(c.vars.isTrigger == true, kind .. " is a trigger") end
end
check(a.comps.MeshCollider[1].vars.convex == true, "mesh collider made convex for the trigger")
near(lineRadius(a, a.lines[1]), 20 / 25.4, "spot outline 40mm across")
near(lineRadius(a, a.lines[2]), 20 / 25.4 + 1, "control ring 1in beyond the marker (p152): 1.787in")
near(a.lines[2].points[1].z * a.scale.y, CHIP_H + 0.02, "ring drawn 0.02in above the disc's top face in world inches")
near(a.lines[1].points[1].z * a.scale.y, CHIP_H + 0.02, "spot drawn at the ring's height")
near(a.pos.y, 3.45, "seated on the ground tile, ignoring the model and the other marker")
check(ready == true, "ready once settled")
self = a.obj
setRingRadius({ ringIn = 1.787 })
near(lineRadius(a, a.lines[2]), 1.787, "the panel's 1.787in ring for an open objective")
check(#a.lines == 2, "spot and ring only")

---------------------------------------------------------------- seam --

local s = load(newMarker({ x = 0, y = 9, z = -12 }))
near(s.pos.y, 3.45, "a marker on a tile seam still seats on the tiles, not the table")

---------------------------------------------------------------- off the board --

local off = load(newMarker({ x = 21, y = 9, z = 0 }))
near(off.pos.y, 0.90, "off the board a marker seats on the table felt, not the mat parked under it")

---------------------------------------------------------------- covered objective --

local c = load(newMarker({ x = 10, y = 9, z = 2 }))
near(c.pos.y, 4.2, "covered marker seats on the ruin floor")
local band = {}
for i = 0, 8 do local t = math.rad(i * 45); band[#band + 1] = { 10 + 3 * math.cos(t), 2 + 2 * math.sin(t) } end
c.pos = { x = 10, y = 9, z = 2 }
self = c.obj
setRingRadius({ ringIn = 4.6, band = band })
check(#c.lines == 2 and #c.lines[2].points == #band, "the band is drawn instead of the ring")
near(c.lines[2].points[1].x * c.scale.x, 3, "band point x relative to the marker")
near(-c.lines[2].points[3].y * c.scale.z, 2, "band point z relative to the marker (local -y is world +z)")
near(c.lines[2].points[1].z * c.scale.y, c.lines[1].points[1].z * c.scale.y, "band and spot at one height")
local saved = onSave()
check(saved.ringIn == 4.6 and #saved.band == #band, "ring and band saved")
local c2 = load(newMarker({ x = 10, y = 9, z = 2 }), saved)
check(#c2.lines[2].points == #band, "band survives save/load")
self = a.obj
dofile(SCRIPT)
onLoad("")
check(#a.lines[2].points == 65, "an open marker reloaded draws its circle")

---------------------------------------------------------------- move / delete --

a.menu["Move objective"]("Red")
check(a.locked == false, "Move unlocks it for one drag")
a.pos = { x = 7, y = 12, z = 1 }
onDrop("Red")
check(a.locked == true and math.abs(a.pos.y - 3.45) < 1e-6 and a.pos.x == 7, "drop seats and relocks where it was dropped")
a.menu["Delete objective"]("Red")
check(a.destroyed, "Delete removes it")

---------------------------------------------------------------- readiness --

deferred = {}
local r = newMarker({ x = 2, y = 9, z = 2 })
self = r.obj
dofile(SCRIPT)
check(ready == false, "not ready before onLoad")
onLoad("")
check(ready == false, "not ready while it is still spawning")
for _, f in ipairs(deferred) do f() end
deferred = nil
check(ready == true and r.lines ~= nil, "ready once it has settled and drawn its rings")

print(string.format("objective_test: %d checks, %d failed", checks, failures))
os.exit(failures == 0 and 0 or 1)
