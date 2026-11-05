-- Turn Tracker (TC-017). Quality-of-life helpers for the Trench Crusade turn
-- (rulebook p32): an Initiative roll-off, Start turn (clears every Activated
-- token on the table), a Morale reminder, Next turn (sets the Turn counters),
-- per-side Shaken flags and a camera jump to the rules shelf. It enforces
-- nothing.
--
-- Everything above the "TTS glue" line touches no TTS global so
-- mod/test/tracker_test.lua can exercise it under plain Lua. TTS runs
-- MoonSharp (Lua 5.2): no `//`, no goto, no integer/float distinctions.

TOKEN_TAG_PREFIX = "tc-token:"
TOKEN_ROLES = { "blood", "blessing", "down", "activated", "tough", "objective" }

PHASES = { "Initiative", "Activation", "Morale" }
SIDES = { "Red", "Blue" }

-- The ported Scripted Table "Turn" counters, one per side (mod/ANATOMY.md).
TURN_COUNTERS = { Red = "0e8265", Blue = "f14264" }

-- The rules shelf (six PDFs on LCT's raised ledge past the Start Menu).
RULES_SHELF = { x = 102, y = 9.5, z = 0 }
RULES_CAMERA = { pitch = 55, yaw = 270, distance = 90 }

SUCCESS_THRESHOLD = 7
CRITICAL_THRESHOLD = 12

function tokenTag(role)
  return TOKEN_TAG_PREFIX .. role
end

function roleFromTag(tag)
  if type(tag) ~= "string" then return nil end
  if tag:sub(1, #TOKEN_TAG_PREFIX) ~= TOKEN_TAG_PREFIX then return nil end
  local role = tag:sub(#TOKEN_TAG_PREFIX + 1)
  for _, known in ipairs(TOKEN_ROLES) do
    if known == role then return role end
  end
  return nil
end

function newState()
  return { turn = 1, phase = 1, shaken = { Red = false, Blue = false } }
end

-- Fills gaps and discards garbage in a loaded state so the glue never indexes
-- nil after a save made by an older script.
function normaliseState(loaded)
  local state = newState()
  if type(loaded) ~= "table" then return state end
  local turn = tonumber(loaded.turn)
  if turn and turn >= 1 then state.turn = math.floor(turn) end
  local phase = tonumber(loaded.phase)
  if phase and phase >= 1 and phase <= #PHASES then state.phase = math.floor(phase) end
  if type(loaded.shaken) == "table" then
    for _, side in ipairs(SIDES) do
      state.shaken[side] = loaded.shaken[side] == true
    end
  end
  return state
end

function phaseLabel(state)
  return string.format("Turn %d - %s Phase", state.turn, PHASES[state.phase])
end

function setPhase(state, index)
  if index < 1 then index = 1 end
  if index > #PHASES then index = #PHASES end
  state.phase = index
  return state.phase
end

-- Start turn: the Activation Phase begins and every Activated token is cleared.
function startTurn(state, clearedCount)
  setPhase(state, 2)
  return string.format("%s. Cleared %d Activated token(s). Alternate activations; the player with the Initiative chooses who goes first.",
    phaseLabel(state), clearedCount or 0)
end

-- Next turn: Turn + 1, back to the Initiative Phase.
function nextTurn(state)
  state.turn = state.turn + 1
  setPhase(state, 1)
  return string.format("%s. Fewest models on the table (Down and Out of Action do not count) has the Initiative; tied, roll off.",
    phaseLabel(state))
end

-- Initiative roll-off (rulebook p32): highest die wins, ties roll again.
function rollOff(redRoll, blueRoll)
  if redRoll > blueRoll then return "Red" end
  if blueRoll > redRoll then return "Blue" end
  return nil
end

function describeRollOff(redRoll, blueRoll)
  local winner = rollOff(redRoll, blueRoll)
  if winner then
    return string.format("Initiative roll-off: Red %d, Blue %d - %s has the Initiative.", redRoll, blueRoll, winner), winner
  end
  return string.format("Initiative roll-off: Red %d, Blue %d - tied, roll again.", redRoll, blueRoll), nil
end

-- Success Roll (rulebook p15): 2-6 failure, 7-11 success, 12+ critical.
function successRoll(firstDie, secondDie)
  local total = firstDie + secondDie
  local result = "failure"
  if total >= CRITICAL_THRESHOLD then
    result = "critical"
  elseif total >= SUCCESS_THRESHOLD then
    result = "success"
  end
  return { total = total, result = result }
end

function toggleShaken(state, side)
  state.shaken[side] = not state.shaken[side]
  return state.shaken[side]
end

function shakenLabel(state, side)
  return side .. " Shaken: " .. (state.shaken[side] and "YES" or "no")
end

function describeShaken(state, side)
  if state.shaken[side] then
    return side .. " warband is Shaken: all its Success Rolls are Risky, and it must pass a Morale check in the next Morale Phase or flee and lose (p21)."
  end
  return side .. " warband is no longer Shaken."
end

-- Morale reminder (rulebook p21). Down tokens carry no colour, so the count is
-- for the whole table; per-side bookkeeping stays with the players.
function moraleSummary(state, downCount)
  local lines = {
    string.format("Morale Phase, Turn %d: a warband with at least half its models Down or Out of Action (rounded up) must pass a Success Roll (7+) or become Shaken.", state.turn),
    string.format("%d Down token(s) on the table (both sides together).", downCount or 0),
  }
  for _, side in ipairs(SIDES) do
    if state.shaken[side] then
      lines[#lines + 1] = side .. " is Shaken and must roll regardless: fail and it flees."
    end
  end
  return lines
end

-- Counts entries whose tag list carries the role's tag. Works on plain tables
-- ({ tags = {...} }) so the test can drive it; the glue passes TTS objects
-- through objectTags.
function countTagged(entries, role)
  local wanted = tokenTag(role)
  local count = 0
  for _, entry in ipairs(entries) do
    for _, tag in ipairs(entry.tags or {}) do
      if tag == wanted then
        count = count + 1
        break
      end
    end
  end
  return count
end

---------------------------------------------------------------- widgets --

-- Classic 3D buttons laid out for the tile face TTS reports at load, the same
-- scheme as the Warband Importer (mod/scripts/b91983.lua, which carries the
-- sources). Measured live on 2026-11-04 (scripts/tts_exec.py) on 4ac9e3 at
-- scale (4,1,4): visual bounds size (10.667, 0.2, 8) centred 0.1 above the
-- object position, so the face is local x -1.333..1.333 by z -1..1 (the 4:3
-- board image, not the square save.json asks for), the mesh spans local
-- y 0..0.2 with the pivot on the bottom face, and the collider (14.127, 0.2, 8)
-- is wider than the face. Buttons at y 0.15 sat inside the slab and never
-- rendered; the live-tuned layout below (y 0.30, width 1150, height 170, font
-- 70, the Shaken pair 560 wide at x +-0.72) is what Jonathan accepted on
-- screen. width/height/font_size are 1/500 of a local unit (a width-900
-- button spans two thirds of a 16-unit face at scale 6).
REF = { hx = 1.333, hz = 1.0, top = 0.2 }
UNITS_PER_LOCAL = 500
HEIGHT_UNITS_PER_LOCAL = 650
WIDGET_LIFT = 0.1

LIGHT = { 0.95, 0.92, 0.85 }
PANEL = { 0.12, 0.12, 0.12 }
CLEAR = { 0, 0, 0, 0 }
RED_SIDE = { 0.55, 0.12, 0.12 }
BLUE_SIDE = { 0.12, 0.3, 0.6 }

-- Rows are 0.27 apart (the live-tuned 0.26 nudged so 170-tall buttons clear
-- each other at HEIGHT_UNITS_PER_LOCAL); the Shaken labels are filled at
-- layout time from the state, so match buttons by id, never by label.
BUTTONS = {
  { id = "label", label = "", row = -0.81, width = 0, height = 0, font = 80, click = "noop", colour = CLEAR },
  { id = "rollOff", label = "Initiative roll-off", row = -0.54, width = 1150, height = 170, font = 70, click = "onRollOff" },
  { id = "startTurn", label = "Start turn (clear Activated)", row = -0.27, width = 1150, height = 170, font = 70, click = "onStartTurn" },
  { id = "morale", label = "Morale reminder", row = 0.0, width = 1150, height = 170, font = 70, click = "onMorale" },
  { id = "nextTurn", label = "Next turn", row = 0.27, width = 1150, height = 170, font = 70, click = "onNextTurn" },
  { id = "shakenRed", label = "", row = 0.54, col = -0.72, width = 560, height = 170, font = 60, click = "onToggleShakenRed", colour = RED_SIDE },
  { id = "shakenBlue", label = "", row = 0.54, col = 0.72, width = 560, height = 170, font = 60, click = "onToggleShakenBlue", colour = BLUE_SIDE },
  { id = "rules", label = "Rules shelf", row = 0.81, width = 1150, height = 170, font = 70, click = "onRulesShelf" },
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

-- Screen right is local -x (labels keep rotation {0,0,0}, top at local -z,
-- and the tile's rotY 270 turns that toward +x, the way the seats face).
function trackerLayout(state, geom)
  geom = geom or geomFromBounds()
  local fontScale = geom.sx
  if geom.sz < fontScale then fontScale = geom.sz end
  local specs = {}
  for _, b in ipairs(BUTTONS) do
    local label = b.label
    if b.id == "label" then label = phaseLabel(state) end
    if b.id == "shakenRed" then label = shakenLabel(state, "Red") end
    if b.id == "shakenBlue" then label = shakenLabel(state, "Blue") end
    specs[#specs + 1] = {
      id = b.id,
      label = label,
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

function describeGeometry(name, geom, scale, visual, specs)
  local first, last = specs[1], specs[#specs]
  local function p(spec)
    if not spec then return "-" end
    return string.format("%s(%.2f,%.2f,%.2f)", spec.id, spec.position[1], spec.position[2], spec.position[3])
  end
  local size = "n/a"
  if visual and visual.size then size = string.format("%.2fx%.2fx%.2f", visual.size.x, visual.size.y, visual.size.z) end
  return string.format("[%s] visual %s scale %.2f,%.2f,%.2f half %.3fx%.3f top %.2f y %.2f units/local %d first %s last %s",
    name, size, scale.x, scale.y, scale.z, geom.hx, geom.hz, geom.top, geom.y, UNITS_PER_LOCAL, p(first), p(last))
end

---------------------------------------------------------------- TTS glue --

state = newState()
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
end

function noop() end

-- Re-measures the face and rebuilds the buttons; also callable from the
-- console: getObjectFromGUID("4ac9e3").call("relayout").
function relayout()
  local visual = self.getVisualBoundsNormalized()
  local scale = self.getScale()
  geometry = geomFromBounds(visual, self.getBoundsNormalized(), scale, self.getPosition())
  createButtons()
  print(describeGeometry(self.getName(), geometry, scale, visual, trackerLayout(state, geometry)))
end

function createButtons()
  self.clearButtons()
  buttonIndex = {}
  for i, spec in ipairs(trackerLayout(state, geometry)) do
    local params = {}
    for k, v in pairs(spec) do
      if k ~= "id" then params[k] = v end
    end
    params.function_owner = self
    self.createButton(params)
    buttonIndex[spec.id] = i - 1
  end
end

function refreshLabels()
  self.editButton({ index = buttonIndex.label, label = phaseLabel(state) })
  for _, side in ipairs(SIDES) do
    self.editButton({ index = buttonIndex["shaken" .. side], label = shakenLabel(state, side) })
  end
end

function say(text, colour)
  broadcastToAll(text, colour or { 0.85, 0.7, 0.32 })
end

function objectTags(objects)
  local entries = {}
  for _, obj in ipairs(objects) do
    entries[#entries + 1] = { tags = obj.getTags() }
  end
  return entries
end

function onRollOff(_, clicker)
  local redRoll = math.random(1, 6)
  local blueRoll = math.random(1, 6)
  local text, winner = describeRollOff(redRoll, blueRoll)
  say(text, winner or { 1, 1, 1 })
end

function onStartTurn(_, clicker)
  local cleared = 0
  for _, obj in ipairs(getObjectsWithTag(tokenTag("activated"))) do
    obj.destruct()
    cleared = cleared + 1
  end
  say(startTurn(state, cleared))
  refreshLabels()
end

function onMorale(_, clicker)
  setPhase(state, 3)
  local downCount = countTagged(objectTags(getObjectsWithTag(tokenTag("down"))), "down")
  for _, line in ipairs(moraleSummary(state, downCount)) do
    printToAll(line, { 0.85, 0.7, 0.32 })
  end
  refreshLabels()
end

function onNextTurn(_, clicker)
  say(nextTurn(state))
  for _, side in ipairs(SIDES) do
    local counter = getObjectFromGUID(TURN_COUNTERS[side])
    if counter then counter.call("setValue", state.turn) end
  end
  refreshLabels()
end

function onToggleShakenRed(_, clicker) toggleShakenSide("Red") end
function onToggleShakenBlue(_, clicker) toggleShakenSide("Blue") end

function toggleShakenSide(side)
  toggleShaken(state, side)
  say(describeShaken(state, side), side)
  refreshLabels()
end

function onRulesShelf(_, clicker)
  local player = Player[clicker]
  if not player then return end
  player.lookAt({
    position = { x = RULES_SHELF.x, y = RULES_SHELF.y, z = RULES_SHELF.z },
    pitch = RULES_CAMERA.pitch,
    yaw = RULES_CAMERA.yaw,
    distance = RULES_CAMERA.distance,
  })
end
