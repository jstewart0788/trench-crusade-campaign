-- FTC-GUID: e24b01,e24b02
-- Opponent board (TC-024): a read-only copy of the other player's last roll, in the slot
-- the dice-camera screen had. The other side's tray calls showRoll after every settle,
-- re-roll, Last roll and Clear; the board only edits its fixed widgets.
--
-- Everything above the "TTS glue" line touches no TTS global, so
-- mod/test/dice_tray_test.lua runs it under plain Lua.

MAX_DICE = 12
DOT = " · "
MINUS = "−"
MODE_NAME = { success = "Success", injury = "Injury", bloodbath = "Bloodbath", sum = "Sum" }

-- Inches in the reader's frame (u to their right, v toward them) on a 10.6 x 11.15 tile.
BOARD_HALF = { u = 5.3, v = 5.575 }
BOARD_ROW = { u0 = -4.55, width = 9.1, pitch = 1.0, gap = 0.3 }
CHIP_IN = 0.8
CHIP_V = -1.8
BRACKET_V = { top = -2.62, tick = -2.45 }
CHIP_PAD = 0.1

UNITS_PER_LOCAL = 500
HEIGHT_UNITS_PER_LOCAL = 650
LINE_PER_FONT = 0.76 / 375
WIDGET_Y = 0.2
LINE_THICKNESS = 0.05

LIGHT = { 0.95, 0.92, 0.85 }
MUTED = { 0.61, 0.59, 0.55 }
FAINT = { 0.33, 0.33, 0.33 }
DARK = { 0.08, 0.08, 0.08 }
MAT = { 0.08, 0.08, 0.08 }
GOLD = { 0.85, 0.70, 0.32 }
GREEN = { 0.18, 0.49, 0.2 }
DANGER = { 0.5, 0.14, 0.12 }
CHIP_DROPPED = { 0.23, 0.23, 0.23 }
CHIP_DROPPED_TEXT = { 0.74, 0.72, 0.67 }
SIDE_COLOUR = { Red = { 0.55, 0.12, 0.12 }, Blue = { 0.12, 0.3, 0.6 } }
DIE_COLOUR = { Red = { 0.77, 0.16, 0.13 }, Blue = { 0.18, 0.44, 0.84 } }
VERDICT_BG = { SUCCESS = GREEN, FAILURE = DANGER, CRITICAL = GOLD }

function slotU(i, n, k, row)
  local g = (k < n) and row.gap or 0
  local pitch = row.pitch
  if n > 1 then pitch = math.min(row.pitch, (row.width - g) / (n - 1)) end
  local u = row.u0 + (i - 1) * pitch
  if i > k then u = u + g end
  return u
end

-- Chips shrink when twelve dice bring the pitch under a chip and its gap.
function chipSize(n, k)
  if n < 2 then return CHIP_IN end
  local g = (k < n) and BOARD_ROW.gap or 0
  local pitch = math.min(BOARD_ROW.pitch, (BOARD_ROW.width - g) / (n - 1))
  return math.min(CHIP_IN, pitch - 0.1)
end

function modLabel(mode, mod)
  local word = (mode == "injury" or mode == "bloodbath") and "INJURY DICE" or "DICE"
  if mod == 0 then return "0 " .. word end
  return (mod > 0 and "+" or MINUS) .. math.abs(mod) .. " " .. word
end

function modeLine(r)
  if r.mode == "sum" then return "Sum" .. DOT .. "keep all" end
  local name = MODE_NAME[r.mode]
  if r.mode == "bloodbath" and r.deadly then name = "Deadly Bloodbath" end
  return name .. DOT .. modLabel(r.mode, r.mod) .. DOT .. "keep " .. r.k .. (r.lowest and " lowest" or " highest")
end

local function faceU(i)
  return -BOARD_HALF.u + 1.1 + (i - 1) * ((2 * BOARD_HALF.u - 2.2) / 5)
end

