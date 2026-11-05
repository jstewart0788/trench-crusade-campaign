-- Offline test for the Turn Tracker's pure half (mod/scripts/4ac9e3.lua).
--
--     lua mod/test/tracker_test.lua        (from the repo root; pnpm mod:test)
--
-- Loads the tracker script under plain Lua and checks the token tags, the
-- turn/phase state transitions, the initiative roll-off, the Success Roll
-- table and the morale reminder. Nothing here touches TTS.

local here = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = here .. "/../.."
local SCRIPT = root .. "/mod/scripts/4ac9e3.lua"

---------------------------------------------------------------- harness --

local failures = 0
local checks = 0

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

-- The script's top level touches no TTS global; JSON is only used by the glue.
JSON = { decode = function() return nil end, encode = function() return "{}" end }
dofile(SCRIPT)

---------------------------------------------------------------- tags --

do
  eq(tokenTag("activated"), "tc-token:activated", "activated tag")
  eq(tokenTag("down"), "tc-token:down", "down tag")
  eq(#TOKEN_ROLES, 6, "six token roles")
  for _, role in ipairs(TOKEN_ROLES) do
    eq(roleFromTag(tokenTag(role)), role, "round trip " .. role)
  end
  eq(roleFromTag("tc-token:stealth"), nil, "unknown role is rejected")
  eq(roleFromTag("tc-warband:NA-TEST-01"), nil, "importer tags are not token tags")
  eq(roleFromTag(nil), nil, "nil tag")
  eq(roleFromTag("activated"), nil, "bare role without the prefix")
end

---------------------------------------------------------------- state --

do
  local s = newState()
  eq(s.turn, 1, "new state starts on turn 1")
  eq(s.phase, 1, "new state starts in the Initiative Phase")
  eq(s.shaken.Red, false, "Red not shaken")
  eq(s.shaken.Blue, false, "Blue not shaken")
  eq(#PHASES, 3, "three phases")
  eq(PHASES[1] .. "/" .. PHASES[2] .. "/" .. PHASES[3], "Initiative/Activation/Morale", "phase order follows rulebook p32")
  eq(phaseLabel(s), "Turn 1 - Initiative Phase", "label")

  local loaded = normaliseState({ turn = 4, phase = 3, shaken = { Red = true, Blue = "yes" } })
  eq(loaded.turn, 4, "turn restored")
  eq(loaded.phase, 3, "phase restored")
  eq(loaded.shaken.Red, true, "Red shaken restored")
  eq(loaded.shaken.Blue, false, "non-boolean shaken is false")

  local garbage = normaliseState({ turn = -2, phase = 9, shaken = "x" })
  eq(garbage.turn, 1, "negative turn falls back")
  eq(garbage.phase, 1, "out-of-range phase falls back")
  eq(garbage.shaken.Blue, false, "garbage shaken falls back")
  eq(normaliseState(nil).turn, 1, "nil state is the default")
  eq(normaliseState({ turn = "7", phase = "2" }).turn, 7, "numeric strings are accepted")
  eq(normaliseState({ turn = 2.9 }).turn, 2, "fractional turn is floored")
end

---------------------------------------------------------------- transitions --

do
  local s = newState()
  local text = startTurn(s, 3)
  eq(s.phase, 2, "start turn enters the Activation Phase")
  eq(s.turn, 1, "start turn does not change the turn")
  check(text:find("Turn 1 - Activation Phase", 1, true) ~= nil, "start turn announces the phase")
  check(text:find("Cleared 3 Activated token(s)", 1, true) ~= nil, "start turn reports the cleared count")
  check(startTurn(newState()):find("Cleared 0", 1, true) ~= nil, "cleared count defaults to zero")

  text = nextTurn(s)
  eq(s.turn, 2, "next turn increments")
  eq(s.phase, 1, "next turn returns to the Initiative Phase")
  check(text:find("Turn 2 - Initiative Phase", 1, true) ~= nil, "next turn announces the new turn")
  check(text:find("Down and Out of Action do not count", 1, true) ~= nil, "next turn restates the initiative rule")

  eq(setPhase(s, 3), 3, "set phase 3")
  eq(setPhase(s, 0), 1, "phase clamps low")
  eq(setPhase(s, 7), 3, "phase clamps high")

  eq(toggleShaken(s, "Red"), true, "toggle on")
  eq(shakenLabel(s, "Red"), "Red Shaken: YES", "shaken label on")
  check(describeShaken(s, "Red"):find("Risky", 1, true) ~= nil, "shaken description names the risky-roll consequence")
  eq(toggleShaken(s, "Red"), false, "toggle off")
  eq(shakenLabel(s, "Red"), "Red Shaken: no", "shaken label off")
  check(describeShaken(s, "Red"):find("no longer", 1, true) ~= nil, "unshaken description")
  eq(s.shaken.Blue, false, "toggling Red leaves Blue alone")
end

---------------------------------------------------------------- roll-off --

do
  eq(rollOff(6, 1), "Red", "red wins")
  eq(rollOff(2, 5), "Blue", "blue wins")
  eq(rollOff(4, 4), nil, "tie")
  local text, winner = describeRollOff(3, 5)
  eq(winner, "Blue", "described winner")
  eq(text, "Initiative roll-off: Red 3, Blue 5 - Blue has the Initiative.", "winner text")
  local tieText, tieWinner = describeRollOff(2, 2)
  eq(tieWinner, nil, "described tie")
  check(tieText:find("tied, roll again", 1, true) ~= nil, "tie text asks for a re-roll")
end

---------------------------------------------------------------- success roll --

do
  for a = 1, 6 do
    for b = 1, 6 do
      local r = successRoll(a, b)
      local total = a + b
      eq(r.total, total, string.format("total %d+%d", a, b))
      local expected = "failure"
      if total >= 12 then expected = "critical" elseif total >= 7 then expected = "success" end
      eq(r.result, expected, string.format("result %d+%d", a, b))
    end
  end
  eq(successRoll(1, 5).result, "failure", "6 fails")
  eq(successRoll(1, 6).result, "success", "7 succeeds")
  eq(successRoll(6, 6).result, "critical", "12 is a critical")
end

---------------------------------------------------------------- morale --

do
  local s = newState()
  s.turn = 3
  local lines = moraleSummary(s, 4)
  eq(#lines, 2, "two lines when nobody is shaken")
  check(lines[1]:find("Turn 3", 1, true) ~= nil, "morale names the turn")
  check(lines[1]:find("half its models Down or Out of Action", 1, true) ~= nil, "morale restates the threshold")
  check(lines[2]:find("4 Down token(s)", 1, true) ~= nil, "morale reports the down count")
  s.shaken.Blue = true
  lines = moraleSummary(s, 0)
  eq(#lines, 3, "a shaken side adds a line")
  check(lines[3]:find("Blue is Shaken", 1, true) ~= nil, "the shaken side is named")
  check(moraleSummary(newState())[2]:find("0 Down", 1, true) ~= nil, "down count defaults to zero")
end

---------------------------------------------------------------- counting --

do
  local entries = {
    { tags = { "tc-token:down" } },
    { tags = { "tc-warband:X", "tc-token:down" } },
    { tags = { "tc-token:activated" } },
    { tags = {} },
    {},
  }
  eq(countTagged(entries, "down"), 2, "down tokens counted once each")
  eq(countTagged(entries, "activated"), 1, "activated tokens counted")
  eq(countTagged(entries, "blood"), 0, "absent role counts zero")
  eq(countTagged({}, "down"), 0, "empty table")
end

---------------------------------------------------------------- wiring --

do
  check(TURN_COUNTERS.Red:match("^%x%x%x%x%x%x$") ~= nil, "Red turn counter GUID shape")
  check(TURN_COUNTERS.Blue:match("^%x%x%x%x%x%x$") ~= nil, "Blue turn counter GUID shape")
  check(TURN_COUNTERS.Red ~= TURN_COUNTERS.Blue, "turn counters differ")
  eq(RULES_SHELF.x, 102, "rules shelf x matches the shelf objects")
end

print(string.format("tracker_test: %d checks, %d failed", checks, failures))
if failures > 0 then os.exit(1) end
