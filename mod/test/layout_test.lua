-- Offline test for the player-side table layout (TC-023v).
--
--     lua mod/test/layout_test.lua [--dump <file>]     (from the repo root; pnpm mod:test)
--
-- Runs the real dice tray (acae21.lua), roller (17ca2b.lua) and importer (b91983.lua)
-- scripts against a stubbed TTS API, with every transform read from mod/save.json, and
-- checks: the tray's widgets are square, inside the half-length mat and apart; the roller's
-- result rows for 1-10 dice land inside the mat, clear of the readout, the widgets, the
-- bowl and the spawn slots; no furniture enters the 51" square kept for a 48" board or
-- touches other furniture; Blue mirrors Red; the importer still resolves its mat anchors.
-- --dump writes every footprint as "RECT kind name x0 z0 x1 z1" for the layout diagram.

local here = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = here .. "/../.."
local DUMP = arg and arg[1] == "--dump" and arg[2] or nil

local failures, checks = 0, 0
local function check(cond, what)
  checks = checks + 1
  if not cond then
    failures = failures + 1
    print("FAIL: " .. what)
  end
end

local function read(path)
  local fh = assert(io.open(path, "rb"))
  local text = fh:read("a")
  fh:close()
  return text
end

---------------------------------------------------------------- json --

