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

---------------------------------------------------------------- TTS glue --

state = newState()

BUTTONS = {
  { id = "label", label = "", z = -0.78, w = 1700, h = 0, font = 95, click = "noop", display = true },
  { id = "rollOff", label = "Initiative roll-off", z = -0.52, w = 1700, h = 210, font = 90, click = "onRollOff" },
  { id = "startTurn", label = "Start turn (clear Activated)", z = -0.26, w = 1700, h = 210, font = 90, click = "onStartTurn" },
  { id = "morale", label = "Morale reminder", z = 0.0, w = 1700, h = 210, font = 90, click = "onMorale" },
  { id = "nextTurn", label = "Next turn", z = 0.26, w = 1700, h = 210, font = 90, click = "onNextTurn" },
  { id = "shakenRed", label = "", z = 0.52, x = -0.43, w = 820, h = 210, font = 80, click = "onToggleShakenRed", colour = { 0.55, 0.12, 0.12 } },
  { id = "shakenBlue", label = "", z = 0.52, x = 0.43, w = 820, h = 210, font = 80, click = "onToggleShakenBlue", colour = { 0.12, 0.3, 0.6 } },
  { id = "rules", label = "Rules shelf", z = 0.78, w = 1700, h = 210, font = 90, click = "onRulesShelf" },
}

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
  createButtons()
  refreshLabels()
end

function noop() end

function createButtons()
  self.clearButtons()
  for _, b in ipairs(BUTTONS) do
    local params = {
      click_function = b.click,
      function_owner = self,
      label = b.label,
      position = { b.x or 0, 0.15, b.z },
      width = b.w,
      height = b.h,
      font_size = b.font,
      font_color = { 1, 1, 1 },
      color = b.colour or { 0.2, 0.2, 0.2 },
    }
    if b.display then
      params.color = { 0, 0, 0, 0 }
      params.font_color = { 0.85, 0.7, 0.32 }
    end
    self.createButton(params)
  end
end

function buttonIndex(id)
  for i, b in ipairs(BUTTONS) do
    if b.id == id then return i - 1 end
  end
  return nil
end

function refreshLabels()
  self.editButton({ index = buttonIndex("label"), label = phaseLabel(state) })
  for _, side in ipairs(SIDES) do
    self.editButton({ index = buttonIndex("shaken" .. side), label = shakenLabel(state, side) })
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
