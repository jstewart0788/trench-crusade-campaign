-- FTC-GUID: 47de64
-- Battlefield panel (TC-022a): pick a scenario and a board, fetch it from the
-- campaign API (/api/battlefields, packages/battlefield on the server) and
-- spawn it with its objectives: a marker disc on open ground, or the objective
-- symbol and the 1" aura on the terrain piece that covers the objective. Only
-- objects tagged tc-terrain and objective markers (tc-token:objective) are ever
-- removed.
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
MARKER_READY_SECONDS = 10
STATUS_WRAP = 44
-- A covered objective: the whole piece is the Objective (rulebook p152), so the piece
-- carries the symbol and its 1" band instead of a marker.
COVER_TAG = "tc-objective"
SYMBOL_URL = "https://tc.rynfin.org/tts/objective-symbol.png"
SYMBOL_IN = 40 / 25.4
AURA_COLOR = { 1, 1, 1 }
AURA_THICKNESS = 0.06
-- Above the surface the piece stands on: the band 1" outside its footprint, where walls
-- rarely hide it, and the symbol on the piece's own floor.
AURA_LIFT_IN = 0.06
SYMBOL_LIFT_IN = 0.1
GROUND_TAG = "tc-role:ground"
ARCHETYPE_NAMES = { ["trench-lines"] = "Trench Lines", ["no-mans-land"] = "No Man's Land" }

function listUrl(base)
  return trimSlash(base) .. "/api/battlefields"
end

function boardUrl(base, scenarioId, seed, archetype)
  local url = trimSlash(base) .. "/api/battlefields/" .. scenarioId .. "/" .. tostring(math.floor(seed))
  if archetype then url = url .. "?archetype=" .. archetype end
  return url
end

function trimSlash(s)
  return (tostring(s or ""):gsub("%s+$", ""):gsub("^%s+", ""):gsub("/+$", ""))
end

function newState()
  return { scenarioIndex = 1, boardIndex = 1, randomSeed = nil, archetype = nil }
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
  if type(loaded.archetype) == "string" and loaded.archetype:match("^[a-z-]+$") then s.archetype = loaded.archetype end
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
  state.archetype = currentArchetype(state, scenarios)
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
  state.archetype = nil
end

-- The archetypes the player may choose between ("any battlefield archetype", Great War
-- p195, From Below); empty when the scenario's archetype is fixed. The first is the
-- scenario's own.
function selectableArchetypes(sc)
  if sc and type(sc.archetypes) == "table" and #sc.archetypes > 1 then return sc.archetypes end
  return {}
end

-- The archetype the board is asked for, nil for the scenario's own.
function currentArchetype(state, scenarios)
  if not state.archetype then return nil end
  for _, a in ipairs(selectableArchetypes(currentScenario(state, scenarios))) do
    if a == state.archetype then return a end
  end
  return nil
end

