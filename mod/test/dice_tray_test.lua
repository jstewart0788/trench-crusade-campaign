-- Offline test for the dice tray (mod/scripts/acae21.lua) and the opponent board
-- (mod/scripts/e24b01.lua), their pure halves.
--
--     lua mod/test/dice_tray_test.lua        (from the repo root; pnpm mod:test)
--
-- Checks the keep rule in every mode (Deadly and -DICE included), the 12-dice cap, the chat
-- line, that every die slot, value label and the kept bracket sit inside the dice zone and
-- line up with slotU, that every text row is a real-sized button on an opaque backing whose
-- text fits it, and that the board draws the same order and kept dice as the tray.

local here = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = here .. "/../.."

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
local function list(t) local o = {} for i, v in ipairs(t) do o[i] = tostring(v) end return "{" .. table.concat(o, ",") .. "}" end

local function load(path)
  local env = setmetatable({}, { __index = _G })
  assert(loadfile(path, "t", env))()
  return env
end

local T = load(root .. "/mod/scripts/acae21.lua")
local B = load(root .. "/mod/scripts/e24b01.lua")

---------------------------------------------------------------- keep rule --

local CASES = {
  { "success", 1, false, { 3, 6, 5 }, { 6, 5, 3 }, 2, 11, "SUCCESS" },
  { "success", -2, false, { 6, 1, 4, 3 }, { 1, 3, 4, 6 }, 2, 4, "FAILURE" },
  { "success", 0, false, { 6, 6 }, { 6, 6 }, 2, 12, "CRITICAL" },
  { "success", 0, false, { 3, 4 }, { 4, 3 }, 2, 7, "SUCCESS" },
  { "success", 0, false, { 3, 3 }, { 3, 3 }, 2, 6, "FAILURE" },
  { "success", 4, false, { 6, 6, 1, 2, 5, 6 }, { 6, 6, 6, 5, 2, 1 }, 2, 12, "CRITICAL" },
  { "success", -8, false, { 2, 5, 1, 6, 4, 2, 3, 5, 4, 6 }, { 1, 2, 2, 3, 4, 4, 5, 5, 6, 6 }, 2, 3, "FAILURE" },
  { "success", 1, false, { 4 }, { 4 }, 1, 4, "FAILURE" },
  { "injury", 2, false, { 1, 5, 6, 2 }, { 6, 5, 2, 1 }, 2, 11, nil },
  { "injury", -1, false, { 5, 2, 6 }, { 2, 5, 6 }, 2, 7, nil },
  { "injury", 8, false, { 6, 1, 3, 2, 5, 6, 4, 3, 1, 5 }, { 6, 6, 5, 5, 4, 3, 3, 2, 1, 1 }, 2, 12, nil },
  { "bloodbath", 0, false, { 2, 6, 4 }, { 6, 4, 2 }, 3, 12, nil },
  { "bloodbath", 2, false, { 1, 6, 3, 5, 2 }, { 6, 5, 3, 2, 1 }, 3, 14, nil },
  { "bloodbath", -2, false, { 1, 6, 3, 5, 2 }, { 1, 2, 3, 5, 6 }, 3, 6, nil },
  { "bloodbath", 0, true, { 3, 1, 6, 4 }, { 6, 4, 3, 1 }, 4, 14, nil },
  { "bloodbath", 1, true, { 3, 1, 6, 4, 2 }, { 6, 4, 3, 2, 1 }, 4, 15, nil },
  { "bloodbath", -1, true, { 3, 1, 6, 4, 2 }, { 1, 2, 3, 4, 6 }, 4, 10, nil },
  { "sum", -3, false, { 2, 6, 3 }, { 6, 3, 2 }, 3, 11, nil },
  { "sum", 0, true, { 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6 }, { 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1 }, 12, 42, nil },
}
for _, c in ipairs(CASES) do
  local mode, mod, deadly, values, order, k, total, verdict = c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8]
  local name = string.format("%s %+d%s %s", mode, mod, deadly and " deadly" or "", list(values))
  local r = T.resolve(values, mode, mod, deadly)
  eq(list(r.values), list(order), name .. " order")
  eq(r.k, k, name .. " keeps")
  eq(r.total, total, name .. " kept total")
  eq(r.verdict, verdict, name .. " verdict")
  eq(r.n, #values, name .. " count")
  eq(r.deadly, mode == "bloodbath" and deadly, name .. " deadly flag")
  local all = 0
  for _, v in ipairs(values) do all = all + v end
  eq(r.all, all, name .. " all")
  local counted = 0
  for f = 1, 6 do counted = counted + r.counts[f] end
  eq(counted, #values, name .. " face counts")
end
check(#T.resolve({ 3, 6, 5 }, "success", 1, false).values == 3 and T.resolve({ 3, 6, 5 }, "success", 1, false) ~= nil, "resolve keeps every die")

eq(T.keepCount("success"), 2, "Success keeps 2")
eq(T.keepCount("injury"), 2, "Injury keeps 2")
eq(T.keepCount("bloodbath", false), 3, "Bloodbath keeps 3")
eq(T.keepCount("bloodbath", true), 4, "Deadly Bloodbath keeps 4")
eq(T.keepCount("sum"), nil, "Sum keeps all")
eq(T.keepCount("success", true), 2, "Deadly only changes Bloodbath")

---------------------------------------------------------------- dice count --

eq(T.rollCount("success", false, 0), 2, "Success at 0 DICE rolls 2")
eq(T.rollCount("success", false, 1), 3, "+1 DICE rolls 3")
eq(T.rollCount("success", false, -1), 3, "-1 DICE rolls 3")
eq(T.rollCount("success", false, -8), 10, "-8 DICE rolls 10")
eq(T.rollCount("bloodbath", false, 0), 3, "Bloodbath rolls 3")
eq(T.rollCount("bloodbath", true, 0), 4, "Deadly rolls 4")
eq(T.rollCount("bloodbath", true, 8), 12, "Deadly +8 rolls the cap")
eq(T.clampMod(9), 8, "+DICE stops at +8")
eq(T.clampMod(-11), -8, "-DICE stops at -8")
local maxSeen = 0
for _, mode in ipairs(T.MODES) do
  for _, deadly in ipairs({ false, true }) do
    for mod = -20, 20 do
      local n = T.rollCount(mode, deadly, mod)
      if n > maxSeen then maxSeen = n end
    end
  end
end
eq(maxSeen, 12, "no setting rolls more than the 12-dice cap")
eq(T.MAX_DICE, 12, "the cap is 12")

---------------------------------------------------------------- text --

eq(T.chatLine("Red", T.resolve({ 3, 6, 5 }, "success", 1, false)), "Red · Success +1 DICE: [6][5] 3 → 11 Success", "chat line, Success")
eq(T.chatLine("Blue", T.resolve({ 6, 1, 4, 3 }, "success", -2, false)), "Blue · Success −2 DICE: [1][3] 4 6 → 4 Failure", "chat line, -DICE")
eq(T.chatLine("Red", T.resolve({ 2, 6 }, "injury", 0, false)), "Red · Injury 0 INJURY DICE: [6][2] → 8 before INJURY MODIFIERS", "chat line, Injury")
eq(T.chatLine("Red", T.resolve({ 3, 1, 6, 4 }, "bloodbath", 0, true)), "Red · Deadly Bloodbath 0 INJURY DICE: [6][4][3][1] → 14 before INJURY MODIFIERS", "chat line, Deadly")
eq(T.chatLine("Blue", T.resolve({ 2, 6, 3 }, "sum", 0, false)), "Blue · Sum: 6 3 2 → 11", "chat line, Sum")
check(not T.chatLine("Red", T.resolve({ 3, 6, 5 }, "success", 1, false)):find("\\u", 1, true), "chat line is raw UTF-8, no \\u escapes")

do
  local st = T.newState()
  local v = T.trayView(st, T.resolve({ 3, 6, 5 }, "success", 1, false))
  eq(v.verdict.label, "SUCCESS", "verdict chip in Success mode")
  v = T.trayView(st, T.resolve({ 2, 6 }, "injury", 0, false))
  eq(v.verdict.label, "before INJURY MODIFIERS", "Injury shows no verdict")
  v = T.trayView(st, T.resolve({ 2, 6, 3 }, "bloodbath", 0, false))
  eq(v.verdict.label, "before INJURY MODIFIERS", "Bloodbath shows no verdict")
  v = T.trayView(st, T.resolve({ 2, 6, 3 }, "sum", 0, false))
  eq(v.verdict.label, "", "Sum shows no verdict")
  st.mode = 4
  v = T.trayView(st, nil)
  check(v.minus.bg == T.GREYED and v.plus.bg == T.GREYED and v.stepper.fg == T.FAINT, "the DICE stepper is greyed in Sum mode")
end

do
  local s = T.normaliseState({ mode = 9, mod = 30, deadly = "yes", history = { 1, {}, { mode = "sum", values = {} } }, dice = { "abc", 4 } })
  eq(s.mode, 1, "a bad saved mode falls back to Success")
  eq(s.mod, 8, "a saved modifier is clamped")
  eq(s.deadly, false, "Deadly only from a real true")
  eq(#s.history, 1, "only well-formed results survive a load")
  eq(#s.dice, 1, "only GUID strings survive a load")
end

---------------------------------------------------------------- geometry --

local function rect(cu, cv, w, h) return { u0 = cu - w / 2, u1 = cu + w / 2, v0 = cv - h / 2, v1 = cv + h / 2 } end
local function inside(a, b) return a.u0 >= b.u0 - 1e-9 and a.u1 <= b.u1 + 1e-9 and a.v0 >= b.v0 - 1e-9 and a.v1 <= b.v1 + 1e-9 end
local function overlap(a, b, gap)
  gap = gap or 0
  return a.u0 < b.u1 + gap and b.u0 < a.u1 + gap and a.v0 < b.v1 + gap and b.v0 < a.v1 + gap
end
local function fmt(r) return string.format("[%.2f..%.2f]x[%.2f..%.2f]", r.u0, r.u1, r.v0, r.v1) end

local TRAY = { u0 = -T.TRAY_HALF.u, u1 = T.TRAY_HALF.u, v0 = -T.TRAY_HALF.v, v1 = T.TRAY_HALF.v }
local ZONE = { u0 = T.DICE_ZONE.u0, u1 = T.DICE_ZONE.u1, v0 = T.DICE_ZONE.v0, v1 = T.DICE_ZONE.v1 }
local READ = { u0 = T.READOUT.u0, u1 = T.READOUT.u1, v0 = T.READOUT.v0, v1 = T.READOUT.v1 }
local STRIP = rect(0, T.STRIP.v, 2 * T.TRAY_HALF.u, T.STRIP.h)
check(inside(ZONE, TRAY), "dice zone on the tray")
check(not overlap(ZONE, READ) and not overlap(ZONE, STRIP), "dice zone clear of the readout and the controls")

-- Text metrics (layout_test): a character is 0.355 / 0.76 of a line wide.
local CHAR = 0.355 / 0.76
local function textWidth(label, font)
  local n = 0
  for _ in tostring(label):gmatch("[^\128-\191]") do n = n + 1 end
  return n * font * CHAR
end

local function opaque(c) return type(c) == "table" and #c >= 3 and (c[4] == nil or c[4] == 1) end

local specs = T.traySpecs()
local byId = {}
for _, s in ipairs(specs) do
  byId[s.id] = s
  local r = rect(s.u, s.v, s.w, s.h)
  check(s.w > 0 and s.h > 0, "widget " .. s.id .. " has a real size")
  check(opaque(s.bg), "widget " .. s.id .. " has an opaque backing")
  check(s.font <= s.h + 1e-9, "widget " .. s.id .. " text fits its height")
  check(inside(r, TRAY), "widget " .. s.id .. " on the tray: " .. fmt(r))
  local p = T.toButton(s, 5.575)
  check(p.width >= 60 and p.height >= 60 and p.font_size > 0, "widget " .. s.id .. " button is at least 60 x 60 units: " .. p.width .. " x " .. p.height)
end
for a = 1, #specs do
  for b = a + 1, #specs do
    local sa, sb = specs[a], specs[b]
    check(not overlap(rect(sa.u, sa.v, sa.w, sa.h), rect(sb.u, sb.v, sb.w, sb.h)), "widgets apart: " .. sa.id .. " / " .. sb.id)
  end
end
local _, stripWidth = T.controlSpecs()
check(stripWidth <= 2 * T.TRAY_HALF.u - 0.7, string.format("controls strip fits: %.2f", stripWidth))
for _, s in ipairs(T.controlSpecs()) do
  check(inside(rect(s.u, s.v, s.w, s.h), STRIP), "control " .. s.id .. " in the strip")
end

local DIE = T.DIE_IN
local labelChecks, rowChecks, bad = 0, 0, 0
local function settings()
  local out = {}
  for m = 1, #T.MODES do
    for _, deadly in ipairs({ false, true }) do
      for mod = -8, 8 do out[#out + 1] = { mode = m, mod = mod, deadly = deadly } end
    end
  end
  return out
end
for _, st in ipairs(settings()) do
  local mode = T.MODES[st.mode]
  local n = T.rollCount(mode, st.deadly, st.mod)
  if mode == "sum" then n = 1 + (st.mod + 8) % 12 end
  local values = {}
  for i = 1, n do values[i] = (i * 5) % 6 + 1 end
  local r = T.resolve(values, mode, st.mod, st.deadly)
  local state = T.newState()
  state.mode, state.mod, state.deadly = st.mode, st.mod, st.deadly
  local view = T.trayView(state, r)
  local dice = {}
  for i = 1, n do
    local u = T.slotU(i, n, r.k, T.TRAY_ROW)
    dice[i] = rect(u, T.ROW_V, DIE, DIE)
    rowChecks = rowChecks + 1
    if not inside(dice[i], ZONE) then bad = bad + 1; print("  die " .. i .. "/" .. n .. " off the zone " .. fmt(dice[i])) end
    if i > 1 and dice[i].u0 < dice[i - 1].u1 + 0.1 then bad = bad + 1; print("  dice " .. i - 1 .. "/" .. i .. " touch at n=" .. n) end
    local label = view["value" .. i]
    labelChecks = labelChecks + 1
    if label.u ~= u or label.label ~= tostring(r.values[i]) then bad = bad + 1; print("  value label " .. i .. " not under its die") end
  end
  for id, e in pairs(view) do
    local s = byId[id]
    local w = (e.label and e.label ~= "") and textWidth(e.label, e.font or s.font) or 0
    if w > s.w then bad = bad + 1; print(string.format("  '%s' (%s) is %.2f wide in a %.2f row", tostring(e.label), id, w, s.w)) end
    local wr = rect(e.u or s.u, s.v, s.w, s.h)
    if not inside(wr, TRAY) then bad = bad + 1; print("  " .. id .. " off the tray " .. fmt(wr)) end
    for _, d in ipairs(dice) do
      if s.v < T.STRIP.v - 1 and overlap(wr, d) then bad = bad + 1; print("  " .. id .. " under a die") end
    end
  end
  if r.k < n and mode ~= "sum" then
    local kept = rect(view.keptLabel.u, byId.keptLabel.v, byId.keptLabel.w, byId.keptLabel.h)
    local dropped = rect(view.droppedLabel.u, byId.droppedLabel.v, byId.droppedLabel.w, byId.droppedLabel.h)
    if overlap(kept, dropped) or overlap(kept, READ) then bad = bad + 1; print("  kept / dropped labels collide at n=" .. n) end
  end
  local marks = T.keptMarks(r, T.TRAY_ROW, T.ROW_V, DIE, T.PLATE_PAD)
  local plates = (mode == "sum") and 0 or r.k
  local want = plates + ((mode ~= "sum" and r.k < n) and 1 or 0)
  if #marks ~= want then bad = bad + 1; print("  " .. #marks .. " marks, wanted " .. want) end
  for i = 1, plates do
    local pl = marks[i]
    local cu = (pl[1][1] + pl[2][1]) / 2
    if math.abs(cu - T.slotU(i, n, r.k, T.TRAY_ROW)) > 1e-9 then bad = bad + 1; print("  plate " .. i .. " off its die") end
    for _, p in ipairs(pl) do
      if p[1] < ZONE.u0 or p[1] > ZONE.u1 or p[2] < ZONE.v0 or p[2] > ZONE.v1 then bad = bad + 1; print("  plate " .. i .. " off the zone") break end
    end
  end
end
check(bad == 0, string.format("%d die slots and %d value labels for every mode, DICE and Deadly setting sit in the zone, apart and aligned; every label fits its row (%d problems)", rowChecks, labelChecks, bad))

for i = 1, T.MAX_DICE do
  local u, v = T.looseSpot(i)
  check(inside(rect(u, v, DIE, DIE), ZONE), "spawn spot " .. i .. " in the dice zone")
  check(not overlap(rect(u, v, DIE, DIE), rect(0, T.ROW_V, 40, DIE)) and not overlap(rect(u, v, DIE, DIE), rect(0, T.LABEL_V, 40, 0.6)),
    "spawn spot " .. i .. " clear of the lined-up row and its labels, so added dice never land on it")
  for j = 1, i - 1 do
    local u2, v2 = T.looseSpot(j)
    check(not overlap(rect(u, v, DIE, DIE), rect(u2, v2, DIE, DIE), 0.3), "spawn spots " .. j .. " / " .. i .. " apart")
  end
end

---------------------------------------------------------------- board --

local BOARD = { u0 = -B.BOARD_HALF.u, u1 = B.BOARD_HALF.u, v0 = -B.BOARD_HALF.v, v1 = B.BOARD_HALF.v }
local bspecs = B.boardSpecs()
local bById = {}
for _, s in ipairs(bspecs) do
  bById[s.id] = s
  check(s.w > 0 and s.h > 0 and opaque(s.bg), "board widget " .. s.id .. " has a real size and an opaque backing")
  check(inside(rect(s.u, s.v, s.w, s.h), BOARD), "board widget " .. s.id .. " on the board")
  local p = B.toButton(s, 5.575)
  check(p.width >= 60 and p.height >= 60, "board widget " .. s.id .. " button at least 60 x 60 units")
end
for a = 1, #bspecs do
  for b = a + 1, #bspecs do
    local sa, sb = bspecs[a], bspecs[b]
    check(not overlap(rect(sa.u, sa.v, sa.w, sa.h), rect(sb.u, sb.v, sb.w, sb.h)), "board widgets apart: " .. sa.id .. " / " .. sb.id)
  end
end

local boardBad = 0
for _, st in ipairs(settings()) do
  local mode = T.MODES[st.mode]
  local n = T.rollCount(mode, st.deadly, st.mod)
  local values = {}
  for i = 1, n do values[i] = (i * 5) % 6 + 1 end
  local r = T.resolve(values, mode, st.mod, st.deadly)
  r.no = 7
  local v = B.boardView("Red", r)
  local chips = {}
  for i = 1, n do
    local c = v["chip" .. i]
    chips[i] = rect(c.u, bById["chip" .. i].v, c.w, c.h)
    if c.label ~= tostring(r.values[i]) then boardBad = boardBad + 1; print("  chip " .. i .. " shows " .. c.label .. ", tray " .. r.values[i]) end
    if c.u ~= B.slotU(i, n, r.k, B.BOARD_ROW) then boardBad = boardBad + 1 end
    local kept = mode == "sum" or i <= r.k
    if (c.bg == B.DIE_COLOUR.Red) ~= kept then boardBad = boardBad + 1; print("  chip " .. i .. " kept colour wrong") end
    if not inside(chips[i], BOARD) then boardBad = boardBad + 1; print("  chip " .. i .. " off the board") end
    if i > 1 and chips[i].u0 < chips[i - 1].u1 + 0.05 then boardBad = boardBad + 1; print("  chips touch at n=" .. n) end
    if textWidth(c.label, bById["chip" .. i].font) > c.w then boardBad = boardBad + 1 end
  end
  for id, e in pairs(v) do
    local s = bById[id]
    if e.label and e.label ~= "" and textWidth(e.label, e.font or s.font) > (e.w or s.w) then
      boardBad = boardBad + 1
      print(string.format("  board '%s' too wide for %s", e.label, id))
    end
  end
  if not v.header.label:find("#7", 1, true) or not v.header.label:find("RED", 1, true) then boardBad = boardBad + 1 end
  if r.verdict and v.verdict.label ~= r.verdict then boardBad = boardBad + 1 end
end
check(boardBad == 0, "the board draws every setting's dice in the tray's order, kept first, on the board (" .. boardBad .. " problems)")
eq(B.slotU(3, 5, 2, T.TRAY_ROW), T.slotU(3, 5, 2, T.TRAY_ROW), "board and tray share one slot function")
eq(B.boardView("Blue", nil).mode.label, "no roll on the tray", "an empty board says so")

print(string.format("dice_tray_test: %d checks, %d failed", checks, failures))
os.exit(failures == 0 and 0 or 1)
