-- FTC-GUID: acae21,839fcc
-- Dice tray (TC-024): one mat per player. ROLL puts base + |N| dice on the tray (Success /
-- Injury keep 2, Bloodbath 3, Deadly Bloodbath 4, from the highest at +DICE and the lowest
-- at -DICE; Sum keeps all), lines them up sorted with the kept dice first, and sends the
-- result to the readout, the opponent's board and chat.
--
-- Everything above the "TTS glue" line touches no TTS global, so
-- mod/test/dice_tray_test.lua runs it under plain Lua. TTS runs MoonSharp (Lua 5.2).

MAX_DICE = 12
MAX_MOD = 8
MODES = { "success", "injury", "bloodbath", "sum" }
MODE_NAME = { success = "Success", injury = "Injury", bloodbath = "Bloodbath", sum = "Sum" }
MODE_TITLE = { success = "SUCCESS ROLL", injury = "INJURY ROLL", bloodbath = "BLOODBATH", sum = "SUM" }
VERDICT_WORD = { FAILURE = "Failure", SUCCESS = "Success", CRITICAL = "Critical" }
SUCCESS_AT = 7
CRITICAL_AT = 12
HISTORY = 5
MINUS = "−"
DOT = " · "

-- Board and panel GUIDs by the side that rolls: Red's results show in Blue's strip.
BOARD_FOR = { Red = "e24b02", Blue = "e24b01" }
D3_BAG = { Red = "4c054e", Blue = "2d9705" }
D3_NAME = "BCB-D3"
-- getValue() of the d3 (a Custom_Dice with rotation values 1..6) to the face printed on
-- it. Not yet measured live (DESIGN live check 3): the image prints 1, 1, 2, 2, 3, 3 but
-- its face order is unknown.
D3_FACE = { 1, 2, 3, 1, 2, 3 }

function keepCount(mode, deadly)
  if mode == "sum" then return nil end
  if mode == "bloodbath" then return deadly and 4 or 3 end
  return 2
end

function clampMod(mod)
  mod = math.floor(tonumber(mod) or 0)
  if mod > MAX_MOD then return MAX_MOD end
  if mod < -MAX_MOD then return -MAX_MOD end
  return mod
end

function rollCount(mode, deadly, mod)
  local n = (keepCount(mode, deadly) or 0) + math.abs(clampMod(mod))
  if n > MAX_DICE then n = MAX_DICE end
  return n
end

function keepsLowest(mode, mod)
  return mode ~= "sum" and mod < 0
end

function modWord(mode)
  if mode == "injury" or mode == "bloodbath" then return "INJURY DICE" end
  return "DICE"
end

function modLabel(mode, mod, short)
  local word = short and "DICE" or modWord(mode)
  if mod == 0 then return "0 " .. word end
  return (mod > 0 and "+" or MINUS) .. math.abs(mod) .. " " .. word
end

function verdictFor(mode, total, n)
  if mode ~= "success" or n == 0 then return nil end
  if total < SUCCESS_AT then return "FAILURE" end
  if total >= CRITICAL_AT then return "CRITICAL" end
  return "SUCCESS"
end

-- True when a sorts before b in the row: descending, or ascending when the lowest are kept.
function before(a, b, lowest)
  if lowest then return a < b end
  return a > b
end

-- The keep rule. values are face values in any order; the result lists them sorted with
-- the k kept ones first.
function resolve(values, mode, mod, deadly)
  mod = clampMod(mod)
  local lowest = keepsLowest(mode, mod)
  local order = {}
  for i, v in ipairs(values) do order[i] = v end
  table.sort(order, function(a, b) return before(a, b, lowest) end)
  local n = #order
  local k = keepCount(mode, deadly) or n
  if k > n then k = n end
  local total, all, counts = 0, 0, { 0, 0, 0, 0, 0, 0 }
  for i, v in ipairs(order) do
    all = all + v
    if i <= k then total = total + v end
    if counts[v] then counts[v] = counts[v] + 1 end
  end
  return {
    mode = mode, mod = mod, deadly = (mode == "bloodbath" and deadly) and true or false,
    values = order, n = n, k = k, total = total, all = all, counts = counts,
    verdict = verdictFor(mode, total, n), lowest = lowest,
  }
end

function newState()
  return { mode = 1, mod = 0, deadly = false, current = nil, history = {}, dice = {}, rollNo = 0 }
end

local function validResult(r)
  return type(r) == "table" and type(r.values) == "table" and MODE_NAME[r.mode] ~= nil
end