function boardSpecs()
  local specs = {}
  local function text(id, u, v, w, h, font, fg, bg)
    specs[#specs + 1] = { id = id, label = "", u = u, v = v, w = w, h = h, font = font, fg = fg or LIGHT, bg = bg or MAT }
  end
  text("header", 0, -4.7375, 2 * BOARD_HALF.u - 0.5, 1.1, 0.42, LIGHT, SIDE_COLOUR.Blue)
  text("mode", 0, -3.5, 10.0, 0.55, 0.32)
  for i = 1, MAX_DICE do
    text("chip" .. i, slotU(i, MAX_DICE, MAX_DICE, BOARD_ROW), CHIP_V, CHIP_IN, CHIP_IN, 0.5, LIGHT, MAT)
  end
  text("total", -2.4, 0.15, 2.4, 1.5, 1.45, GOLD)
  text("caption", -2.4, 1.2, 2.4, 0.55, 0.26, MUTED)
  text("verdict", 1.65, 0.15, 4.5, 0.8, 0.38)
  text("all", 0, 2.25, 9.0, 0.55, 0.32)
  for f = 1, 6 do
    text("face" .. f, faceU(f), 3.0, 0.9, 0.55, 0.26, MUTED)
    text("count" .. f, faceU(f), 3.75, 0.9, 0.6, 0.42)
  end
  text("footer", 0, 4.8, 9.0, 0.55, 0.25, FAINT)
  return specs
end

-- feed is the side whose rolls this board shows; r is its last result (nil: none or cleared).
function boardView(feed, r)
  local v = {}
  local no = (r and r.no) and ("   #" .. r.no) or ""
  v.header = { label = string.upper(feed) .. DOT .. "LAST ROLL" .. no, bg = SIDE_COLOUR[feed] }
  v.footer = { label = "read-only" .. DOT .. "redrawn when " .. feed .. "'s dice settle" }
  local n = r and r.n or 0
  v.mode = { label = n > 0 and modeLine(r) or "no roll on the tray" }
  local chip = chipSize(n, r and r.k or 0)
  for i = 1, MAX_DICE do
    if i <= n then
      local kept = r.mode == "sum" or i <= r.k
      v["chip" .. i] = {
        label = tostring(r.values[i]), u = slotU(i, n, r.k, BOARD_ROW), w = chip, h = chip,
        bg = kept and DIE_COLOUR[feed] or CHIP_DROPPED, fg = kept and LIGHT or CHIP_DROPPED_TEXT,
      }
    else
      v["chip" .. i] = { label = "", u = slotU(i, MAX_DICE, MAX_DICE, BOARD_ROW), w = CHIP_IN, h = CHIP_IN, bg = MAT, fg = LIGHT }
    end
  end
  v.total = { label = n > 0 and tostring(r.total) or "" }
  v.caption = { label = n > 0 and (r.mode == "sum" and "sum" or "kept total") or "" }
  if n > 0 and r.verdict then
    v.verdict = { label = r.verdict, bg = VERDICT_BG[r.verdict], fg = r.verdict == "CRITICAL" and DARK or LIGHT, font = 0.38 }
  elseif n > 0 and (r.mode == "injury" or r.mode == "bloodbath") then
    v.verdict = { label = "before INJURY MODIFIERS", bg = MAT, fg = MUTED, font = 0.27 }
  else
    v.verdict = { label = "", bg = MAT, fg = LIGHT, font = 0.38 }
  end
  v.all = { label = n > 0 and (n .. " dice" .. DOT .. "all ∑ " .. r.all) or "" }
  for f = 1, 6 do
    local c = r and r.counts and r.counts[f] or 0
    v["face" .. f] = { label = f .. "s" }
    v["count" .. f] = { label = c > 0 and tostring(c) or "·", fg = c > 0 and LIGHT or FAINT }
  end
  return v
end

function boardMarks(r)
  local lines = {}
  if not r or r.n == 0 or r.mode == "sum" then return lines end
  local chip = chipSize(r.n, r.k)
  local h = chip / 2 + CHIP_PAD
  for i = 1, r.k do
    local u = slotU(i, r.n, r.k, BOARD_ROW)
    lines[#lines + 1] = { { u - h, CHIP_V - h }, { u + h, CHIP_V - h }, { u + h, CHIP_V + h }, { u - h, CHIP_V + h }, { u - h, CHIP_V - h } }
  end
  if r.k < r.n then
    local a = slotU(1, r.n, r.k, BOARD_ROW) - h
    local b = slotU(r.k, r.n, r.k, BOARD_ROW) + h
    lines[#lines + 1] = { { a, BRACKET_V.tick }, { a, BRACKET_V.top }, { b, BRACKET_V.top }, { b, BRACKET_V.tick } }
  end
  return lines
end

local function round(x) return math.floor(x + 0.5) end

function toButton(spec, s)
  return {
    label = spec.label or "",
    click_function = "noop",
    tooltip = "",
    position = { spec.u / s, WIDGET_Y, spec.v / s },
    rotation = { 0, 0, 0 },
    width = round(spec.w * UNITS_PER_LOCAL / s),
    height = round(spec.h * HEIGHT_UNITS_PER_LOCAL / s),
    font_size = round(spec.font / (s * LINE_PER_FONT)),
    color = spec.bg, hover_color = spec.bg, press_color = spec.bg,
    font_color = spec.fg,
  }
end

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

FEED = "Blue"
buttonIndex = {}
specById = {}
shown = nil

function noop() end

function onLoad()
  FEED = self.getPosition().z >= 0 and "Blue" or "Red"
  self.clearButtons()
  local s = self.getScale().x
  for i, spec in ipairs(boardSpecs()) do
    local p = toButton(spec, s)
    p.function_owner = self
    self.createButton(p)
    buttonIndex[spec.id] = i - 1
    specById[spec.id] = spec
  end
  render(nil)
end

function showRoll(params)
  if type(params) ~= "table" or params.side ~= FEED then return end
  shown = params.result
  render(shown)
end

function render(r)
  local s = self.getScale().x
  for id, e in pairs(boardView(FEED, r)) do
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
  local b = self.getBounds()
  local lift = b.center.y + b.size.y / 2 - self.getPosition().y + 0.03
  self.setVectorLines(toLines(boardMarks(r), self.getScale(), lift, GOLD))
end
