-- FTC-GUID: 47de64
-- Battlefield panel (TC-022a): pick a scenario and a board, fetch it from the
-- campaign API (/api/battlefields, packages/battlefield on the server) and
-- spawn it, objective markers included. Only objects tagged tc-terrain and
-- objective markers (tc-token:objective) are ever removed.
--
-- Everything above the "TTS glue" line touches no TTS global, so
-- mod/test/battlefield_test.lua runs it under plain Lua.

DEFAULT_BASE_URL = "https://tc.rynfin.org"
IMPORTER_GUID = "b91983"
PAYLOAD_VERSION = "tc-battlefield-v1"
TERRAIN_TAG = "tc-terrain"
OBJECTIVE_TAG = "tc-token:objective"
-- Red Objective bag; its content is the self-seating marker (mod/scripts/a18feb.lua).
OBJECTIVE_BAG = "70d18f"
MARKER_DROP_Y = 8
SPAWN_SETTLE_SECONDS = 45
STATUS_WRAP = 44

function listUrl(base)
  return trimSlash(base) .. "/api/battlefields"
end

function boardUrl(base, scenarioId, seed)
  return trimSlash(base) .. "/api/battlefields/" .. scenarioId .. "/" .. tostring(math.floor(seed))
end

function trimSlash(s)
  return (tostring(s or ""):gsub("%s+$", ""):gsub("^%s+", ""):gsub("/+$", ""))
end

function newState()
  return { scenarioIndex = 1, boardIndex = 1, randomSeed = nil }
end

function normaliseState(loaded)
  local s = newState()
  if type(loaded) ~= "table" then return s end
  local i = tonumber(loaded.scenarioIndex)
  if i and i >= 1 then s.scenarioIndex = math.floor(i) end
  local b = tonumber(loaded.boardIndex)
  if b and b >= 1 then s.boardIndex = math.floor(b) end
  local r = tonumber(loaded.randomSeed)
  if r and r >= 1 then s.randomSeed = math.floor(r) end
  return s
end

local function wrap(i, n)
  if n < 1 then return 1 end
  return ((i - 1) % n) + 1
end