function normaliseState(loaded)
  local s = newState()
  if type(loaded) ~= "table" then return s end
  local m = tonumber(loaded.mode)
  if m and m >= 1 and m <= #MODES then s.mode = math.floor(m) end
  s.mod = clampMod(loaded.mod)
  s.deadly = loaded.deadly == true
  if validResult(loaded.current) then s.current = loaded.current end
  if type(loaded.history) == "table" then
    for _, r in ipairs(loaded.history) do
      if validResult(r) then s.history[#s.history + 1] = r end
    end
  end
  while #s.history > HISTORY do table.remove(s.history, 1) end
  if type(loaded.dice) == "table" then
    for _, g in ipairs(loaded.dice) do
      if type(g) == "string" then s.dice[#s.dice + 1] = g end
    end
  end
  s.rollNo = math.floor(tonumber(loaded.rollNo) or 0)
  return s
end

function pushHistory(st, r)
  if not r then return end
  st.history[#st.history + 1] = r
  while #st.history > HISTORY do table.remove(st.history, 1) end
end

---------------------------------------------------------------- text --

function modeTitle(mode, deadly)
  if mode == "bloodbath" and deadly then return "DEADLY BLOODBATH" end
  return MODE_TITLE[mode]
end

function modeButtonLabel(mode, deadly)
  if mode == "bloodbath" and deadly then return "Deadly Bloodbath" end
  return MODE_NAME[mode]
end

function readoutTitle(mode, mod, deadly)
  if mode == "sum" then return "SUM" end
  return modeTitle(mode, deadly) .. DOT .. modLabel(mode, mod)
end

function keepPhrase(mode, mod, deadly)
  local k = keepCount(mode, deadly)
  if not k then return "keep all" end
  return "keep " .. k .. (keepsLowest(mode, mod) and " lowest" or " highest")
end

function keptExpression(r)
  if r.n == 0 then return "" end
  if r.k > 3 then return "kept" end
  local parts = {}
  for i = 1, r.k do parts[i] = tostring(r.values[i]) end
  return table.concat(parts, " + ")
end

function allLine(r)
  return r.n .. " dice" .. DOT .. "all ∑ " .. r.all
end

function faceCount(r, face)
  local c = r and r.counts[face] or 0
  if c > 0 then return tostring(c) end
  return "·"
end

-- One chat line per roll: "Red · Success +1 DICE: [6][5] 3 → 11 Success".
function chatLine(side, r)
  local head
  if r.mode == "sum" then
    head = side .. DOT .. "Sum"
  else
    head = side .. DOT .. modeButtonLabel(r.mode, r.deadly) .. " " .. modLabel(r.mode, r.mod)
  end
  local kept, dropped = {}, {}
  for i, v in ipairs(r.values) do
    if r.mode == "sum" then
      dropped[#dropped + 1] = tostring(v)
    elseif i <= r.k then
      kept[#kept + 1] = "[" .. v .. "]"
    else
      dropped[#dropped + 1] = tostring(v)
    end
  end
  local dice = table.concat(kept)
  if #dropped > 0 then dice = (dice ~= "" and dice .. " " or "") .. table.concat(dropped, " ") end
  local tail = tostring(r.total)
  if r.verdict then
    tail = tail .. " " .. VERDICT_WORD[r.verdict]
  elseif r.mode == "injury" or r.mode == "bloodbath" then
    tail = tail .. " before INJURY MODIFIERS"
  end
  return head .. ": " .. dice .. " → " .. tail
end

---------------------------------------------------------------- layout --

-- Inches in the seated player's frame: u to their right, v toward them, from the tray
-- centre. The tray is a 28.6 x 11.15 Custom_Tile at scale (5.575, 1, 5.575).
TRAY_HALF = { u = 14.3, v = 5.575 }
READOUT = { u0 = -13.95, u1 = -7.6, v0 = -5.2, v1 = 3.35 }
STRIP = { v = 4.62, h = 1.05 }
DICE_ZONE = { u0 = -7.3, u1 = 14.0, v0 = -4.0, v1 = 3.6 }
TRAY_ROW = { u0 = -6.4, width = 19.6, pitch = 2.0, gap = 0.5 }
DIE_IN = 1.2
-- A Die_6_Rounded is about 0.7" at scale 1 (read off a screenshot, not measured);
-- fitDie corrects the scale from the die's own bounds once it exists.
STD_DIE_SCALE = DIE_IN / 0.7
ROW_V = -1.35
LABEL_V = 0.55
BRACKET_V = { top = -3.1, tick = -2.85, label = -3.65 }
PLATE_PAD = 0.2
LOOSE = { u0 = -5.4, du = 3.6, v0 = -3.2, dv = 4.8 }
SPAWN_LIFT = 1.0
ARRANGE_LIFT = 0.8

-- Widget units: 500 per local unit across, about 650 down (mod/TESTING.md); a line of text
-- at font_size f on a tile of scale s is f * s * 0.76 / 375 inches tall (layout_test).
UNITS_PER_LOCAL = 500
HEIGHT_UNITS_PER_LOCAL = 650
LINE_PER_FONT = 0.76 / 375
WIDGET_Y = 0.2

LIGHT = { 0.95, 0.92, 0.85 }
MUTED = { 0.61, 0.59, 0.55 }
FAINT = { 0.33, 0.33, 0.33 }
DROPPED = { 0.47, 0.45, 0.42 }
DARK = { 0.08, 0.08, 0.08 }
MAT = { 0.08, 0.08, 0.08 }
PANEL = { 0.12, 0.12, 0.12 }
PANEL2 = { 0.165, 0.165, 0.165 }
STEPPER_BG = { 0.07, 0.07, 0.07 }
GREYED = { 0.1, 0.1, 0.1 }
GOLD = { 0.85, 0.70, 0.32 }
GREEN = { 0.18, 0.49, 0.2 }
ADD = { 0.17, 0.29, 0.18 }
DANGER = { 0.5, 0.14, 0.12 }
VERDICT_BG = { SUCCESS = GREEN, FAILURE = DANGER, CRITICAL = GOLD }
LINE_THICKNESS = 0.06

-- Centre u of die i (1-based) of n with k kept: one function places the dice, their value
-- labels, the kept plates and the bracket, so none of them can drift apart.
function slotU(i, n, k, row)
  local g = (k < n) and row.gap or 0
  local pitch = row.pitch
  if n > 1 then pitch = math.min(row.pitch, (row.width - g) / (n - 1)) end
  local u = row.u0 + (i - 1) * pitch
  if i > k then u = u + g end
  return u
end

function looseSpot(i)
  local c = math.floor((i - 1) / 2)
  local r = (i - 1) % 2
  return LOOSE.u0 + c * LOOSE.du, LOOSE.v0 + r * LOOSE.dv
end

local function faceU(i)
  return READOUT.u0 + 0.62 + (i - 1) * ((READOUT.u1 - READOUT.u0 - 1.24) / 5)
end

-- The controls strip, left to right from the seat; nil entries are gaps.
CONTROLS = {
  { id = "minus", label = MINUS, w = 1.15, font = 0.6, click = "onMinus", tooltip = "One DICE fewer (net -DICE keeps the lowest)" },
  { id = "stepper", w = 2.4, font = 0.4, bg = STEPPER_BG, fg = GOLD, tooltip = "Net +DICE / -DICE for the next ROLL" },
  { id = "plus", label = "+", w = 1.15, font = 0.6, click = "onPlus", tooltip = "One DICE more" },
  { gap = 0.45 },
  { id = "mode", w = 3.0, font = 0.36, click = "onMode", tooltip = "Left click: Success, Injury, Bloodbath, Sum\nRight click in Bloodbath: Deadly (roll 4)" },
  { gap = 0.9 },
  { id = "add1", label = "+1d6", w = 1.55, font = 0.36, bg = ADD, click = "onAdd1", tooltip = "Add a d6 to the tray (Sum)" },
  { id = "add2", label = "+2", w = 1.15, font = 0.38, bg = ADD, click = "onAdd2", tooltip = "Add 2d6 to the tray (Sum)" },
  { id = "add3", label = "+3", w = 1.15, font = 0.38, bg = ADD, click = "onAdd3", tooltip = "Add 3d6 to the tray (Sum)" },
  { id = "add4", label = "+4", w = 1.15, font = 0.38, bg = ADD, click = "onAdd4", tooltip = "Add 4d6 to the tray (Sum)" },
  { id = "addD3", label = "+d3", w = 1.4, font = 0.38, bg = ADD, click = "onAddD3", tooltip = "Add a d3 to the tray (Sum)" },
  { gap = 0.9 },
  { id = "roll", label = "ROLL", w = 4.1, font = 0.5, bg = GOLD, fg = DARK, click = "onRoll", tooltip = "Roll: Success / Injury / Bloodbath put fresh dice on the tray (any die you dropped on it is the template); Sum rolls the dice on the tray" },
  { gap = 0.45 },
  { id = "last", label = "Last roll", w = 2.75, font = 0.38, click = "onLastRoll", tooltip = "Left click: restore the previous result\nRight click: the last 5 results in chat" },
  { id = "clear", label = "Clear", w = 2.0, font = 0.38, bg = DANGER, click = "onClear", tooltip = "Remove the tray's dice (Last roll brings them back)" },
}
CONTROL_GAP = 0.15

function controlSpecs()
  local width, prevButton = 0, false
  for _, c in ipairs(CONTROLS) do
    if c.gap then
      width = width + c.gap
      prevButton = false
    else
      width = width + c.w + (prevButton and CONTROL_GAP or 0)
      prevButton = true
    end
  end
  local specs = {}
  local u = -width / 2
  prevButton = false
  for _, c in ipairs(CONTROLS) do
    if c.gap then
      u = u + c.gap
      prevButton = false
    else
      if prevButton then u = u + CONTROL_GAP end
      specs[#specs + 1] = {
        id = c.id, label = c.label or "", u = u + c.w / 2, v = STRIP.v, w = c.w, h = STRIP.h, font = c.font,
        bg = c.bg or PANEL2, fg = c.fg or LIGHT, click = c.click, tooltip = c.tooltip,
      }
      u = u + c.w
      prevButton = true
    end
  end
  return specs, width
end

-- Every widget the tray creates, in creation order. Text rows are buttons with a real size
-- and an opaque backing in the colour under them: TTS draws no label on a zero-size,
-- fully transparent button.
function traySpecs()
  local specs = controlSpecs()
  local rc = (READOUT.u0 + READOUT.u1) / 2
  local function text(id, u, v, w, h, font, fg, bg)
    specs[#specs + 1] = { id = id, label = "", u = u, v = v, w = w, h = h, font = font, fg = fg or LIGHT, bg = bg or PANEL }
  end
  text("title", rc, -4.65, 6.0, 0.55, 0.36)
  text("keep", rc, -4.05, 6.0, 0.55, 0.30, MUTED)
  text("total", rc - 1.25, -2.25, 2.6, 1.9, 1.75, GOLD)
  text("expr", rc + 1.55, -2.65, 2.4, 0.55, 0.36)
  text("caption", rc + 1.55, -2.0, 2.4, 0.55, 0.27, MUTED)
  text("verdict", rc, -0.6, 3.8, 0.8, 0.4)
  text("all", rc, 0.75, 6.0, 0.55, 0.33)
  for f = 1, 6 do
    text("face" .. f, faceU(f), 1.55, 0.9, 0.55, 0.26, MUTED)
    text("count" .. f, faceU(f), 2.35, 0.9, 0.6, 0.44)
  end
  text("keptLabel", -5.4, BRACKET_V.label, 3.0, 0.55, 0.38, GOLD, MAT)
  text("droppedLabel", 3.0, BRACKET_V.label, 3.0, 0.55, 0.3, MUTED, MAT)
  for i = 1, MAX_DICE do
    text("value" .. i, slotU(i, MAX_DICE, MAX_DICE, TRAY_ROW), LABEL_V, 1.0, 0.6, 0.42, LIGHT, MAT)
  end
  return specs
end

-- What every widget shows for the tray's setting and the result on it (nil: none yet).
-- Only the fields that change are given.
function trayView(st, r)
  local mode = MODES[st.mode]
  local sum = mode == "sum"
  local v = {}
  v.minus = { fg = sum and FAINT or LIGHT, bg = sum and GREYED or PANEL2 }
  v.plus = { fg = sum and FAINT or LIGHT, bg = sum and GREYED or PANEL2 }
  v.stepper = { label = modLabel(mode, st.mod, true), fg = sum and FAINT or GOLD, bg = sum and GREYED or STEPPER_BG }
  v.mode = { label = modeButtonLabel(mode, st.deadly) }

  local rm, rmod, rdeadly = mode, st.mod, st.deadly
  if r then rm, rmod, rdeadly = r.mode, r.mod, r.deadly end
  v.title = { label = readoutTitle(rm, rmod, rdeadly) }
  v.keep = { label = keepPhrase(rm, rmod, rdeadly) }

  local n = r and r.n or 0
  v.total = { label = n > 0 and tostring(r.total) or "" }
  v.expr = { label = n > 0 and keptExpression(r) or "" }
  v.caption = { label = n > 0 and (rm == "sum" and "sum" or "kept total") or "" }
  if n > 0 and r.verdict then
    v.verdict = { label = r.verdict, bg = VERDICT_BG[r.verdict], fg = r.verdict == "CRITICAL" and DARK or LIGHT, font = 0.4 }
  elseif n > 0 and (rm == "injury" or rm == "bloodbath") then
    v.verdict = { label = "before INJURY MODIFIERS", bg = PANEL, fg = MUTED, font = 0.28 }
  else
    v.verdict = { label = "", bg = PANEL, fg = LIGHT, font = 0.4 }
  end
  v.all = { label = n > 0 and allLine(r) or "no dice rolled" }
  for f = 1, 6 do
    local c = faceCount(r, f)
    v["face" .. f] = { label = f .. "s" }
    v["count" .. f] = { label = c, fg = c == "·" and FAINT or LIGHT }
  end

  local k = r and r.k or 0
  local bracketed = n > 0 and rm ~= "sum" and k < n
  if bracketed then
    v.keptLabel = { label = "KEPT " .. r.total, u = (slotU(1, n, k, TRAY_ROW) + slotU(k, n, k, TRAY_ROW)) / 2 }
    v.droppedLabel = { label = "dropped (" .. (n - k) .. ")", u = (slotU(k + 1, n, k, TRAY_ROW) + slotU(n, n, k, TRAY_ROW)) / 2 }
  else
    v.keptLabel = { label = "" }
    v.droppedLabel = { label = "" }
  end
  for i = 1, MAX_DICE do
    if i <= n then
      local fg = DROPPED
      if rm == "sum" then fg = LIGHT elseif i <= k then fg = GOLD end
      v["value" .. i] = { label = tostring(r.values[i]), u = slotU(i, n, k, TRAY_ROW), fg = fg }
    else
      v["value" .. i] = { label = "", u = slotU(i, MAX_DICE, MAX_DICE, TRAY_ROW) }
    end
  end
  return v
end

-- Polylines (in u, v) for the kept dice: a plate round each and a bracket over them when
-- some are dropped. Sum keeps everything and draws nothing.
function keptMarks(r, row, rowV, die, pad)
  local lines = {}
  if not r or r.n == 0 or r.mode == "sum" then return lines end
  local h = die / 2 + pad
  for i = 1, r.k do
    local u = slotU(i, r.n, r.k, row)
    lines[#lines + 1] = { { u - h, rowV - h }, { u + h, rowV - h }, { u + h, rowV + h }, { u - h, rowV + h }, { u - h, rowV - h } }
  end
  if r.k < r.n then
    local a = slotU(1, r.n, r.k, row) - die / 2
    local b = slotU(r.k, r.n, r.k, row) + die / 2
    lines[#lines + 1] = { { a, BRACKET_V.tick }, { a, BRACKET_V.top }, { b, BRACKET_V.top }, { b, BRACKET_V.tick } }
  end
  return lines
end

local function round(x) return math.floor(x + 0.5) end

-- A spec in inches to createButton parameters on a tile of x/z scale s. Button local x is
-- u / s: TTS draws button x mirrored against positionToWorld, which is the seated player's
-- right on this tile.
function toButton(spec, s)
  local p = {
    label = spec.label or "",
    click_function = spec.click or "noop",
    tooltip = spec.tooltip or "",
    position = { spec.u / s, WIDGET_Y, spec.v / s },
    rotation = { 0, 0, 0 },
    width = round(spec.w * UNITS_PER_LOCAL / s),
    height = round(spec.h * HEIGHT_UNITS_PER_LOCAL / s),
    font_size = round(spec.font / (s * LINE_PER_FONT)),
    color = spec.bg,
    font_color = spec.fg,
  }
  if not spec.click then
    p.hover_color = spec.bg
    p.press_color = spec.bg
  end
  return p
end

-- (u, v) polylines to vector-line points on a flat tile: the recipe the measuring bubbles
-- and the objective marker use (local x/y over scale, laid flat by rotation 270).
function toLines(polylines, scale, lift, colour)
  local out = {}
  for _, pl in ipairs(polylines) do
    local pts = {}
    for i, p in ipairs(pl) do
      pts[i] = { x = -p[1] / scale.x, y = -p[2] / scale.z, z = lift / scale.y }
    end
    out[#out + 1] = { points = pts, color = colour, thickness = LINE_THICKNESS, rotation = { 270, 0, 0 } }
  end
  return out
end

---------------------------------------------------------------- TTS glue --

state = newState()
buttonIndex = {}
specById = {}
tracked = {}
busy = false
settleGen = 0
arrangingUntil = 0
SIDE = "Red"

function noop() end

function sideColour()
  return SIDE == "Red" and { 0.86, 0.25, 0.22 } or { 0.3, 0.55, 1 }
end

local function dieTint()
  return SIDE == "Red" and { 0.856, 0.1, 0.094 } or { 0.118, 0.37, 0.85 }
end

function onSave()
  local out = { mode = state.mode, mod = state.mod, deadly = state.deadly, rollNo = state.rollNo, history = {}, dice = {} }
  local function strip(r)
    if not r then return nil end
    local c = {}
    for k, v in pairs(r) do if k ~= "template" then c[k] = v end end
    return c
  end
  out.current = strip(state.current)
  for i, r in ipairs(state.history) do out.history[i] = strip(r) end
  for g in pairs(tracked) do out.dice[#out.dice + 1] = g end
  return JSON.encode(out)
end

function onLoad(saved)
  SIDE = self.getPosition().z >= 0 and "Red" or "Blue"
  local loaded = nil
  if saved and saved ~= "" then
    local ok, decoded = pcall(JSON.decode, saved)
    if ok then loaded = decoded end
  end
  state = normaliseState(loaded)
  for _, g in ipairs(state.dice) do tracked[g] = true end
  createWidgets()
  render(state.current)
  addHotkey("4. Roll All Dice", function(playerColor)
    local tray = trayFor(playerColor)
    if tray then tray.call("hotkeyRollAllDice", { playerColor = playerColor }) end
  end)
  addHotkey("Clear Mat", function(playerColor)
    local tray = trayFor(playerColor)
    if tray then tray.call("hotkeyClearMat", { playerColor = playerColor }) end
  end)
  Wait.time(function() sendToBoard(state.current) end, 2)
end

function trayFor(playerColor)
  if playerColor == "Red" then return getObjectFromGUID(Global.getVar("redCustomDiceMat_GUID")) end
  if playerColor == "Blue" then return getObjectFromGUID(Global.getVar("blueCustomDiceMat_GUID")) end
  return nil
end

function hotkeyRollAllDice(params) onRoll(nil, params.playerColor, false) end
function hotkeyClearMat(params) onClear(nil, params.playerColor, false) end

function createWidgets()
  self.clearButtons()
  buttonIndex, specById = {}, {}
  local s = self.getScale().x
  for i, spec in ipairs(traySpecs()) do
    local p = toButton(spec, s)
    p.function_owner = self
    self.createButton(p)
    buttonIndex[spec.id] = i - 1
    specById[spec.id] = spec
  end
end

function render(r)
  local s = self.getScale().x
  for id, e in pairs(trayView(state, r)) do
    local spec = specById[id]
    if spec then
      local merged = {}
      for k, v in pairs(spec) do merged[k] = v end
      for k, v in pairs(e) do merged[k] = v end
      local p = toButton(merged, s)
      p.index = buttonIndex[id]
      self.editButton(p)
    end
  end
  self.setVectorLines(toLines(keptMarks(r, TRAY_ROW, ROW_V, DIE_IN, PLATE_PAD), self.getScale(), lineLift(), GOLD))
end

-- Inches from the pivot (the tile's bottom face) to just above its top.
function lineLift()
  local b = self.getBounds()
  return b.center.y + b.size.y / 2 - self.getPosition().y + 0.03
end

function trayPoint(u, v, dy)
  local p = self.getPosition()
  local a = math.rad(self.getRotation().y)
  return {
    x = p.x - u * math.cos(a) + v * math.sin(a),
    y = p.y + (dy or 0),
    z = p.z + u * math.sin(a) + v * math.cos(a),
  }
end

-- Dice lying on (or just above) the tray, not held: a box cast, not a scan of the table.
function diceOnTray()
  local hits = Physics.cast({
    origin = trayPoint(0, 0, 1.6),
    direction = { 0, 1, 0 },
    type = 3,
    size = { 2 * TRAY_HALF.u, 3.2, 2 * TRAY_HALF.v },
    orientation = { 0, self.getRotation().y, 0 },
    max_distance = 0,
  })
  local dice, seen = {}, {}
  for _, h in ipairs(hits) do
    local o = h.hit_object
    if o and o ~= self and o.tag == "Dice" and o.held_by_color == nil and not seen[o.getGUID()] then
      seen[o.getGUID()] = true
      dice[#dice + 1] = o
    end
  end
  return dice
end

function untrackMissing(dice)
  local on = {}
  for _, d in ipairs(dice) do on[d.getGUID()] = true end
  for g in pairs(tracked) do if not on[g] then tracked[g] = nil end end
end

function faceOf(die)
  local raw = die.getValue()
  if die.getName() == D3_NAME then return D3_FACE[raw] or raw, raw end
  return raw, raw
end

local function scriptless(data)
  data.LuaScript = ""
  data.LuaScriptState = ""
  data.XmlUI = ""
  data.GUID = nil
  return data
end

-- A die the player dropped on the tray (else any die on it) is the template for ROLL.
function pickTemplate(dice)
  local pick = nil
  for _, d in ipairs(dice) do
    if not tracked[d.getGUID()] then pick = d break end
  end
  pick = pick or dice[1]
  if not pick then return nil end
  local b = pick.getBoundsNormalized()
  local edge = math.max(b.size.x, b.size.z)
  local sc = pick.getScale()
  local k = (edge > 0) and DIE_IN / edge or 1
  return { data = scriptless(pick.getData()), scale = { sc.x * k, sc.y * k, sc.z * k }, d3 = pick.getName() == D3_NAME }
end

function d3Template()
  local bag = getObjectFromGUID(D3_BAG[SIDE])
  if not bag then return nil end
  local contained = bag.getData().ContainedObjects
  if not contained or not contained[1] then return nil end
  return { data = scriptless(contained[1]), d3 = true }
end

-- Puts a die at its final size: the template's measured scale, or a standard die scaled
-- from its bounds once it exists.
local function fitDie(o)
  local b = o.getBoundsNormalized()
  local edge = math.max(b.size.x, b.size.z)
  if edge > 0 and math.abs(edge - DIE_IN) / DIE_IN > 0.03 then
    local sc = o.getScale()
    local k = DIE_IN / edge
    o.setScale({ sc.x * k, sc.y * k, sc.z * k })
  end
end

-- Spawns one die per entry of places ({u, v}) from template (nil: a standard d6 in the
-- side's colour) and calls done(dice) once all exist.
function spawnDice(places, template, done)
  local made, want = {}, #places
  if want == 0 then done(made) return end
  local yaw = self.getRotation().y + 180
  for i, pl in ipairs(places) do
    local pos = trayPoint(pl[1], pl[2], SPAWN_LIFT)
    local function landed(o)
      tracked[o.getGUID()] = true
      if not template then o.setColorTint(dieTint()) end
      fitDie(o)
      made[i] = o
      want = want - 1
      if want == 0 then done(made) end
    end
    if template then
      spawnObjectData({ data = template.data, position = pos, rotation = { 0, yaw, 0 }, scale = template.scale, callback_function = landed })
    else
      spawnObject({ type = "Die_6_Rounded", position = pos, rotation = { 0, yaw, 0 }, scale = { STD_DIE_SCALE, STD_DIE_SCALE, STD_DIE_SCALE }, callback_function = landed })
    end
  end
end

local function loosePlaces(from, n)
  local places = {}
  for i = 1, n do
    local u, v = looseSpot(from + i)
    places[i] = { u, v }
  end
  return places
end

function say(text, colour)
  printToAll(text, colour or sideColour())
end

function onMinus(_, color)
  if MODES[state.mode] == "sum" then return end
  state.mod = clampMod(state.mod - 1)
  render(state.current)
end

function onPlus(_, color)
  if MODES[state.mode] == "sum" then return end
  state.mod = clampMod(state.mod + 1)
  render(state.current)
end

function onMode(_, color, alt)
  if alt then
    if MODES[state.mode] == "bloodbath" then
      state.deadly = not state.deadly
    else
      printToColor("Right click toggles Deadly in Bloodbath mode.", color, MUTED)
      return
    end
  else
    state.mode = state.mode % #MODES + 1
  end
  render(state.current)
end

local function addDice(color, n, template)
  if busy then printToColor("The tray is still rolling.", color, MUTED) return end
  state.mode = 4
  local on = #diceOnTray()
  if on + n > MAX_DICE then
    printToColor("The tray holds " .. MAX_DICE .. " dice.", color, { 1, 0.5, 0 })
    n = MAX_DICE - on
  end
  render(state.current)
  if n > 0 then spawnDice(loosePlaces(on, n), template, function() end) end
end

function onAdd1(_, color) addDice(color, 1, nil) end
function onAdd2(_, color) addDice(color, 2, nil) end
function onAdd3(_, color) addDice(color, 3, nil) end
function onAdd4(_, color) addDice(color, 4, nil) end
function onAddD3(_, color)
  local t = d3Template()
  if not t then printToColor("The d3 bag is missing.", color, { 1, 0.5, 0 }) return end
  addDice(color, 1, t)
end

function onRoll(_, color)
  if busy then printToColor("The tray is still rolling.", color, MUTED) return end
  local mode = MODES[state.mode]
  local dice = diceOnTray()
  if mode == "sum" then
    if #dice == 0 then
      printToColor("Add dice first (+1d6 .. +d3), or drop dice on the tray.", color, MUTED)
      return
    end
    busy = true
    for i, d in ipairs(dice) do
      if i <= MAX_DICE then tracked[d.getGUID()] = true; d.roll() else d.destruct() end
    end
    awaitSettle(color)
    return
  end
  local template = pickTemplate(dice)
  for _, d in ipairs(dice) do d.destruct() end
  tracked = {}
  busy = true
  spawnDice(loosePlaces(0, rollCount(mode, state.deadly, state.mod)), template, function(made)
    Wait.frames(function()
      for _, d in ipairs(made) do if not d.isDestroyed() then d.roll() end end
      awaitSettle(color)
    end, 3)
  end)
end

-- Not yet measured (DESIGN live check 2): the timeout is a placeholder until the p95 of
-- time-to-rest is known.
REST_DELAY = 0.5
REST_TIMEOUT = 10

function awaitSettle(color)
  settleGen = settleGen + 1
  local gen = settleGen
  Wait.time(function()
    Wait.condition(function()
      if gen == settleGen then settle(color, false) end
    end, function()
      for g in pairs(tracked) do
        local o = getObjectFromGUID(g)
        if o and o.held_by_color ~= nil then return false end
      end
      for _, d in ipairs(diceOnTray()) do
        if not d.resting then return false end
      end
      return true
    end, REST_TIMEOUT, function()
      if gen == settleGen then settle(color, true) end
    end)
  end, REST_DELAY)
end

function settle(color, timedOut)
  local dice = diceOnTray()
  untrackMissing(dice)
  if #dice == 0 then busy = false return end
  if timedOut then say(SIDE .. ": dice still moving; reading the faces as they are.", MUTED) end
  local entries = {}
  for i, d in ipairs(dice) do
    if i <= MAX_DICE then
      tracked[d.getGUID()] = true
      local face, raw = faceOf(d)
      entries[#entries + 1] = { die = d, face = face, raw = raw }
    end
  end
  local mode = MODES[state.mode]
  local lowest = keepsLowest(mode, state.mod)
  table.sort(entries, function(a, b)
    if a.face ~= b.face then return before(a.face, b.face, lowest) end
    return a.die.getGUID() < b.die.getGUID()
  end)
  local values = {}
  for i, e in ipairs(entries) do values[i] = e.face end
  local r = resolve(values, mode, state.mod, state.deadly)
  r.raws, r.d3 = {}, {}
  for i, e in ipairs(entries) do
    r.raws[i] = e.raw
    r.d3[i] = e.die.getName() == D3_NAME
  end
  local t = pickTemplate({ entries[1].die })
  if t and not t.d3 then r.template = t end
  arrange(entries, r)
  publish(r)
  busy = false
end

function arrange(entries, r)
  arrangingUntil = os.time() + 2
  for i, e in ipairs(entries) do
    local d = e.die
    d.setPositionSmooth(trayPoint(slotU(i, r.n, r.k, TRAY_ROW), ROW_V, ARRANGE_LIFT), false, true)
    if r.mode ~= "sum" and i <= r.k then d.highlightOn(GOLD) else d.highlightOff() end
    Wait.time(function()
      if not d.isDestroyed() then d.setRotationValue(e.raw) end
    end, 0.6)
  end
end

function publish(r)
  state.rollNo = state.rollNo + 1
  r.no = state.rollNo
  r.side = SIDE
  pushHistory(state, state.current)
  state.current = r
  render(r)
  sendToBoard(r)
  say(chatLine(SIDE, r))
end

function sendToBoard(r)
  local board = getObjectFromGUID(BOARD_FOR[SIDE])
  if not board then return end
  local copy = nil
  if r then
    copy = {}
    for k, v in pairs(r) do if k ~= "template" then copy[k] = v end end
  end
  board.call("showRoll", { side = SIDE, result = copy })
end

function onClear(_, color)
  busy = false
  settleGen = settleGen + 1
  for _, d in ipairs(diceOnTray()) do d.destruct() end
  tracked = {}
  pushHistory(state, state.current)
  state.current = nil
  render(nil)
  sendToBoard(nil)
end

function onLastRoll(_, color, alt)
  if alt then
    local list = {}
    for _, r in ipairs(state.history) do list[#list + 1] = r end
    if state.current then list[#list + 1] = state.current end
    if #list == 0 then printToColor("No rolls yet.", color, MUTED) return end
    for i = math.max(1, #list - HISTORY + 1), #list do
      printToColor("#" .. tostring(list[i].no or "?") .. " " .. chatLine(SIDE, list[i]), color, sideColour())
    end
    return
  end
  if busy then printToColor("The tray is still rolling.", color, MUTED) return end
  local r = table.remove(state.history)
  if not r then printToColor("No earlier roll to restore.", color, MUTED) return end
  settleGen = settleGen + 1
  for _, d in ipairs(diceOnTray()) do d.destruct() end
  tracked = {}
  busy = true
  local d3
  local places = {}
  for i = 1, r.n do places[i] = { slotU(i, r.n, r.k, TRAY_ROW), ROW_V } end
  local pending = r.n
  local made = {}
  local function finish()
    for i, d in ipairs(made) do
      local raw = (r.raws and r.raws[i]) or r.values[i]
      if r.mode ~= "sum" and i <= r.k then d.highlightOn(GOLD) end
      Wait.frames(function() if not d.isDestroyed() then d.setRotationValue(raw) end end, 2)
    end
    state.current = r
    render(r)
    sendToBoard(r)
    say(SIDE .. " restored #" .. tostring(r.no or "?") .. ": " .. chatLine(SIDE, r))
    busy = false
  end
  if pending == 0 then finish() return end
  for i = 1, r.n do
    local template = r.template
    if r.d3 and r.d3[i] then
      d3 = d3 or d3Template()
      template = d3
    end
    spawnDice({ places[i] }, template, function(one)
      made[i] = one[1]
      pending = pending - 1
      if pending == 0 then finish() end
    end)
  end
end

function onObjectRandomize(obj, color)
  if tracked[obj.getGUID()] and not busy and os.time() >= arrangingUntil then
    busy = true
    awaitSettle(color)
  end
end

function onObjectDrop(color, obj)
  if tracked[obj.getGUID()] and not busy and os.time() >= arrangingUntil then
    busy = true
    awaitSettle(color)
  end
end

function onObjectDestroy(obj)
  tracked[obj.getGUID()] = nil
end
