-- Offline test for the Battlefield panel (mod/scripts/47de64.lua).
--
--     lua mod/test/battlefield_test.lua        (from the repo root; pnpm mod:test)
--
-- Rebuilds a board from the API payload fixture and compares every object with
-- the generator's --tts output for the same seed, then drives the panel's glue
-- with a stubbed WebRequest / spawn / tag API: the chooser wraps, Spawn and Clear
-- only remove tc-terrain and objective markers, markers go to the objective
-- points with their ring radius, network and HTTP failures read clearly.

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

JSON = { decode = decode, encode = function(t) return t end }
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
local spawnedData = {}
function spawnObjectData(p)
  spawnedData[#spawnedData + 1] = p.data
  local o = thing(p.data.Tags, "s" .. #spawnedData)
  o.spawning, o.loading_custom = false, false
  world[#world + 1] = o
  return o
end
local takes = {}
local bag = { takeObject = function(p)
  takes[#takes + 1] = p
  local m = { ring = nil }
  m.call = function(fn, arg) eq(fn, "setRingRadius", "marker call"); m.ring = arg.ringIn; m.band = arg.band end
  p.callback_function(m)
  takes[#takes].marker = m
end }
local importerState = { baseUrl = "http://127.0.0.1:3001/" }
function getObjectFromGUID(g)
  if g == "70d18f" then return bag end
  if g == "b91983" then return { getTable = function(k) eq(k, "state", "importer state read"); return importerState end } end
  return nil
end
Wait = { condition = function(f, cond) check(cond(), "spawn waits until the pieces loaded"); f() end }
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
eq(#takes, #payload.objectives, "one marker per objective")
for i, t in ipairs(takes) do
  eq(t.position.x, payload.objectives[i].posX, "marker x")
  eq(t.position.z, payload.objectives[i].posZ, "marker z")
  eq(t.marker.ring, payload.objectives[i].ringIn, "marker ring radius")
  eq(#(t.marker.band or {}), #payload.objectives[i].band, "marker gets the covered objective's band")
end
local banded = 0
for _, t in ipairs(takes) do if t.marker.band and #t.marker.band > 0 then banded = banded + 1 end end
check(banded > 0, "the fixture board has covered objectives with bands")
check(not busy, "panel is free again after the spawn")
eq(requests[#requests], "http://127.0.0.1:3001/api/battlefields/claim-no-mans-land/25", "board url from the chooser")

local spawnedTerrain = #getObjectsWithTag("tc-terrain")
onClear()
eq(#getObjectsWithTag("tc-terrain"), 0, "clear removes the spawned terrain (" .. spawnedTerrain .. ")")
check(not model.destroyed and not tokenDown.destroyed and not tracker.destroyed, "clear leaves models, tokens and tools alone")

nextResponse = function() return { is_error = false, response_code = 422, text = '{"error":{"code":"no-board","message":"The generator could not lay relic-hunt seed 7; try another seed"}}' } end
onSpawn()
check(statusText():find("HTTP 422", 1, true) ~= nil and statusText():find("try another", 1, true) ~= nil, "HTTP errors carry the server's message: " .. statusText())
check(not busy, "a failed fetch frees the panel")

print(string.format("battlefield_test: %d checks, %d failed", checks, failures))
os.exit(failures == 0 and 0 or 1)