local function decode(s)
  local i = 1
  local value
  local function ws() i = s:find("[^ \t\r\n]", i) or #s + 1 end
  local ESC = { n = "\n", t = "\t", r = "\r", b = "\b", f = "\f", ['"'] = '"', ["\\"] = "\\", ["/"] = "/" }
  local function str()
    local out, j = {}, i + 1
    while true do
      local run = s:match('^[^"\\]+', j)
      if run then out[#out + 1] = run; j = j + #run end
      local c = s:sub(j, j)
      if c == '"' then i = j + 1; return table.concat(out) end
      local e = s:sub(j + 1, j + 1)
      if e == "u" then
        out[#out + 1] = utf8.char(tonumber(s:sub(j + 2, j + 5), 16))
        j = j + 6
      else
        out[#out + 1] = assert(ESC[e], "bad escape")
        j = j + 2
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
    elseif c == '"' then return str()
    elseif s:sub(i, i + 3) == "true" then i = i + 4; return true
    elseif s:sub(i, i + 4) == "false" then i = i + 5; return false
    elseif s:sub(i, i + 3) == "null" then i = i + 4; return nil
    end
    local num = s:match("^-?%d+%.?%d*[eE]?[-+]?%d*", i)
    i = i + #num
    return tonumber(num)
  end
  return value()
end

local save = decode(read(root .. "/mod/save.json"))
local OBJ = {}
for _, o in ipairs(save.ObjectStates) do OBJ[o.GUID] = o end
local function T(guid) return assert(OBJ[guid], guid).Transform end

---------------------------------------------------------------- geometry --

-- Measured: the LCT tray face is 57.11 x 11.15 at scale 3.75 (15.23 x 2.973 local).
local TRAY_LOCAL_HALF = { u = 57.11 / 3.75 / 2, v = 11.15 / 3.75 / 2 }
-- Widget units: 500 per local unit of width, 650 per local unit of height (mod/TESTING.md).
-- Text, read off a screenshot of the 3.75 tray: at font 100 (font x button scale) a line is
-- 0.76" tall and a character 0.355" wide. Estimates, so rows keep CLEAR from it.
local CHAR_W, LINE_H, CLEAR = 0.355 / 375, 0.76 / 375, 0.1
local DIE = 0.7

local function rect(cu, cv, w, h) return { u0 = cu - w / 2, u1 = cu + w / 2, v0 = cv - h / 2, v1 = cv + h / 2 } end
local function overlap(a, b, gap)
  gap = gap or 0
  return a.u0 < b.u1 + gap and b.u0 < a.u1 + gap and a.v0 < b.v1 + gap and b.v0 < a.v1 + gap
end
local function inside(a, b) return a.u0 >= b.u0 - 1e-9 and a.u1 <= b.u1 + 1e-9 and a.v0 >= b.v0 - 1e-9 and a.v1 <= b.v1 + 1e-9 end
local function union(a, b) return { u0 = math.min(a.u0, b.u0), u1 = math.max(a.u1, b.u1), v0 = math.min(a.v0, b.v0), v1 = math.max(a.v1, b.v1) } end
local function fmt(r) return string.format("[%.2f..%.2f]x[%.2f..%.2f]", r.u0, r.u1, r.v0, r.v1) end

-- World <-> the seated player's frame of a tray (u to their right, v toward them). The map
-- is its own inverse.
local function toFrame(t, x, z)
  local a = math.rad(t.rotY)
  local dx, dz = x - t.posX, z - t.posZ
  return -dx * math.cos(a) + dz * math.sin(a), dx * math.sin(a) + dz * math.cos(a)
end

---------------------------------------------------------------- TTS stubs --

local timers = {}
local function newEnv(selfObj, extra)
  local env = {
    self = selfObj,
    Wait = {
      condition = function() end,
      frames = function() end,
      time = function(fn, delay) timers[#timers + 1] = { fn = fn, delay = delay or 0 }; return #timers end,
      stop = function(id) if timers[id] then timers[id].stopped = true end end,
    },
    addHotkey = function() end,
    printToColor = function() end,
    printToAll = function(msg) if tostring(msg):find("failed") then env.errors[#env.errors + 1] = msg end end,
    broadcastToAll = function() end,
    broadcastToColor = function() end,
    stringColorToRGB = function() return { 1, 1, 1 } end,
    Player = setmetatable({}, { __index = function() return { steam_name = "tester", clearSelectedObjects = function() end } end }),
    Vector = function(x, y, z) return { x, y, z } end,
    errors = {},
  }
  for k, v in pairs(extra or {}) do env[k] = v end
  return setmetatable(env, { __index = _G })
end

local function runFile(path, env, moonsharp)
  local src = read(path)
  if moonsharp then src = src:gsub("!=", "~=") end
  assert(load(src, "@" .. path, "t", env))()
end

local function flushTimers()
  local i = 1
  while i <= #timers do
    local t = timers[i]
    if not t.stopped and t.delay < 1 then t.stopped = true; t.fn() end
    i = i + 1
  end
  timers = {}
end

local GLOBAL_VARS = {
  redCustomDiceMat_GUID = "acae21", blueCustomDiceMat_GUID = "839fcc",
  redCustomDiceRoller_GUID = "17ca2b", blueCustomDiceRoller_GUID = "927ca1",
  mat_GUID = "4ee1f2", felt_GUID = "28865a", FTC_Global_Ready = true,
}
local Global = { getVar = function(k) return GLOBAL_VARS[k] end, call = function() end }

local function copy(t) local c = {} for k, v in pairs(t) do c[k] = v end return c end

local function trayObject(guid)
  local t = T(guid)
  local o = { guid = guid, buttons = {}, inputs = {}, resting = true, description = "" }
  o.getGUID = function() return guid end
  o.getPosition = function() return { x = t.posX, y = t.posY, z = t.posZ } end
  o.getRotation = function() return { x = 0, y = t.rotY, z = 0 } end
  o.getScale = function() return { x = t.scaleX, y = t.scaleY, z = t.scaleZ } end
  o.getBounds = function()
    return { center = { x = t.posX, y = t.posY + 0.05, z = t.posZ },
      size = { x = 2 * TRAY_LOCAL_HALF.u * t.scaleX, y = 0.1, z = 2 * TRAY_LOCAL_HALF.v * t.scaleZ } }
  end
  o.createButton = function(p) local c = copy(p); c.index = #o.buttons; o.buttons[#o.buttons + 1] = c end
  o.createInput = function(p) o.inputs[#o.inputs + 1] = copy(p) end
  o.getButtons = function() return o.buttons end
  o.editButton = function(p) local b = o.buttons[p.index + 1]; for k, v in pairs(p) do b[k] = v end end
  o.getDescription = function() return o.description end
  o.setDescription = function(d) o.description = d end
  return o, t
end

local function loadTray(guid)
  local obj, t = trayObject(guid)
  local env = newEnv(obj, {
    Global = Global,
    JSON = { encode_pretty = function() return '{"Update_Frequency":"0.2"}' end, decode = function() return { Update_Frequency = "0.2" } end },
    getAllObjects = function() return {} end,
    getObjectFromGUID = function() return nil end,
  })
  runFile(root .. "/mod/scripts/" .. guid .. ".lua", env, true)
  env.onload()
  return { obj = obj, t = t, env = env, half = rect(0, 0, 2 * TRAY_LOCAL_HALF.u * t.scaleX, 2 * TRAY_LOCAL_HALF.v * t.scaleZ) }
end

---------------------------------------------------------------- tray widgets --

local function lines(label)
  local n, widest = 0, 0
  for line in (tostring(label) .. "\n"):gmatch("(.-)\n") do
    n = n + 1
    widest = math.max(widest, utf8.len(line) or #line)
  end
  return n, widest
end

-- Button or input -> its world rect in the tray frame: the box, grown to its text.
local function widgetRect(tray, b)
  local s = tray.obj.getScale()
  local sc = b.scale or { 1, 1, 1 }
  local wx, wz = sc[1] * s.x, sc[3] * s.z
  local cu, cv = b.position[1] * s.x, b.position[3] * s.z
  local r = rect(cu, cv, (b.width or 0) * wx / 500, (b.height or 0) * wz / 650)
  local label = b.label or ""
  if label ~= "" and (b.font_size or 0) > 1 then
    local n, widest = lines(label)
    r = union(r, rect(cu, cv, widest * b.font_size * wx * CHAR_W, n * b.font_size * wz * LINE_H))
  end
  return r, wx, wz
end

local function widgets(tray)
  local out = {}
  local bs = tray.obj.buttons
  local i = 1
  while i <= #bs do
    local b = bs[i]
    local r = widgetRect(tray, b)
    local name = (b.label ~= "" and b.label or b.click_function):gsub("\n", " ")
    local nxt = bs[i + 1]
    -- A tool button is a borderless backing button plus its top, at one spot.
    if nxt and nxt.click_function == b.click_function and b.label == "" and nxt.position[1] == b.position[1] and nxt.position[3] == b.position[3] then
      r = union(r, (widgetRect(tray, nxt)))
      name = (nxt.label ~= "" and nxt.label or nxt.click_function):gsub("\n", " ")
      i = i + 1
    end
    if i == 1 then name = "readout" end
    out[#out + 1] = { name = name, r = r, button = b, index = b.index }
    i = i + 1
  end
  for _, input in ipairs(tray.obj.inputs) do
    out[#out + 1] = { name = "input " .. input.label, r = (widgetRect(tray, input)), input = input }
  end
  return out
end

local trays = { Red = loadTray("acae21"), Blue = loadTray("839fcc") }
check(read(root .. "/mod/scripts/acae21.lua") == read(root .. "/mod/scripts/839fcc.lua"), "the two tray scripts are identical")
check(read(root .. "/mod/scripts/17ca2b.lua") == read(root .. "/mod/scripts/927ca1.lua"), "the two roller scripts are identical")

for colour, tray in pairs(trays) do
  local t = tray.t
  check(math.abs(2 * TRAY_LOCAL_HALF.u * t.scaleX - 57.11 / 2) < 0.01, colour .. " tray is half the LCT length: " .. 2 * TRAY_LOCAL_HALF.u * t.scaleX)
  check(math.abs(2 * TRAY_LOCAL_HALF.v * t.scaleZ - 11.15) < 0.01, colour .. " tray keeps the LCT depth")
  check(#tray.obj.buttons == 46 and #tray.obj.inputs == 1, colour .. " tray creates 46 buttons and the bubble-size input, got " .. #tray.obj.buttons)

  for _, b in ipairs(tray.obj.buttons) do
    local _, wx, wz = widgetRect(tray, b)
    if b.index == 1 then
      -- LCT's readout divider is drawn tall on purpose (scale 0.25, 2, 1 at 3.75).
      check(math.abs(wx - 0.25 * 3.75) < 1e-9 and math.abs(wz - 3.75) < 1e-9, colour .. " readout divider keeps its LCT world size")
    else
      check(math.abs(wx - wz) < 1e-9, colour .. " widget '" .. tostring(b.label) .. "' is square in the world (text not squashed): " .. wx .. " vs " .. wz)
    end
  end

  local list = widgets(tray)
  tray.widgets = list
  for _, w in ipairs(list) do
    if w.index ~= 1 then
      check(inside(w.r, tray.half), colour .. " widget '" .. w.name .. "' on the mat: " .. fmt(w.r))
    end
  end
  for a = 1, #list do
    for b = a + 1, #list do
      local wa, wb = list[a], list[b]
      local pair = (wa.button and wa.button.click_function == "none" and wb.input) or (wb.button and wb.button.click_function == "none" and wa.input)
      if wa.index ~= 0 and wb.index ~= 0 and wa.index ~= 1 and wb.index ~= 1 and not pair then
        check(not overlap(wa.r, wb.r), colour .. " widgets apart: '" .. wa.name .. "' " .. fmt(wa.r) .. " / '" .. wb.name .. "' " .. fmt(wb.r))
      end
    end
  end
end

---------------------------------------------------------------- readout --

-- The readout's real labels, from checkDice over dice lying in the dice area.
local function readoutRect(tray, values)
  local env = tray.env
  local x0, x1, z0, z1 = env.diceAreaBounds()
  local dice = {}
  for k, v in ipairs(values) do
    local p = { x = x0 + (x1 - x0) * k / (#values + 1), y = tray.t.posY + 0.5, z = (z0 + z1) / 2 }
    dice[k] = { tag = "Dice", resting = true, getPosition = function() return p end, getValue = function() return v end }
  end
  env.getAllObjects = function() return dice end
  env.checkDice()
  local b = tray.obj.buttons[1]
  return (widgetRect(tray, b)), b.label
end

local rng = 20261105
local function rand(n) rng = (rng * 1103515245 + 12345) % 2147483648; return rng % n + 1 end

for colour, tray in pairs(trays) do
  local worst, worstLabel = nil, nil
  local sets = { { 6, 6, 6, 6, 6, 6, 6, 6, 6, 6 }, { 1, 2, 3, 4, 5, 6, 6, 5, 6, 6 }, { 1, 1 }, { 3 } }
  for _ = 1, 300 do
    local v = {}
    for k = 1, rand(10) do v[k] = rand(6) end
    sets[#sets + 1] = v
  end
  for _, v in ipairs(sets) do
    local r, label = readoutRect(tray, v)
    if not worst or (r.u1 - r.u0) * (r.v1 - r.v0) > (worst.u1 - worst.u0) * (worst.v1 - worst.v0) then worstLabel = label end
    worst = worst and union(worst, r) or r
  end
  tray.readout = worst
  check(lines(worstLabel) == 8, colour .. " readout's tallest label has 8 lines")
  check(inside(worst, tray.half), colour .. " readout on the mat: " .. fmt(worst))
  for _, w in ipairs(tray.widgets) do
    if w.index ~= 0 and w.index ~= 1 then
      check(not overlap(worst, w.r, CLEAR), colour .. " readout clear of '" .. w.name .. "': " .. fmt(worst) .. " / " .. fmt(w.r))
    end
  end
end

---------------------------------------------------------------- roller --

local function rollerObject(guid)
  local t = T(guid)
  local o = { taken = {}, entered = {} }
  o.getGUID = function() return guid end
  o.getPosition = function() return { x = t.posX, y = t.posY, z = t.posZ } end
  o.getRotation = function() return { x = 0, y = t.rotY, z = 0 } end
  o.getDescription = function() return "" end
  o.setDescription = function() end
  o.getObjects = function() local l = {} for _, d in ipairs(o.entered) do l[#l + 1] = { guid = d.guid } end return l end
  o.takeObject = function(p) o.taken[#o.taken + 1] = p end
  return o, t
end

local DESC = { Results = "no", SmoothDice = "no", RotateDice = "no", Rows = "yes", SortNoRows = "asc", Step = 1.05 }
local function loadRoller(guid, tray)
  local obj, t = rollerObject(guid)
  local env = newEnv(obj, {
    Global = Global,
    JSON = { decode = function() return copy(DESC) end, encode_pretty = function() return "" end },
    getObjectFromGUID = function() return nil end,
  })
  runFile(root .. "/mod/scripts/" .. guid .. ".lua", env, false)
  env.objectToPlaceDiceOn = {
    getPosition = tray.obj.getPosition, getRotation = tray.obj.getRotation,
    call = function(name, params) return tray.env[name](params) end,
  }
  return { obj = obj, t = t, env = env }
end

local rollers = { Red = loadRoller("17ca2b", trays.Red), Blue = loadRoller("927ca1", trays.Blue) }

local function bowlRect(tray, roller)
  local u, v = toFrame(tray.t, roller.t.posX, roller.t.posZ)
  -- The bowl's frame, measured off the same screenshot as the text: about 2.5 x 1.
  return rect(u, v, 2.6, 1.6), u, v
end

local function slotRects(tray)
  local out = {}
  for i = 0, 9 do
    local p = tray.env.diceSlot(i)
    local u, v = toFrame(tray.t, p.x, p.z)
    out[#out + 1] = rect(u, v, DIE, DIE)
  end
  return out
end

-- Every multiset of 1-10 d6 values, laid out by the roller's own resultOffset.
local function multisets(n, from, acc, out)
  if #acc == n then out[#out + 1] = { table.unpack(acc) }; return out end
  for v = from, 6 do acc[#acc + 1] = v; multisets(n, v, acc, out); acc[#acc] = nil end
  return out
end

for colour, roller in pairs(rollers) do
  local tray = trays[colour]
  local env = roller.env
  local layout = env.resultLayout(DESC.Step)
  check(layout == tray.env.RESULT_LAYOUT, colour .. " roller takes its row layout from its tray")
  local bowl, bu, bv = bowlRect(tray, roller)
  local snap = OBJ[tray.obj.guid].AttachedSnapPoints[1].Position
  local s = tray.obj.getScale()
  check(math.abs(-snap.x * s.x - bu) < 1e-3 and math.abs(snap.z * s.z - bv) < 1e-3, colour .. " bowl sits on the tray's snap point")
  check(inside(bowl, tray.half), colour .. " bowl on the mat: " .. fmt(bowl))
  for _, w in ipairs(tray.widgets) do
    if w.index ~= 1 then check(not overlap(bowl, w.r), colour .. " bowl clear of '" .. w.name .. "'") end
  end
  check(not overlap(bowl, tray.readout, CLEAR), colour .. " bowl clear of the readout")
  local slots = slotRects(tray)
  for i, r in ipairs(slots) do
    check(inside(r, tray.half), colour .. " spawn slot " .. i .. " on the mat")
    check(not overlap(r, bowl), colour .. " spawn slot " .. i .. " clear of the bowl")
    check(not overlap(r, tray.readout, CLEAR), colour .. " spawn slot " .. i .. " clear of the readout")
    for _, w in ipairs(tray.widgets) do
      if w.index ~= 0 and w.index ~= 1 then check(not overlap(r, w.r), colour .. " spawn slot " .. i .. " clear of '" .. w.name .. "'") end
    end
  end
  local x0, x1, z0, z1 = tray.env.diceAreaBounds()
  local function inArea(x, z) return x > x0 and x < x1 and z > z0 and z < z1 end
  for i = 0, 9 do local p = tray.env.diceSlot(i); check(inArea(p.x, p.z), colour .. " spawn slot " .. i .. " counted by the readout") end

  local bad, sets = 0, 0
  for n = 1, 10 do
    for _, values in ipairs(multisets(n, 1, {}, {})) do
      sets = sets + 1
      local seen = {}
      for _, v in ipairs(values) do
        seen[v] = (seen[v] or 0) + 1
        local du, dv = env.resultOffset(layout, DESC.Step, v, seen[v])
        local p = env.matPoint(du, dv, 2)
        local u, w = toFrame(tray.t, p[1], p[3])
        local r = rect(u, w, DIE, DIE)
        local ok = inside(r, tray.half) and inArea(p[1], p[3]) and not overlap(r, tray.readout, CLEAR) and not overlap(r, bowl)
        for _, sr in ipairs(slots) do ok = ok and not overlap(r, sr) end
        for _, wd in ipairs(tray.widgets) do
          if wd.index ~= 0 and wd.index ~= 1 then ok = ok and not overlap(r, wd.r) end
        end
        if not ok then
          bad = bad + 1
          if bad <= 3 then print(string.format("  %s die value %d (#%d of %d dice) at %s", colour, v, seen[v], n, fmt(r))) end
        end
      end
    end
  end
  check(bad == 0, colour .. " every result die of " .. sets .. " rolls of 1-10 dice lands on the mat, in the dice area, clear of the readout, widgets, bowl and spawn slots (" .. bad .. " misplaced)")

  -- The same, end to end: dice enter the bowl, the roller rolls and takes them out.
  local mismatched, rolls = 0, 0
  for n = 1, 10 do
    for _ = 1, 20 do
      rolls = rolls + 1
      roller.obj.entered, roller.obj.taken = {}, {}
      local id = env.beginRollBatch({ color = colour, count = n })
      check(id, colour .. " roller accepts a roll")
      for k = 1, n do
        local die = { guid = string.format("d%02d", k), tag = "Dice" }
        die.getGUID = function() return die.guid end
        die.getName = function() return "" end
        die.getCustomObject = function() return nil end
        roller.obj.entered[#roller.obj.entered + 1] = die
        env.setLastHolder({ obj = die, color = colour, rollId = id })
        env.onObjectEnterContainer(roller.obj, die)
      end
      flushTimers()
      check(#env.errors == 0, colour .. " roll ran without error: " .. tostring(env.errors[1]))
      check(#roller.obj.taken == n, colour .. " roller takes out all " .. n .. " dice")
      local seen = {}
      for _, p in ipairs(roller.obj.taken) do
        local v = p.params[1]
        seen[v] = (seen[v] or 0) + 1
        local du, dv = env.resultOffset(layout, DESC.Step, v, seen[v])
        local want = env.matPoint(du, dv, 2)
        if math.abs(want[1] - p.position[1]) > 1e-9 or math.abs(want[3] - p.position[3]) > 1e-9 then mismatched = mismatched + 1 end
        local u, w = toFrame(tray.t, p.position[1], p.position[3])
        local r = rect(u, w, DIE, DIE)
        if not inside(r, tray.half) or overlap(r, tray.readout, CLEAR) then mismatched = mismatched + 1 end
      end
      for _ = 1, n do env.finishRollCallback(id) end
    end
  end
  check(mismatched == 0, colour .. " " .. rolls .. " end-to-end rolls put every die where resultOffset says, on the mat (" .. mismatched .. " off)")
end

---------------------------------------------------------------- furniture --

-- Footprints in world inches (x by z, before the object's quarter turn). "measured" comes
-- from mod/TESTING.md or the brief; the rest are read off screenshots of the live table.
local KEEP_CLEAR = 25.5
local FOOT = {
  tray = function(t) return 2 * TRAY_LOCAL_HALF.u * t.scaleX, 2 * TRAY_LOCAL_HALF.v * t.scaleZ end, -- measured
  importer = { 16, 12 },        -- measured, rotY 270
  panel = { 14.127, 8 },        -- the tracker's measured collider; the Battlefield tile is a copy
  theme = { 15.72, 6.98 },      -- the XML panel: 786 x 349 px at scale 2, 100 px per inch
  tcRoller = { 9.82, 9.82 },    -- the ring it rolls dice on: 3 x scale 1.47 + a die
  counter3 = { 3.6, 3.6 }, bag = { 1.6, 1.6 }, dicebag = { 2.2, 2.2 }, los = { 0.8, 0.8 },
  banner = { 2.5, 2.5 }, trash = { 4.4, 4.4 }, counter = { 3.9, 3.9 },
  screen = { 10.6, 10.6 },      -- the dice-camera screen, either way round
  stopwatch = { 8, 8 }, panelBlock = { 10, 10 },
}
local FURNITURE = {
  { "acae21", "tray", "839fcc" }, { "25b3ac", "tcRoller", "ea3160" }, { "c09349", "screen", "48dcae" },
  { "c0530b", "counter3", "520a95" }, { "0e8265", "counter3", "f14264" }, { "e58368", "counter3", "7a87e9" },
  { "3b0f1d", "bag", "061bfb" }, { "6cecd8", "bag", "c30c00" }, { "fef40e", "bag", "0659ae" },
  { "e75c71", "bag", "9eb271" }, { "d51618", "bag", "359c8c" }, { "70d18f", "bag", "2d4b7e" },
  { "4c054e", "dicebag", "2d9705" }, { "714214", "dicebag", "176bc4" },
  { "546598", "los", "1b3488" }, { "ca16c5", "los", "b1625c" }, { "0dd964", "banner", "0dd965" },
  { "be2cdb", "trash", "4b1a7b" }, { "42c161", "counter", "42c164" },
  { "b91983", "importer" }, { "4ac9e3", "panel" }, { "47de64", "panel" }, { "369707", "theme" },
  { "f4ee71", "stopwatch" }, { "ed17d0", "panelBlock" },
}
local rects = {}
local function addRect(kind, guid, x0, z0, x1, z1)
  rects[#rects + 1] = { kind = kind, guid = guid, u0 = x0, u1 = x1, v0 = z0, v1 = z1 }
end
local function footprint(guid, kind)
  local t = T(guid)
  local f = FOOT[kind]
  local w, d
  if type(f) == "function" then w, d = f(t) else w, d = f[1], f[2] end
  if math.abs(((t.rotY % 180) + 180) % 180 - 90) < 1 then w, d = d, w end
  addRect(kind, guid, t.posX - w / 2, t.posZ - d / 2, t.posX + w / 2, t.posZ + d / 2)
end
for _, f in ipairs(FURNITURE) do
  footprint(f[1], f[2])
  if f[3] then
    footprint(f[3], f[2])
    local a, b = T(f[1]), T(f[3])
    check(math.abs(a.posX + b.posX) < 1e-6 and math.abs(a.posZ + b.posZ) < 1e-6, f[1] .. " / " .. f[3] .. ": Blue mirrors Red through the centre")
  end
end
-- The rules shelf: six PDFs at x 102, z -55..55, scale 5.
addRect("shelf", "rules-shelf", 96, -62, 108, 76)

local square = { u0 = -KEEP_CLEAR, u1 = KEEP_CLEAR, v0 = -KEEP_CLEAR, v1 = KEEP_CLEAR }
for i, a in ipairs(rects) do
  check(not overlap(a, square), a.guid .. " (" .. a.kind .. ") clear of the 51in square: " .. fmt(a))
  for j = i + 1, #rects do
    local b = rects[j]
    check(not overlap(a, b), "furniture apart: " .. a.guid .. " " .. fmt(a) .. " / " .. b.guid .. " " .. fmt(b))
  end
end
for _, h in ipairs({ "f7d85a", "731345" }) do
  local t = T(h)
  local hz = { u0 = t.posX - t.scaleZ / 2, u1 = t.posX + t.scaleZ / 2, v0 = t.posZ - t.scaleX / 2, v1 = t.posZ + t.scaleX / 2 }
  for _, a in ipairs(rects) do check(not overlap(a, hz), a.guid .. " outside hand zone " .. h) end
end

-- Global's onLoad parks each counter 4.52 inside its vortex.
check(math.abs(T("42c161").posX - (T("be2cdb").posX - 4.52)) < 1e-6 and T("42c161").posZ == T("be2cdb").posZ, "Red counter where Global puts it")
check(math.abs(T("42c164").posX - (T("4b1a7b").posX + 4.52)) < 1e-6 and T("42c164").posZ == T("4b1a7b").posZ, "Blue counter where Global puts it")

for colour, ids in pairs({ Red = { die = "ae1f5b", cam = "19b9bf" }, Blue = { die = "c1aaa4", cam = "96a319" } }) do
  local tray = trays[colour]
  local x0, x1, z0, z1 = tray.env.diceAreaBounds()
  local slot = tray.env.diceSlot(0)
  check(math.abs(T(ids.die).posX - slot.x) < 1e-6 and math.abs(T(ids.die).posZ - slot.z) < 1e-6, colour .. " loose die on spawn slot 1, so the next spawn skips it")
  local cam = T(ids.cam)
  check(cam.posX > x0 and cam.posX < x1 and cam.posZ > z0 and cam.posZ < z1, colour .. " dice camera over its own dice area")
  local cu, cv = toFrame(tray.t, cam.posX, cam.posZ)
  local rows = { u0 = tray.env.RESULT_LAYOUT.u, u1 = tray.env.RESULT_LAYOUT.u + 9 * DESC.Step, v0 = tray.env.RESULT_LAYOUT.v, v1 = tray.env.RESULT_LAYOUT.v + 5 * DESC.Step }
  local content = union(tray.readout, rows)
  check(math.abs(cu - (content.u0 + content.u1) / 2) < 0.5 and math.abs(cv - (content.v0 + content.v1) / 2) < 0.5, colour .. " dice camera centred on the readout and result rows")
  local e = rollers[colour].env.ejectPoint(5)
  local er = { u0 = e[1] - DIE, u1 = e[1] + DIE, v0 = e[3] - DIE, v1 = e[3] + DIE }
  for _, a in ipairs(rects) do check(not overlap(er, a), colour .. " ejected dice drop clear of " .. a.guid) end
  check(not overlap(er, square), colour .. " ejected dice drop off the battlefield")
end

---------------------------------------------------------------- importer --

do
  local mat = T("4ee1f2")
  -- Measured live with posY -9.52: getBounds centre y -0.5, size (60, 2.9, 44).
  local bounds = { center = { x = mat.posX, y = mat.posY + 9.02, z = mat.posZ }, size = { x = 36 * mat.scaleX, y = 2.9, z = 36 * mat.scaleZ } }
  local env = newEnv({ getPosition = function() local t = T("b91983"); return { x = t.posX, y = t.posY, z = t.posZ } end }, {
    JSON = { decode = function() return {} end, encode = function() return "{}" end },
    getObjectFromGUID = function(g) if g == "4ee1f2" then return { getBounds = function() return bounds end } end end,
    getAllObjects = function() return {} end,
  })
  runFile(root .. "/mod/scripts/b91983.lua", env, false)
  local found = env.findMat()
  check(found == bounds, "importer still finds the mat anchor 4ee1f2")
  local felt = T("28865a")
  local feltTop = felt.posY + OBJ["28865a"].CustomImage.CustomTile.Thickness * felt.scaleY
  for colour, want in pairs({ Red = { x = -6.25, z = 19 }, Blue = { x = 6.25, z = -19 } }) do
    local a = env.anchorFor(colour, env.self.getPosition(), found)
    check(math.abs(a.x - want.x) < 1e-6 and math.abs(a.z - want.z) < 1e-6, colour .. " import anchor unchanged at (" .. a.x .. ", " .. a.z .. ")")
    check(a.y > feltTop, colour .. " models spawn above the table felt (" .. a.y .. " > " .. feltTop .. ")")
    for i = 1, env.MAX_ROWS do
      local p = env.gridPosition(i, a, env.GRID)
      local r = { u0 = p.x - 0.7, u1 = p.x + 0.7, v0 = p.z - 0.7, v1 = p.z + 0.7 }
      check(inside(r, square), colour .. " model " .. i .. " spawns in the battlefield square")
    end
  end
end

---------------------------------------------------------------- dump --

if DUMP then
  local out = assert(io.open(DUMP, "w"))
  for _, a in ipairs(rects) do out:write(string.format("RECT %s %s %.4f %.4f %.4f %.4f\n", a.kind, a.guid, a.u0, a.v0, a.u1, a.v1)) end
  for colour, tray in pairs(trays) do
    local function world(r, kind, name)
      local p, q = tray.env.trayPoint(r.u0, r.v0), tray.env.trayPoint(r.u1, r.v1)
      out:write(string.format("RECT %s %s %.4f %.4f %.4f %.4f\n", kind, (name:gsub("%s", "_")), math.min(p.x, q.x), math.min(p.z, q.z), math.max(p.x, q.x), math.max(p.z, q.z)))
    end
    for _, w in ipairs(tray.widgets) do if w.index ~= 1 and w.index ~= 0 then world(w.r, "widget", colour .. ":" .. w.name) end end
    world(tray.readout, "readout", colour .. ":readout")
    local L = tray.env.RESULT_LAYOUT
    world({ u0 = L.u - DIE / 2, u1 = L.u + 9 * DESC.Step + DIE / 2, v0 = L.v - DIE / 2, v1 = L.v + 5 * DESC.Step + DIE / 2 }, "rows", colour .. ":result_rows")
    for i, r in ipairs(slotRects(tray)) do world(r, "slot", colour .. ":slot" .. i) end
    world((bowlRect(tray, rollers[colour])), "bowl", colour .. ":bowl")
  end
  out:close()
end

print(string.format("layout_test: %d checks, %d failed", checks, failures))
os.exit(failures == 0 and 0 or 1)