-- Keeps the indices inside the list the API sent (it may have shrunk since the save).
function clampState(state, scenarios)
  state.scenarioIndex = wrap(state.scenarioIndex, #scenarios)
  local sc = scenarios[state.scenarioIndex]
  state.boardIndex = wrap(state.boardIndex, sc and #sc.recommendedSeeds or 0)
end

function currentScenario(state, scenarios)
  return scenarios[state.scenarioIndex]
end

function currentSeed(state, scenarios)
  if state.randomSeed then return state.randomSeed end
  local sc = currentScenario(state, scenarios)
  if not sc or #sc.recommendedSeeds == 0 then return 1 end
  return sc.recommendedSeeds[state.boardIndex]
end

function stepScenario(state, scenarios, delta)
  state.scenarioIndex = wrap(state.scenarioIndex + delta, #scenarios)
  state.boardIndex = 1
  state.randomSeed = nil
end

function nextBoard(state, scenarios)
  local sc = currentScenario(state, scenarios)
  if state.randomSeed then
    state.randomSeed = nil
    state.boardIndex = 1
  else
    state.boardIndex = wrap(state.boardIndex + 1, sc and #sc.recommendedSeeds or 0)
  end
end

-- rnd(lo, hi) is math.random in the mod; a stub in the test.
function randomBoard(state, maxSeed, rnd)
  state.randomSeed = rnd(1, maxSeed)
end

function scenarioLabel(state, scenarios)
  local sc = currentScenario(state, scenarios)
  if not sc then return "Battlefield: loading scenarios..." end
  return string.format("%d/%d  %s  (%d\")", state.scenarioIndex, #scenarios, sc.name, sc.boardIn)
end

function boardLabel(state, scenarios)
  local sc = currentScenario(state, scenarios)
  if not sc then return "" end
  if state.randomSeed then return string.format("Random board: seed %d", state.randomSeed) end
  return string.format("Board %d/%d: seed %d", state.boardIndex, #sc.recommendedSeeds, currentSeed(state, scenarios))
end

function validateList(list)
  if type(list) ~= "table" or type(list.scenarios) ~= "table" or #list.scenarios == 0 then
    return false, "no scenarios in the list"
  end
  for _, sc in ipairs(list.scenarios) do
    if type(sc.id) ~= "string" or type(sc.name) ~= "string" or type(sc.recommendedSeeds) ~= "table" then
      return false, "a scenario entry is malformed"
    end
  end
  return true
end

function validatePayload(p, scenarioId, seed)
  if type(p) ~= "table" or p.version ~= PAYLOAD_VERSION then return false, "not a " .. PAYLOAD_VERSION .. " board" end
  if p.scenarioId ~= scenarioId or tonumber(p.seed) ~= seed then return false, "the server sent a different board" end
  if type(p.assets) ~= "table" or type(p.texts) ~= "table" or type(p.pieces) ~= "table" then return false, "board data is incomplete" end
  for i, row in ipairs(p.pieces) do
    if type(row) ~= "table" or not p.assets[row[1]] then return false, "piece " .. i .. " uses an unknown asset" end
  end
  return true
end

local function copy(t)
  if type(t) ~= "table" then return t end
  local out = {}
  for k, v in pairs(t) do out[k] = copy(v) end
  return out
end

-- The Lua twin of expandBattlefield in packages/battlefield/src/compact.ts: one
-- payload row back to the object state layoutToObjectStates emitted. JSON
-- arrays arrive 1-based, so text indices (0-based on the wire) are +1.
function buildState(p, row)
  local paletteId, nick, reminder, role, pieceId, objectiveId = row[1], row[2], row[3], row[4], row[5], row[6]
  local t = p.assets[paletteId]
  local state = {
    Name = t.Name,
    Nickname = p.texts[nick + 1],
    Description = p.texts[reminder + 1] .. "\n" .. role .. " " .. pieceId .. " (" .. paletteId .. ")"
      .. ((objectiveId ~= nil and objectiveId ~= "") and (" covers " .. objectiveId) or ""),
    Transform = {
      posX = row[7], posY = row[8], posZ = row[9],
      rotX = 0, rotY = row[10], rotZ = 0,
      scaleX = t.scale[1], scaleY = t.scale[2], scaleZ = t.scale[3],
    },
    ColorDiffuse = copy(t.ColorDiffuse),
    Locked = true,
    Tags = { "tc-battlefield:" .. tostring(math.floor(p.seed)), TERRAIN_TAG, "tc-role:" .. role },
  }
  if t.CustomAssetbundle then state.CustomAssetbundle = copy(t.CustomAssetbundle) end
  if t.CustomMesh then state.CustomMesh = copy(t.CustomMesh) end
  if t.CustomImage then state.CustomImage = copy(t.CustomImage) end
  return state
end

function wrapText(text, maxChars)
  local lines, line = {}, ""
  for token in tostring(text or ""):gmatch("%S+") do
    if line == "" then
      line = token
    elseif #line + 1 + #token <= maxChars then
      line = line .. " " .. token
    else
      lines[#lines + 1] = line
      line = token
    end
  end
  if line ~= "" then lines[#lines + 1] = line end
  return table.concat(lines, "\n")
end

---------------------------------------------------------------- widgets --

-- Same tile, scale and rotY 270 as the Turn Tracker (4ac9e3), so the tracker's
-- live-measured face (local x -1.333..1.333 by z -1..1, mesh y 0..0.2, widgets
-- at top + 0.1, 500 widget units per local unit across, ~650 down) applies.
REF = { hx = 1.333, hz = 1.0, top = 0.2 }
UNITS_PER_LOCAL = 500
HEIGHT_UNITS_PER_LOCAL = 650
WIDGET_LIFT = 0.1

LIGHT = { 0.95, 0.92, 0.85 }
PANEL = { 0.12, 0.12, 0.12 }
CLEAR = { 0, 0, 0, 0 }
SPAWN = { 0.18, 0.36, 0.2 }
DANGER = { 0.5, 0.14, 0.12 }

BUTTONS = {
  { id = "scenario", row = -0.81, width = 0, height = 0, font = 70, click = "noop", colour = CLEAR },
  { id = "prevScenario", label = "< Scenario", row = -0.54, col = -0.72, width = 560, height = 170, font = 60, click = "onPrevScenario" },
  { id = "nextScenario", label = "Scenario >", row = -0.54, col = 0.72, width = 560, height = 170, font = 60, click = "onNextScenario" },
  { id = "board", row = -0.27, width = 0, height = 0, font = 65, click = "noop", colour = CLEAR },
  { id = "nextBoard", label = "Next board", row = 0.0, col = -0.72, width = 560, height = 170, font = 60, click = "onNextBoard" },
  { id = "randomBoard", label = "Random board", row = 0.0, col = 0.72, width = 560, height = 170, font = 60, click = "onRandomBoard" },
  { id = "spawn", label = "Spawn battlefield", row = 0.27, width = 1150, height = 170, font = 70, click = "onSpawn", colour = SPAWN },
  { id = "clear", label = "Clear battlefield", row = 0.54, width = 1150, height = 170, font = 70, click = "onClear", colour = DANGER },
  { id = "status", row = 0.84, width = 0, height = 0, font = 40, click = "noop", colour = CLEAR },
}

function geomFromBounds(visual, collider, scale, position)
  local g = { hx = REF.hx, hz = REF.hz, top = REF.top }
  scale = scale or { x = 1, y = 1, z = 1 }
  position = position or { x = 0, y = 0, z = 0 }
  if visual and visual.size and visual.size.x > 0 and visual.size.z > 0 then
    g.hx = visual.size.x / scale.x / 2
    g.hz = visual.size.z / scale.z / 2
    g.top = ((visual.center.y - position.y) + visual.size.y / 2) / scale.y
  end
  if collider and collider.size and collider.size.y > 0 then
    local top = ((collider.center.y - position.y) + collider.size.y / 2) / scale.y
    if top > g.top then g.top = top end
  end
  g.y = g.top + WIDGET_LIFT
  g.sx = g.hx / REF.hx
  g.sz = g.hz / REF.hz
  return g
end

function widgetExtent(spec)
  local half = { w = (spec.width or 0) / UNITS_PER_LOCAL / 2, h = (spec.height or 0) / HEIGHT_UNITS_PER_LOCAL / 2 }
  return {
    left = spec.position[1] - half.w,
    right = spec.position[1] + half.w,
    top = spec.position[3] - half.h,
    bottom = spec.position[3] + half.h,
  }
end

-- Screen right is local -x, as on the tracker.
function panelLayout(labels, geom)
  geom = geom or geomFromBounds()
  local fontScale = math.min(geom.sx, geom.sz)
  local specs = {}
  for _, b in ipairs(BUTTONS) do
    specs[#specs + 1] = {
      id = b.id,
      label = labels[b.id] or b.label or "",
      click_function = b.click,
      position = { -(b.col or 0) * geom.sx, geom.y, b.row * geom.sz },
      rotation = { 0, 0, 0 },
      width = math.floor(b.width * geom.sx + 0.5),
      height = math.floor(b.height * geom.sz + 0.5),
      font_size = math.floor(b.font * fontScale + 0.5),
      font_color = LIGHT,
      color = b.colour or PANEL,
    }
  end
  return specs
end

---------------------------------------------------------------- TTS glue --

state = newState()
scenarios = {}
maxSeed = 999999
status = "Fetching the scenario list..."
busy = false
buttonIndex = {}
geometry = nil

function onSave()
  return JSON.encode(state)
end

function onLoad(saved)
  local loaded = nil
  if saved and saved ~= "" then
    local ok, decoded = pcall(JSON.decode, saved)
    if ok then loaded = decoded end
  end
  state = normaliseState(loaded)
  math.randomseed(os.time())
  relayout()
  fetchScenarios()
end

function noop() end

function baseUrl()
  local importer = getObjectFromGUID(IMPORTER_GUID)
  local s = importer and importer.getTable("state")
  local url = s and s.baseUrl
  if type(url) ~= "string" or trimSlash(url) == "" then url = DEFAULT_BASE_URL end
  return trimSlash(url)
end

function relayout()
  geometry = geomFromBounds(self.getVisualBoundsNormalized(), self.getBoundsNormalized(), self.getScale(), self.getPosition())
  createButtons()
end

function labels()
  return {
    scenario = scenarioLabel(state, scenarios),
    board = boardLabel(state, scenarios),
    status = wrapText(status, STATUS_WRAP),
  }
end

function createButtons()
  self.clearButtons()
  buttonIndex = {}
  for i, spec in ipairs(panelLayout(labels(), geometry)) do
    local params = {}
    for k, v in pairs(spec) do
      if k ~= "id" then params[k] = v end
    end
    params.function_owner = self
    self.createButton(params)
    buttonIndex[spec.id] = i - 1
  end
end

function refresh()
  local l = labels()
  for _, id in ipairs({ "scenario", "board", "status" }) do
    self.editButton({ index = buttonIndex[id], label = l[id] })
  end
end

function setStatus(text)
  status = text
  refresh()
end

function requestFailed(request, what)
  if request.is_error then
    return "Can't reach " .. baseUrl() .. " for " .. what .. ": " .. tostring(request.error)
  end
  if request.response_code ~= 200 then
    local reason = ""
    local ok, body = pcall(JSON.decode, request.text or "")
    if ok and type(body) == "table" and type(body.error) == "table" and body.error.message then reason = ": " .. body.error.message end
    return string.format("HTTP %s for %s%s", tostring(request.response_code), what, reason)
  end
  return nil
end

function fetchScenarios(after)
  setStatus("Fetching the scenario list from " .. baseUrl() .. "...")
  WebRequest.get(listUrl(baseUrl()), function(request)
    local failed = requestFailed(request, "the scenario list")
    if failed then
      setStatus(failed .. ". Press any button to retry.")
      return
    end
    local ok, list = pcall(JSON.decode, request.text)
    local valid, why = false, "not JSON"
    if ok then valid, why = validateList(list) end
    if not valid then
      setStatus("Scenario list rejected: " .. why)
      return
    end
    scenarios = list.scenarios
    maxSeed = tonumber(list.maxSeed) or maxSeed
    clampState(state, scenarios)
    setStatus("Pick a scenario and a board, then Spawn battlefield.")
    if after then after() end
  end)
end

function withScenarios(action)
  if busy then return end
  if #scenarios == 0 then
    fetchScenarios(action)
  else
    action()
  end
end

function onPrevScenario()
  withScenarios(function() stepScenario(state, scenarios, -1); refresh() end)
end

function onNextScenario()
  withScenarios(function() stepScenario(state, scenarios, 1); refresh() end)
end

function onNextBoard()
  withScenarios(function() nextBoard(state, scenarios); refresh() end)
end

function onRandomBoard()
  withScenarios(function() randomBoard(state, maxSeed, math.random); refresh() end)
end

function clearBattlefield()
  local n = 0
  for _, tag in ipairs({ TERRAIN_TAG, OBJECTIVE_TAG }) do
    for _, obj in ipairs(getObjectsWithTag(tag)) do
      obj.destruct()
      n = n + 1
    end
  end
  return n
end

function onClear()
  if busy then return end
  setStatus("Cleared " .. clearBattlefield() .. " battlefield object(s).")
end

function onSpawn()
  withScenarios(function()
    local sc = currentScenario(state, scenarios)
    local seed = currentSeed(state, scenarios)
    busy = true
    setStatus(string.format("Fetching %s seed %d...", sc.name, seed))
    WebRequest.get(boardUrl(baseUrl(), sc.id, seed), function(request)
      onBoardResponse(request, sc, seed)
    end)
  end)
end

function onBoardResponse(request, sc, seed)
  local failed = requestFailed(request, sc.name .. " seed " .. seed)
  if failed then
    busy = false
    setStatus(failed)
    return
  end
  local ok, payload = pcall(JSON.decode, request.text)
  local valid, why = false, "not JSON"
  if ok then valid, why = validatePayload(payload, sc.id, seed) end
  if not valid then
    busy = false
    setStatus("Board rejected: " .. why)
    return
  end
  spawnBoard(payload, sc)
end

function spawnBoard(payload, sc)
  local removed = clearBattlefield()
  local spawned = {}
  for _, row in ipairs(payload.pieces) do
    spawned[#spawned + 1] = spawnObjectData({ data = buildState(payload, row) })
  end
  setStatus(string.format("%s seed %d: %d pieces spawned (%d removed); placing %d objective(s) once they load...",
    sc.name, payload.seed, #spawned, removed, #payload.objectives))
  -- Markers seat themselves on the terrain under them, so they go down after it has loaded.
  local function place()
    local placed = placeObjectives(payload.objectives)
    busy = false
    setStatus(string.format("%s seed %d: %d pieces, %d objective(s).", sc.name, payload.seed, #spawned, placed))
  end
  Wait.condition(place, function()
    for _, o in ipairs(spawned) do
      if o and not o.isDestroyed() and (o.spawning or o.loading_custom) then return false end
    end
    return true
  end, SPAWN_SETTLE_SECONDS, place)
end

function placeObjectives(objectives)
  local bag = getObjectFromGUID(OBJECTIVE_BAG)
  if not bag then return 0 end
  local n = 0
  for _, spec in ipairs(objectives or {}) do
    local ring = { ringIn = spec.ringIn, band = spec.band }
    bag.takeObject({
      position = { x = spec.posX, y = MARKER_DROP_Y, z = spec.posZ },
      smooth = false,
      callback_function = function(marker)
        marker.call("setRingRadius", ring)
      end,
    })
    n = n + 1
  end
  return n
end
