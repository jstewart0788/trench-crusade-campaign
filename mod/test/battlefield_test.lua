-- Offline test for the Battlefield panel (mod/scripts/47de64.lua).
--
--     lua mod/test/battlefield_test.lua        (from the repo root; pnpm mod:test)
--
-- Rebuilds a board from the API payload fixture and compares every object with
-- the generator's --tts output for the same seed, then drives the panel's glue
-- with a stubbed WebRequest / spawn / tag API: the chooser wraps, the archetype
-- toggle shows only where the scenario lets the player choose, Spawn and Clear
-- only remove tc-terrain and objective markers, a covered objective marks its
-- terrain piece (symbol decal on its floor, 1" band at the ground it stands on) instead of getting a
-- marker, an open one gets a marker whose ring is set once its script is ready,
-- network and HTTP failures read clearly.

local here = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = here .. "/../.."
local SCRIPT = root .. "/mod/scripts/47de64.lua"
local FIXTURES = root .. "/mod/fixtures/"

local failures, checks = 0, 0
local function check(cond, what)
  checks = checks + 1
  if not cond then
    failures = failures + 1
    print("FAIL: " .. what)
  end
end
local function eq(actual, expected, what)
  check(actual == expected, string.format("%s: expected %s, got %s", what, tostring(expected), tostring(actual)))
end

---------------------------------------------------------------- json --

-- Enough JSON for the fixtures: TTS's own JSON.decode stands in for it in the mod.
local function decode(s)
  local i = 1
  local function ws() i = s:find("[^ \t\r\n]", i) or #s + 1 end
  local value
  local function str()
    local out, j = {}, i + 1
    while true do
      local c = s:sub(j, j)
      if c == '"' then i = j + 1; return table.concat(out) end
      if c == "\\" then
        local e = s:sub(j + 1, j + 1)
        local map = { n = "\n", t = "\t", r = "\r", b = "\b", f = "\f", ['"'] = '"', ["\\"] = "\\", ["/"] = "/" }
        assert(map[e], "fixture uses a \\" .. e .. " escape")
        out[#out + 1] = map[e]
        j = j + 2
      else
        out[#out + 1] = c
        j = j + 1
      end
    end
  end
  function value()
    ws()
    local c = s:sub(i, i)
    if c == "{" then
      local t = {}
      i = i + 1; ws()
      if s:sub(i, i) == "}" then i = i + 1; return t end
      while true do
        ws(); local k = str(); ws(); i = i + 1
        t[k] = value(); ws()
        local d = s:sub(i, i); i = i + 1
        if d == "}" then return t end
      end
    elseif c == "[" then
      local t = {}
      i = i + 1; ws()
      if s:sub(i, i) == "]" then i = i + 1; return t end
      while true do
        t[#t + 1] = value(); ws()
        local d = s:sub(i, i); i = i + 1
        if d == "]" then return t end
      end
    elseif c == '"' then
      return str()
    elseif s:sub(i, i + 3) == "true" then i = i + 4; return true
    elseif s:sub(i, i + 4) == "false" then i = i + 5; return false
    elseif s:sub(i, i + 3) == "null" then i = i + 4; return nil
    else
      local num = s:match("^-?%d+%.?%d*[eE]?[-+]?%d*", i)
      i = i + #num
      return tonumber(num)
    end
  end
  return value()
end

local function read(path)
  local f = assert(io.open(path, "rb")); local t = f:read("a"); f:close(); return t
end

local function deepEq(a, b, path, diffs)
  if type(a) ~= type(b) then diffs[#diffs + 1] = path .. ": " .. type(a) .. " vs " .. type(b); return end
  if type(a) ~= "table" then
    if a ~= b then diffs[#diffs + 1] = path .. ": " .. tostring(a) .. " vs " .. tostring(b) end
    return
  end
  for k, v in pairs(a) do deepEq(v, b[k], path .. "." .. tostring(k), diffs) end
  for k in pairs(b) do if a[k] == nil then diffs[#diffs + 1] = path .. "." .. tostring(k) .. ": missing" end end
end

---------------------------------------------------------------- load --

JSON = { decode = function(s) if type(s) == "table" then return s end return decode(s) end, encode = function(t) return t end }
dofile(SCRIPT)

local payloadText = read(FIXTURES .. "battlefield-claim-no-mans-land-25.json")
local payload = decode(payloadText)
local expected = decode(read(FIXTURES .. "battlefield-claim-no-mans-land-25.tts.json"))
local list = decode(read(FIXTURES .. "battlefield-list.json"))

---------------------------------------------------------------- rebuild --

check(not payloadText:find("\\u%x%x%x%x"), "payload carries raw UTF-8, no \\u escapes")
eq(#payload.pieces, #expected, "one row per generated object")
local diffs = {}
for i, row in ipairs(payload.pieces) do deepEq(buildState(payload, row), expected[i], "object " .. i, diffs) end
eq(#diffs, 0, "Lua-built objects equal the generator's --tts objects field for field" .. (diffs[1] and (" (first: " .. diffs[1] .. ")") or ""))
local dotted = 0
for i, row in ipairs(payload.pieces) do
  local s = buildState(payload, row)
  if s.Nickname:find("·", 1, true) then
    dotted = dotted + 1
    eq(s.Nickname, expected[i].Nickname, "middle dot survives into the nickname")
  end
end
check(dotted > 0, "the fixture has nicknames with a middle dot")
check(validatePayload(payload, "claim-no-mans-land", 25), "fixture payload validates")
check(not validatePayload(payload, "claim-no-mans-land", 26), "a payload for another seed is refused")
check(not validatePayload({ version = "x" }, "claim-no-mans-land", 25), "a foreign payload is refused")
check(validateList(list), "scenario list validates")

---------------------------------------------------------------- chooser --

local s = newState()
local scs = list.scenarios
eq(#scs, 12, "twelve scenarios")
eq(currentSeed(s, scs), scs[1].recommendedSeeds[1], "first recommended seed")
for _ = 1, #scs[1].recommendedSeeds do nextBoard(s, scs) end
eq(s.boardIndex, 1, "next board wraps after the last recommended seed")
stepScenario(s, scs, -1)
eq(s.scenarioIndex, 12, "previous scenario wraps to the last")
stepScenario(s, scs, 1)
eq(s.scenarioIndex, 1, "next scenario wraps to the first")
randomBoard(s, 999999, function(lo, hi) eq(lo, 1, "random lower bound"); eq(hi, 999999, "random upper bound"); return 4242 end)
eq(currentSeed(s, scs), 4242, "random board asks for its own seed")
check(boardLabel(s, scs):find("Random board: seed 4242", 1, true) ~= nil, "random label")
nextBoard(s, scs)
eq(currentSeed(s, scs), scs[1].recommendedSeeds[1], "next board leaves random for the recommended list")
local restored = normaliseState({ scenarioIndex = 40, boardIndex = 9 })
clampState(restored, scs)
check(restored.scenarioIndex >= 1 and restored.scenarioIndex <= 12 and restored.boardIndex <= #scs[restored.scenarioIndex].recommendedSeeds, "a stale save is clamped")
eq(boardUrl("https://tc.rynfin.org/", "relic-hunt", 10), "https://tc.rynfin.org/api/battlefields/relic-hunt/10", "board url")
eq(boardUrl("https://tc.rynfin.org", "great-war", 10, "no-mans-land"), "https://tc.rynfin.org/api/battlefields/great-war/10?archetype=no-mans-land", "board url with an archetype")

---------------------------------------------------------------- archetype toggle --

local function layoutById(st)
  local out = {}
  for _, spec in ipairs(panelLayout({ archetype = archetypeLabel(st, scs) }, geomFromBounds())) do out[spec.id] = spec end
  return out
end
local a = newState()
eq(archetypeLabel(a, scs), nil, "no archetype toggle for Claim No Man's Land (fixed archetype)")
local hidden = layoutById(a).archetype
check(hidden.width == 0 and hidden.height == 0 and hidden.label == "", "the archetype button is hidden for a fixed-archetype scenario")
stepArchetype(a, scs)
eq(a.archetype, nil, "the toggle does nothing on a fixed-archetype scenario")
local fixed = 0
for i, sc in ipairs(scs) do
  if #selectableArchetypes(sc) == 0 then
    fixed = fixed + 1
    a.scenarioIndex = i
    eq(layoutById(a).archetype.width, 0, sc.id .. " hides the archetype button")
  end
end
check(fixed >= 8, "most scenarios have a fixed archetype (" .. fixed .. ")")
local gw = 0
for i, sc in ipairs(scs) do if sc.id == "great-war" then gw = i end end
check(gw > 0, "the list has Great War")
a = newState()
stepScenario(a, scs, gw - 1)
eq(scs[a.scenarioIndex].id, "great-war", "stepped to Great War")
eq(archetypeLabel(a, scs), "Archetype: Trench Lines", "Great War shows its own archetype first")
check(layoutById(a).archetype.width > 0 and layoutById(a).archetype.label == "Archetype: Trench Lines", "the archetype button is shown for Great War (p195: any archetype)")
eq(currentArchetype(a, scs), nil, "the scenario's own archetype sends no parameter")
stepArchetype(a, scs)
eq(currentArchetype(a, scs), "no-mans-land", "the toggle steps to No Man's Land")
eq(archetypeLabel(a, scs), "Archetype: No Man's Land", "label follows the toggle")
stepArchetype(a, scs)
eq(currentArchetype(a, scs), "trench-lines", "the toggle wraps back to Trench Lines")
stepArchetype(a, scs)
local saved = normaliseState({ scenarioIndex = a.scenarioIndex, archetype = a.archetype })
clampState(saved, scs)
eq(currentArchetype(saved, scs), "no-mans-land", "the chosen archetype survives save/load")
randomBoard(a, 999999, function(lo, hi) if hi == 2 then return 1 end return 77 end, scs)
eq(a.randomSeed, 77, "random board on Great War still picks a seed")
eq(currentArchetype(a, scs), "trench-lines", "random board on Great War picks an archetype too")
randomBoard(a, 999999, function(lo, hi) if hi == 2 then return 2 end return 78 end, scs)
eq(currentArchetype(a, scs), "no-mans-land", "random board can pick the other archetype")
stepScenario(a, scs, 1)
eq(a.archetype, nil, "changing scenario drops the chosen archetype")
local stale = normaliseState({ scenarioIndex = 1, archetype = "no-mans-land" })
clampState(stale, scs)
eq(currentArchetype(stale, scs), nil, "a saved archetype on a fixed scenario is ignored")
local fixedRandom = newState()
randomBoard(fixedRandom, 999999, function(lo, hi) eq(hi, 999999, "fixed scenario: random only picks the seed"); return 5 end, scs)
eq(fixedRandom.archetype, nil, "random board leaves a fixed scenario's archetype alone")
check(validatePayload(payload, "claim-no-mans-land", 25, "no-mans-land"), "payload names the archetype it was laid as")
check(not validatePayload(payload, "claim-no-mans-land", 25, "trench-lines"), "a payload in another archetype is refused")

---------------------------------------------------------------- panel layout --

local geom = geomFromBounds({ size = { x = 10.667, y = 0.2, z = 8 }, center = { y = 1.1 } }, { size = { x = 14.127, y = 0.2, z = 8 }, center = { y = 1.1 } }, { x = 4, y = 1, z = 4 }, { x = -22, y = 1, z = -15 })
local drawn = {}
for _, spec in ipairs(panelLayout({ archetype = "Archetype: No Man's Land" }, geom)) do
  local e = widgetExtent(spec)
  check(e.left >= -geom.hx and e.right <= geom.hx and e.top >= -geom.hz and e.bottom <= geom.hz, spec.id .. " stays on the tile")
  if spec.width > 0 then drawn[#drawn + 1] = { id = spec.id, e = e } end
end
for i = 1, #drawn do
  for j = i + 1, #drawn do
    local p, q = drawn[i].e, drawn[j].e
    check(p.right <= q.left or q.right <= p.left or p.bottom <= q.top or q.bottom <= p.top, drawn[i].id .. " does not overlap " .. drawn[j].id)
  end
end

---------------------------------------------------------------- glue --

local world = {}
local function thing(tags, guid)
  local o = { tags = tags, guid = guid, destroyed = false }
  o.destruct = function() o.destroyed = true end
  o.isDestroyed = function() return o.destroyed end
  return o
end
local terrain1, terrain2 = thing({ "tc-terrain" }, "t1"), thing({ "tc-terrain", "tc-role:ruin" }, "t2")
local marker = thing({ "tc-token:objective" }, "m1")
local model = thing({ "tc-spawned", "tc-warband:ABCDEF" }, "w1")
local tokenDown = thing({ "tc-token:down" }, "d1")
local tracker = thing({}, "4ac9e3")
world = { terrain1, terrain2, marker, model, tokenDown, tracker }
function getObjectsWithTag(tag)
  local out = {}
  for _, o in ipairs(world) do
    if not o.destroyed then for _, t in ipairs(o.tags) do if t == tag then out[#out + 1] = o end end end
  end
  return out
end
-- Spawned pieces stand 3 high above a bottom pivot; ground tiles are 2.5 high blocks
-- centred 0.25 above theirs (pivot 1.9 -> top 3.40, a hill tile at 4.4 -> 5.90), footprint
-- from their cells. positionToLocal is Unity's inverse transform (rotation about y, then
-- scale), toWorld its inverse for the checks.
local PIECE_H = 3
local GROUND_CELLS = { ["landscape-1x1"] = { 4, 4 }, ["landscape-1x2"] = { 4, 8 }, ["landscape-2x2"] = { 8, 8 } }
local function rotY(x, z, deg)
  local a = math.rad(deg)
  return x * math.cos(a) + z * math.sin(a), -x * math.sin(a) + z * math.cos(a)
end
local spawnedData = {}
function spawnObjectData(p)
  spawnedData[#spawnedData + 1] = p.data
  local t = p.data.Transform
  local o = thing({ table.unpack(p.data.Tags) }, "s" .. #spawnedData)
  o.spawning, o.loading_custom = false, false
  local cells = GROUND_CELLS[p.data.Description:match("%((%S+)%)%s*[^\n]*$") or ""]
  o.getBounds = function()
    if o.hasTag("tc-role:ground") and cells then
      local w, d = cells[1], cells[2]
      if t.rotY % 180 ~= 0 then w, d = d, w end
      return { center = { x = t.posX, y = t.posY + 0.25, z = t.posZ }, size = { x = w, y = 2.5, z = d } }
    end
    return { center = { x = t.posX, y = t.posY + PIECE_H / 2, z = t.posZ }, size = { x = 4, y = PIECE_H, z = 4 } }
  end
  o.getScale = function() return { x = t.scaleX, y = t.scaleY, z = t.scaleZ } end
  o.positionToLocal = function(v)
    local x, z = rotY(v.x - t.posX, v.z - t.posZ, -t.rotY)
    return { x = x / t.scaleX, y = (v.y - t.posY) / t.scaleY, z = z / t.scaleZ }
  end
  o.toWorld = function(l)
    local x, z = rotY(l.x * t.scaleX, l.z * t.scaleZ, t.rotY)
    return { x = x + t.posX, y = l.y * t.scaleY + t.posY, z = z + t.posZ }
  end
  o.setVectorLines = function(l) o.lines = l end
  o.setDecals = function(d) o.decals = d end
  o.addTag = function(tag) o.tags[#o.tags + 1] = tag end
  o.hasTag = function(tag) for _, x in ipairs(o.tags) do if x == tag then return true end end return false end
  world[#world + 1] = o
  return o
end
-- A marker taken from the bag has not run its script yet: a call made now is lost, and
-- onLoad later draws the default ring. load() runs its onLoad and settle.
local DEFAULT_RING = "default"
local takes = {}
local function newMarker()
  local m = { ring = nil, loaded = false, destroyed = false }
  m.isDestroyed = function() return m.destroyed end
  m.getVar = function(k) if k == "ready" and m.loaded then return true end return nil end
  m.call = function(fn, arg)
    eq(fn, "setRingRadius", "marker call")
    if m.loaded then m.ring = arg.ringIn; m.band = arg.band end
  end
  m.load = function() m.loaded = true; m.ring = DEFAULT_RING end
  return m
end
local bag = { takeObject = function(p)
  takes[#takes + 1] = p
  local m = newMarker()
  takes[#takes].marker = m
  p.callback_function(m)
end }
local importerState = { baseUrl = "http://127.0.0.1:3001/" }
function getObjectFromGUID(g)
  if g == "70d18f" then return bag end
  if g == "b91983" then return { getTable = function(k) eq(k, "state", "importer state read"); return importerState end } end
  return nil
end
-- Conditions are polled until they hold, as Wait.condition does frame by frame.
local waiting = {}
local function pollWaits()
  local i = 1
  while i <= #waiting do
    local w = waiting[i]
    if w.cond() then
      table.remove(waiting, i)
      w.f()
      i = 1
    else
      i = i + 1
    end
  end
end
Wait = { condition = function(f, cond) waiting[#waiting + 1] = { f = f, cond = cond }; pollWaits() end }
local requests = {}
local nextResponse
WebRequest = { get = function(url, cb) requests[#requests + 1] = url; cb(nextResponse(url)) end }
local labelsShown = {}
self = {
  clearButtons = function() end,
  createButton = function(b) labelsShown[#labelsShown + 1] = b end,
  editButton = function(e) labelsShown[e.index + 1].label = e.label end,
  getVisualBoundsNormalized = function() return { size = { x = 10.667, y = 0.2, z = 8 }, center = { y = 1.1 } } end,
  getBoundsNormalized = function() return { size = { x = 14.127, y = 0.2, z = 8 }, center = { y = 1.1 } } end,
  getScale = function() return { x = 4, y = 1, z = 4 } end,
  getPosition = function() return { x = -22, y = 1, z = -15 } end,
}
local function statusText() return (labelsShown[buttonIndex.status + 1].label:gsub("\n", " ")) end

nextResponse = function() return { is_error = true, error = "Couldn't connect to server" } end
onLoad("")
check(statusText():find("Can't reach http://127.0.0.1:3001", 1, true) ~= nil, "network failure names the host: " .. statusText())
eq(requests[1], "http://127.0.0.1:3001/api/battlefields", "list fetched from the importer's base URL")

nextResponse = function(url)
  if url:find("/api/battlefields$") then return { is_error = false, response_code = 200, text = read(FIXTURES .. "battlefield-list.json") } end
  return { is_error = false, response_code = 200, text = payloadText }
end
onSpawn()
eq(#spawnedData, #expected, "spawn creates every piece")
check(terrain1.destroyed and terrain2.destroyed and marker.destroyed, "spawn removes the old terrain and markers")
check(not model.destroyed and not tokenDown.destroyed and not tracker.destroyed, "spawn leaves models, tokens and tools alone")
check(#payload.objectives > 0, "the fixture board has objectives")
eq(#takes, 0, "every objective on this board is covered by terrain: no marker disc at all")
local coverOf = {}
for i, row in ipairs(payload.pieces) do if row[6] ~= "" then coverOf[row[6]] = world[#world - #payload.pieces + i] end end
for _, spec in ipairs(payload.objectives) do
  local piece = coverOf[spec.id]
  check(piece ~= nil and #spec.band > 1, spec.id .. " has a covering piece and a band")
  check(piece.hasTag("tc-objective") and piece.hasTag("tc-objective:" .. spec.id), spec.id .. ": covering piece tagged tc-objective:" .. spec.id)
  check(piece.hasTag("tc-terrain"), spec.id .. ": covering piece is still terrain, so Clear removes it")
  local line = piece.lines and piece.lines[1] or { points = {} }
  check(piece.lines ~= nil and #piece.lines == 1 and #line.points == #spec.band, spec.id .. ": the 1in band is drawn on the piece")
  local top = piece.getBounds().center.y + PIECE_H / 2
  check(type(spec.surfaceY) == "number", spec.id .. ": the generator sends the surface the piece stands on")
  local surface = spec.surfaceY or 0
  local worst = 0
  for k, pt in ipairs(line.points) do
    local w = piece.toWorld(pt)
    worst = math.max(worst, math.abs(w.x - spec.band[k][1]), math.abs(w.z - spec.band[k][2]))
    check(math.abs(w.y - (surface + 0.06)) < 1e-9 and w.y < top - 1, string.format("%s band point %d at the ground it stands on + 0.06, not over the building (%.3f, ground %.3f, top %.3f)", spec.id, k, w.y, surface, top))
  end
  check(worst < 1e-9, spec.id .. ": band points land on the generator's band in world space (off by " .. worst .. ")")
  local decal = piece.decals and piece.decals[1] or { position = { x = 0, y = 0, z = 0 }, rotation = {}, scale = { x = 0 } }
  check(piece.decals ~= nil and #piece.decals == 1, spec.id .. ": the piece carries one decal")
  eq(decal.url, "https://tc.rynfin.org/tts/objective-symbol.png", spec.id .. ": decal is our objective symbol, from our host")
  local at = piece.toWorld(decal.position)
  check(math.abs(at.x - spec.posX) < 1e-9 and math.abs(at.z - spec.posZ) < 1e-9, spec.id .. ": symbol over the objective point")
  check(math.abs(at.y - (surface + 0.1)) < 1e-9, string.format("%s: symbol on the piece's floor, 0.1 above the surface it stands on (%.3f vs %.3f)", spec.id, at.y, surface))
  eq(decal.rotation.x, 90, spec.id .. ": decal laid flat, facing up")
  check(math.abs(decal.scale.x * piece.getScale().x - 40 / 25.4) < 1e-9, spec.id .. ": symbol 40mm across in world inches")
end
local flat, hill = 0, 0
for _, spec in ipairs(payload.objectives) do
  if math.abs((spec.surfaceY or 0) - 3.4) < 0.1 then flat = flat + 1 end
  if math.abs((spec.surfaceY or 0) - 5.9) < 1e-9 then hill = hill + 1 end
end
check(flat == 4 and hill == 1, "seed 25 has four pieces on the ground tiles (3.40 / 3.48) and the tower on a hill (5.90): " .. flat .. " / " .. hill)
check(not busy, "panel is free again after the spawn")
check(statusText():find("5 on terrain, 0 marker", 1, true) ~= nil, "status counts objectives on terrain and markers: " .. statusText())

-- Reload: the covered pieces re-draw from their memo.
local again = coverOf["obj-3"]
again.lines, again.decals = nil, nil
restoreCovers()
check(again.lines and #again.lines[1].points == #payload.objectives[3].band and again.decals and #again.decals == 1, "a covered piece re-draws its band and symbol after a load")
check(again.lines and math.abs(again.toWorld(again.lines[1].points[1]).y - 5.96) < 1e-9, "the reloaded band keeps the hill-top height")
local raisedRuin = coverOf["obj-1"]
raisedRuin.lines = nil
restoreCovers()
check(raisedRuin.lines and math.abs(raisedRuin.toWorld(raisedRuin.lines[1].points[1]).y - 3.54) < 1e-9, "the reloaded band keeps the generator's surface from the memo (3.48 + 0.06), not the ground tiles' 3.40")

-- A piece marked before the generator sent the surface: its memo has none, so the highest
-- ground tile under the objective point decides (the hill tile under the tower, the ground
-- tiles under a ruin), else the piece's own bottom.
local function remarkWithoutSurface(id)
  local piece = coverOf[id]
  local memo = {}
  for k, v in pairs(piece.memo) do memo[k] = v end
  memo.surfaceY = nil
  piece.memo, piece.lines, piece.decals = memo, nil, nil
  restoreCovers()
  return piece.toWorld(piece.lines[1].points[1]).y, piece.toWorld(piece.decals[1].position).y
end
local bandY, symbolY = remarkWithoutSurface("obj-3")
check(math.abs(bandY - 5.96) < 1e-9 and math.abs(symbolY - 6.0) < 1e-9, string.format("old memo, tower on a hill: band and symbol from the hill tile's top (%.3f, %.3f)", bandY, symbolY))
bandY = remarkWithoutSurface("obj-2")
check(math.abs(bandY - 3.46) < 1e-9, string.format("old memo, ruin on flat ground: band from the ground tiles' top (%.3f)", bandY))
local floating = spawnObjectData({ data = buildState(payload, payload.pieces[1]) })
floating.memo = { id = "obj-x", posX = 99, posZ = 99, band = { { 98, 98 }, { 100, 100 } } }
floating.tags[#floating.tags + 1] = "tc-objective"
restoreCovers()
check(floating.lines and math.abs(floating.toWorld(floating.lines[1].points[1]).y - (floating.getBounds().center.y - PIECE_H / 2 + 0.06)) < 1e-9, "no ground tile under it: the piece's own bottom")
eq(requests[#requests], "http://127.0.0.1:3001/api/battlefields/claim-no-mans-land/25", "board url from the chooser")

local spawnedTerrain = #getObjectsWithTag("tc-terrain")
onClear()
eq(#getObjectsWithTag("tc-terrain"), 0, "clear removes the spawned terrain (" .. spawnedTerrain .. ")")
check(not model.destroyed and not tokenDown.destroyed and not tracker.destroyed, "clear leaves models, tokens and tools alone")
check(again.destroyed, "clear removes the pieces that carried objectives")

---------------------------------------------------------------- open objectives and marker readiness --

local open = { id = "obj-9", label = "Objective", posX = 3, posZ = -4, ringIn = 1.787, band = {} }
local covering = spawnObjectData({ data = buildState(payload, payload.pieces[1]) })
local onTerrain, markers = placeObjectives({ open }, { ["obj-9"] = covering })
eq(onTerrain, 0, "an open objective (empty band) never marks terrain, even if a piece is passed")
eq(markers, 1, "an open objective gets a marker")
local t = takes[#takes]
eq(t.position.x, 3, "marker x"); eq(t.position.z, -4, "marker z")
eq(t.marker.ring, nil, "nothing is sent to a marker whose script has not loaded")
t.marker.load()
eq(t.marker.ring, DEFAULT_RING, "on load the marker draws its default ring")
pollWaits()
eq(t.marker.ring, 1.787, "once ready the marker gets the spec's 1.787in ring (old ordering lost it)")
eq(t.marker.band, nil, "an open marker is sent no band")
eq(covering.lines, nil, "the passed piece is left unmarked")
local gone = (function() placeObjectives({ open }, {}); return takes[#takes].marker end)()
gone.destroyed = true
pollWaits()
eq(#waiting, 0, "a marker deleted before it was ready drops its wait")

nextResponse = function() return { is_error = false, response_code = 422, text = '{"error":{"code":"no-board","message":"The generator could not lay relic-hunt seed 7; try another seed"}}' } end
onSpawn()
check(statusText():find("HTTP 422", 1, true) ~= nil and statusText():find("try another", 1, true) ~= nil, "HTTP errors carry the server's message: " .. statusText())
check(not busy, "a failed fetch frees the panel")

print(string.format("battlefield_test: %d checks, %d failed", checks, failures))
os.exit(failures == 0 and 0 or 1)