function stepArchetype(state, scenarios)
  local list = selectableArchetypes(currentScenario(state, scenarios))
  if #list == 0 then return end
  local at = 1
  for i, a in ipairs(list) do if a == currentArchetype(state, scenarios) then at = i end end
  state.archetype = list[wrap(at + 1, #list)]
end

function archetypeLabel(state, scenarios)
  local list = selectableArchetypes(currentScenario(state, scenarios))
  if #list == 0 then return nil end
  local a = currentArchetype(state, scenarios) or list[1]
  return "Archetype: " .. (ARCHETYPE_NAMES[a] or a)
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
function randomBoard(state, maxSeed, rnd, scenarios)
  state.randomSeed = rnd(1, maxSeed)
  local list = selectableArchetypes(scenarios and currentScenario(state, scenarios))
  if #list > 0 then state.archetype = list[rnd(1, #list)] end
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

function validatePayload(p, scenarioId, seed, archetype)
  if type(p) ~= "table" or p.version ~= PAYLOAD_VERSION then return false, "not a " .. PAYLOAD_VERSION .. " board" end
  if p.scenarioId ~= scenarioId or tonumber(p.seed) ~= seed then return false, "the server sent a different board" end
  if archetype and p.archetype ~= archetype then return false, "the server sent a different archetype" end
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

-- What a covering piece is drawn with: the band (its footprint grown by 1", world x/z
-- points from the generator) as a vector line just above the surface the piece stands
-- on, and the symbol as a decal on the piece's floor over the objective point. surfaceY
-- is that surface's world y; toLocal is the piece's positionToLocal; scale its getScale().
function coverMarks(spec, surfaceY, scale, toLocal)
  local points = {}
  for i, pt in ipairs(spec.band) do
    local l = toLocal({ x = pt[1], y = surfaceY + AURA_LIFT_IN, z = pt[2] })
    points[i] = { x = l.x, y = l.y, z = l.z }
  end
  local at = toLocal({ x = spec.posX, y = surfaceY + SYMBOL_LIFT_IN, z = spec.posZ })
  return {
    lines = { { points = points, color = AURA_COLOR, thickness = AURA_THICKNESS } },
    decals = { {
      name = COVER_TAG .. ":" .. spec.id,
      url = SYMBOL_URL,
      position = { x = at.x, y = at.y, z = at.z },
      rotation = { x = 90, y = 0, z = 0 },
      scale = { x = SYMBOL_IN / scale.x, y = SYMBOL_IN / scale.z, z = 1 },
    } },
  }
end

function isCovered(spec)
  return type(spec.band) == "table" and #spec.band > 1
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
  { id = "scenario", row = -0.86, width = 0, height = 0, font = 70, click = "noop", colour = CLEAR },
  { id = "prevScenario", label = "< Scenario", row = -0.62, col = -0.72, width = 560, height = 150, font = 60, click = "onPrevScenario" },
  { id = "nextScenario", label = "Scenario >", row = -0.62, col = 0.72, width = 560, height = 150, font = 60, click = "onNextScenario" },
  -- Shown only for scenarios that let the player pick the archetype.
  { id = "archetype", row = -0.38, width = 1150, height = 150, font = 60, click = "onArchetype", optional = true },
  { id = "board", row = -0.15, width = 0, height = 0, font = 65, click = "noop", colour = CLEAR },
  { id = "nextBoard", label = "Next board", row = 0.07, col = -0.72, width = 560, height = 150, font = 60, click = "onNextBoard" },
  { id = "randomBoard", label = "Random board", row = 0.07, col = 0.72, width = 560, height = 150, font = 60, click = "onRandomBoard" },
  { id = "spawn", label = "Spawn battlefield", row = 0.31, width = 1150, height = 150, font = 70, click = "onSpawn", colour = SPAWN },
  { id = "clear", label = "Clear battlefield", row = 0.55, width = 1150, height = 150, font = 70, click = "onClear", colour = DANGER },
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
    local hidden = b.optional and labels[b.id] == nil
    specs[#specs + 1] = {
      id = b.id,
      label = labels[b.id] or b.label or "",
      click_function = b.click,
      position = { -(b.col or 0) * geom.sx, geom.y, b.row * geom.sz },
      rotation = { 0, 0, 0 },
      width = hidden and 0 or math.floor(b.width * geom.sx + 0.5),
      height = hidden and 0 or math.floor(b.height * geom.sz + 0.5),
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
  restoreCovers()
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
    archetype = archetypeLabel(state, scenarios),
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
  for _, spec in ipairs(panelLayout(l, geometry)) do
    if spec.id == "scenario" or spec.id == "board" or spec.id == "status" or spec.id == "archetype" then
      self.editButton({ index = buttonIndex[spec.id], label = spec.label, width = spec.width, height = spec.height })
    end
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
  withScenarios(function() randomBoard(state, maxSeed, math.random, scenarios); refresh() end)
end

function onArchetype()
  withScenarios(function() stepArchetype(state, scenarios); refresh() end)
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
    local archetype = currentArchetype(state, scenarios)
    busy = true
    setStatus(string.format("Fetching %s seed %d...", sc.name, seed))
    WebRequest.get(boardUrl(baseUrl(), sc.id, seed, archetype), function(request)
      onBoardResponse(request, sc, seed, archetype)
    end)
  end)
end

function onBoardResponse(request, sc, seed, archetype)
  local failed = requestFailed(request, sc.name .. " seed " .. seed)
  if failed then
    busy = false
    setStatus(failed)
    return
  end
  local ok, payload = pcall(JSON.decode, request.text)
  local valid, why = false, "not JSON"
  if ok then valid, why = validatePayload(payload, sc.id, seed, archetype) end
  if not valid then
    busy = false
    setStatus("Board rejected: " .. why)
    return
  end
  spawnBoard(payload, sc)
end

function spawnBoard(payload, sc)
  local removed = clearBattlefield()
  local spawned, covers = {}, {}
  for _, row in ipairs(payload.pieces) do
    local obj = spawnObjectData({ data = buildState(payload, row) })
    spawned[#spawned + 1] = obj
    if row[6] ~= nil and row[6] ~= "" then covers[row[6]] = obj end
  end
  setStatus(string.format("%s seed %d: %d pieces spawned (%d removed); placing %d objective(s) once they load...",
    sc.name, payload.seed, #spawned, removed, #payload.objectives))
  -- Markers seat themselves on the terrain under them, so they go down after it has loaded.
  local function place()
    local onTerrain, markers = placeObjectives(payload.objectives, covers)
    busy = false
    setStatus(string.format("%s seed %d: %d pieces, %d objective(s): %d on terrain, %d marker(s).",
      sc.name, payload.seed, #spawned, onTerrain + markers, onTerrain, markers))
  end
  Wait.condition(place, function()
    for _, o in ipairs(spawned) do
      if o and not o.isDestroyed() and (o.spawning or o.loading_custom) then return false end
    end
    return true
  end, SPAWN_SETTLE_SECONDS, place)
end

-- The generator sends the surface; a piece marked before it did (its memo has none) uses
-- the highest ground tile under the objective point, else its own bottom.
function coverSurface(obj, spec)
  if tonumber(spec.surfaceY) then return tonumber(spec.surfaceY) end
  local best = nil
  for _, g in ipairs(getObjectsWithTag(GROUND_TAG)) do
    local b = g.getBounds()
    if math.abs(spec.posX - b.center.x) <= b.size.x / 2 and math.abs(spec.posZ - b.center.z) <= b.size.z / 2 then
      local top = b.center.y + b.size.y / 2
      if best == nil or top > best then best = top end
    end
  end
  if best then return best end
  local b = obj.getBounds()
  return b.center.y - b.size.y / 2
end

function markCover(obj, spec)
  local marks = coverMarks(spec, coverSurface(obj, spec), obj.getScale(), function(v) return obj.positionToLocal(v) end)
  obj.setVectorLines(marks.lines)
  obj.setDecals(marks.decals)
  obj.addTag(COVER_TAG)
  obj.addTag(COVER_TAG .. ":" .. spec.id)
  obj.memo = JSON.encode({ id = spec.id, label = spec.label, posX = spec.posX, posZ = spec.posZ, band = spec.band, surfaceY = spec.surfaceY })
end

-- Re-draws covered pieces after a load from what markCover kept in their memo.
function restoreCovers()
  for _, obj in ipairs(getObjectsWithTag(COVER_TAG)) do
    local ok, spec = pcall(JSON.decode, obj.memo or "")
    if ok and type(spec) == "table" and isCovered(spec) then
      Wait.condition(function()
        if not obj.isDestroyed() then markCover(obj, spec) end
      end, function() return obj.isDestroyed() or not (obj.spawning or obj.loading_custom) end, SPAWN_SETTLE_SECONDS)
    end
  end
end

-- A marker's script only takes setRingRadius once it has loaded and settled (it sets
-- `ready`); a call made from takeObject's callback is lost when onLoad runs.
function whenReady(marker, fn)
  local function go()
    if not marker.isDestroyed() then fn() end
  end
  Wait.condition(go, function() return marker.isDestroyed() or marker.getVar("ready") == true end, MARKER_READY_SECONDS, go)
end

function placeObjectives(objectives, covers)
  local bag = getObjectFromGUID(OBJECTIVE_BAG)
  local onTerrain, markers = 0, 0
  for _, spec in ipairs(objectives or {}) do
    local cover = covers and covers[spec.id]
    if cover and not cover.isDestroyed() and isCovered(spec) then
      markCover(cover, spec)
      onTerrain = onTerrain + 1
    elseif bag then
      local ring = { ringIn = spec.ringIn }
      bag.takeObject({
        position = { x = spec.posX, y = MARKER_DROP_Y, z = spec.posZ },
        smooth = false,
        callback_function = function(marker)
          whenReady(marker, function() marker.call("setRingRadius", ring) end)
        end,
      })
      markers = markers + 1
    end
  end
  return onTerrain, markers
end
