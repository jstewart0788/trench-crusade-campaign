-- Offline test for the player-side table layout (TC-023v, dice tray rethink TC-024).
--
--     lua mod/test/layout_test.lua [--dump <file>]     (from the repo root; pnpm mod:test)
--
-- Runs the real dice tray (acae21.lua), opponent board (e24b01.lua), Measure & Mark panel
-- (e24c01.lua) and importer (b91983.lua) scripts against a stubbed TTS API, with every
-- transform read from mod/save.json, and checks: each tile's image has its footprint's
-- shape and the tile is unstretched; the widgets each script creates are real-sized, opaque,
-- on their tile and apart; a roll published by one side's tray reaches the board in the
-- other side's strip; no furniture enters the 51" square kept for a 48" board or touches
-- other furniture; Blue mirrors Red; the importer still resolves its mat anchors.
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

local function rect(cu, cv, w, h) return { u0 = cu - w / 2, u1 = cu + w / 2, v0 = cv - h / 2, v1 = cv + h / 2 } end
local function overlap(a, b, gap)
  gap = gap or 0
  return a.u0 < b.u1 + gap and b.u0 < a.u1 + gap and a.v0 < b.v1 + gap and b.v0 < a.v1 + gap
end
local function inside(a, b) return a.u0 >= b.u0 - 1e-9 and a.u1 <= b.u1 + 1e-9 and a.v0 >= b.v0 - 1e-9 and a.v1 <= b.v1 + 1e-9 end
local function fmt(r) return string.format("[%.2f..%.2f]x[%.2f..%.2f]", r.u0, r.u1, r.v0, r.v1) end

-- A Custom_Tile takes its image's proportions: 2 local units deep and 2 x aspect across
-- (the tracker measured 14.13 x 8 at scale 4, the importer 16 x 12 at scale 6).
local function pngSize(name)
  local data = read(root .. "/apps/web/public/tts/" .. name)
  return string.unpack(">I4", data, 17), string.unpack(">I4", data, 21)
end

-- Width units: 500 per local unit; height about 650 (mod/TESTING.md). The API floors both
-- at 60.
local function widgetRect(b, s)
  return rect(b.position[1] * s, b.position[3] * s, (b.width or 0) * s / 500, (b.height or 0) * s / 650)
end

---------------------------------------------------------------- TTS stubs --

local GLOBAL_VARS = {
  redCustomDiceMat_GUID = "acae21", blueCustomDiceMat_GUID = "839fcc",
  redMeasurePanel_GUID = "e24c01", blueMeasurePanel_GUID = "e24c02",
  mat_GUID = "4ee1f2", felt_GUID = "28865a", FTC_Global_Ready = true,
}
local Global = { getVar = function(k) return GLOBAL_VARS[k] end, call = function() end }
local loaded = {}
local chat = {}

local function copy(t) local c = {} for k, v in pairs(t) do c[k] = v end return c end

local function tileObject(guid)
  local t = T(guid)
  local o = { guid = guid, buttons = {}, inputs = {}, lines = nil }
  o.getGUID = function() return guid end
  o.getPosition = function() return { x = t.posX, y = t.posY, z = t.posZ } end
  o.getRotation = function() return { x = 0, y = t.rotY, z = 0 } end
  o.getScale = function() return { x = t.scaleX, y = t.scaleY, z = t.scaleZ } end
  o.getBounds = function() return { center = { x = t.posX, y = t.posY + 0.05, z = t.posZ }, size = { x = 1, y = 0.1, z = 1 } } end
  o.clearButtons = function() o.buttons = {} end
  o.clearInputs = function() o.inputs = {} end
  o.createButton = function(p) local c = copy(p); c.index = #o.buttons; o.buttons[#o.buttons + 1] = c end
  o.createInput = function(p) o.inputs[#o.inputs + 1] = copy(p) end
  o.getButtons = function() return o.buttons end
  o.editButton = function(p) local b = o.buttons[p.index + 1]; for k, v in pairs(p) do b[k] = v end end
  o.setVectorLines = function(l) o.lines = l end
  o.call = function(name, params) return loaded[guid].env[name](params) end
  return o, t
end

local function loadTile(guid, script)
  local obj, t = tileObject(guid)
  local env = setmetatable({
    self = obj, Global = Global,
    Wait = { time = function() end, frames = function() end, condition = function() end },
    addHotkey = function() end,
    printToAll = function(msg) chat[#chat + 1] = msg end,
    printToColor = function() end, broadcastToAll = function() end, broadcastToColor = function() end,
    JSON = { decode = function() return nil end, encode = function() return "{}" end },
    getObjectFromGUID = function(g) return loaded[g] and loaded[g].obj or nil end,
    getAllObjects = function() return {} end,
    Physics = { cast = function() return {} end },
  }, { __index = _G })
  assert(load(read(root .. "/mod/scripts/" .. (script or guid) .. ".lua"), "@" .. guid, "t", env))()
  loaded[guid] = { obj = obj, t = t, env = env }
  return loaded[guid]
end

local TILES = {
  { guid = "acae21", twin = "839fcc", kind = "tray", image = { "dice-tray-red.png", "dice-tray-blue.png" }, size = { 28.6, 11.15 } },
  { guid = "e24b01", twin = "e24b02", kind = "board", image = { "roll-board-blue.png", "roll-board-red.png" }, size = { 10.6, 11.15 } },
  { guid = "e24c01", twin = "e24c02", kind = "measure", image = { "measure-panel.png", "measure-panel.png" }, size = { 9.0, 7.6 } },
}

for _, tile in ipairs(TILES) do
  check(read(root .. "/mod/scripts/" .. tile.guid .. ".lua") == read(root .. "/mod/scripts/" .. tile.twin .. ".lua"), tile.kind .. ": the two scripts are identical")
  for side, guid in ipairs({ tile.guid, tile.twin }) do
    local t = T(guid)
    local o = OBJ[guid]
    check(o.Name == "Custom_Tile" and o.Locked == true, guid .. " is a locked Custom_Tile")
    check(o.CustomImage.ImageURL == "https://tc.rynfin.org/tts/" .. tile.image[side], guid .. " face is " .. tile.image[side])
    check(o.ColorDiffuse.r == 1 and o.ColorDiffuse.g == 1 and o.ColorDiffuse.b == 1, guid .. " is untinted, so the face shows its own colours")
    check(t.scaleX == t.scaleZ and t.scaleY == 1, guid .. " is unstretched across (x = z) and one unit thick")
    local w, h = pngSize(tile.image[side])
    check(math.abs(w / h - tile.size[1] / tile.size[2]) < 0.01, string.format("%s image %dx%d has the footprint's shape %.2f x %.2f", guid, w, h, tile.size[1], tile.size[2]))
    check(math.abs(2 * t.scaleZ - tile.size[2]) < 1e-6, guid .. " scale gives the footprint depth (2 local units deep)")
    check(math.abs(t.rotY % 180) < 1e-9, guid .. " faces a seat")
    check(t.posY >= 0.85 and t.posY <= 0.9, guid .. " sits on the felt (top 0.9)")
  end
end

---------------------------------------------------------------- widgets --

local function opaque(c) return type(c) == "table" and #c >= 3 and (c[4] == nil or c[4] == 1) end

for _, tile in ipairs(TILES) do
  for _, guid in ipairs({ tile.guid, tile.twin }) do
    local tl = loadTile(guid)
    tl.env.onLoad("")
    local s = tl.t.scaleX
    local half = rect(0, 0, tile.size[1], tile.size[2])
    local list = {}
    for _, b in ipairs(tl.obj.buttons) do list[#list + 1] = { name = b.label ~= "" and b.label or b.click_function, b = b } end
    for _, b in ipairs(tl.obj.inputs) do list[#list + 1] = { name = "input " .. b.label, b = b } end
    check(#tl.obj.buttons > 0, guid .. " creates its widgets")
    for _, w in ipairs(list) do
      local b = w.b
      w.r = widgetRect(b, s)
      check(b.width >= 60 and b.height >= 60, guid .. " widget '" .. w.name .. "' has a real size: " .. b.width .. " x " .. b.height)
      check(opaque(b.color), guid .. " widget '" .. w.name .. "' has an opaque backing")
      check(b.position[2] >= 0.2 - 1e-9, guid .. " widget '" .. w.name .. "' sits above the face")
      check(b.function_owner ~= nil or b.input_function ~= nil, guid .. " widget '" .. w.name .. "' calls back into its own script")
      check(inside(w.r, half), guid .. " widget '" .. w.name .. "' on the tile: " .. fmt(w.r))
      local fn = b.click_function or b.input_function
      check(type(tl.env[fn]) == "function", guid .. " widget '" .. w.name .. "' handler " .. tostring(fn) .. " exists")
    end
    for a = 1, #list do
      for c = a + 1, #list do
        check(not overlap(list[a].r, list[c].r), guid .. " widgets apart: '" .. list[a].name .. "' " .. fmt(list[a].r) .. " / '" .. list[c].name .. "' " .. fmt(list[c].r))
      end
    end
    tl.widgets = list
  end
end

---------------------------------------------------------------- tray -> board --

for side, pair in pairs({ Red = { tray = "acae21", board = "e24b02" }, Blue = { tray = "839fcc", board = "e24b01" } }) do
  local tray, board = loaded[pair.tray], loaded[pair.board]
  check(tray.env.SIDE == side, pair.tray .. " rolls for " .. side)
  check(tray.env.BOARD_FOR[side] == pair.board, side .. "'s results go to " .. pair.board)
  check(board.env.FEED == side, pair.board .. " shows " .. side .. "'s rolls")
  check((T(pair.board).posZ > 0) ~= (side == "Red"), pair.board .. " stands in the other player's strip")
  chat = {}
  local r = tray.env.resolve({ 3, 6, 5 }, "success", 1, false)
  tray.env.publish(r)
  local labels = {}
  for _, b in ipairs(board.obj.buttons) do labels[#labels + 1] = b.label end
  local text = table.concat(labels, "|")
  check(text:find(string.upper(side) .. " · LAST ROLL   #1", 1, true) ~= nil, side .. " board header names the roll: " .. labels[1])
  check(text:find("|6|5|3|", 1, true) ~= nil, side .. " board chips show the tray's order, kept first")
  check(text:find("|11|", 1, true) ~= nil and text:find("SUCCESS", 1, true) ~= nil, side .. " board shows the kept total and verdict")
  check(board.obj.lines and #board.obj.lines == 3, side .. " board outlines the two kept chips and brackets them")
  check(#chat == 1 and chat[1] == side .. " · Success +1 DICE: [6][5] 3 → 11 Success", side .. " roll goes to chat once: " .. tostring(chat[1]))
  check(tray.env.state.current == r and r.no == 1, side .. " tray keeps the result as its current roll")
  local trayLabels = {}
  for _, b in ipairs(tray.obj.buttons) do trayLabels[#trayLabels + 1] = b.label end
  check(table.concat(trayLabels, "|"):find("|KEPT 11|dropped (1)|6|5|3|", 1, true) ~= nil, side .. " tray labels its dice in slot order")
  local other = loaded[side == "Red" and "e24b01" or "e24b02"]
  board.env.showRoll({ side = side == "Red" and "Blue" or "Red", result = r })
  check(board.obj.buttons[1].label:find(string.upper(side), 1, true) ~= nil, pair.board .. " ignores the other side's rolls")
  tray.env.onClear(nil, side)
  check(tray.env.state.current == nil and tray.env.state.history[#tray.env.state.history] == r, side .. " Clear keeps the roll for Last roll")
  check(board.obj.buttons[2].label == "no roll on the tray", side .. " board is cleared with the tray")
  check(other ~= nil, "both boards loaded")
end

---------------------------------------------------------------- furniture --

-- Footprints in world inches (x by z, before the object's quarter turn). "measured" comes
-- from mod/TESTING.md or the brief; the rest are read off screenshots of the live table.
local KEEP_CLEAR = 25.5
local FOOT = {
  tray = { 28.6, 11.15 }, board = { 10.6, 11.15 }, measure = { 9.0, 7.6 },
  importer = { 16, 12 },        -- measured, rotY 270
  panel = { 14.127, 8 },        -- the tracker's measured collider; the Battlefield tile is a copy
  theme = { 15.72, 6.98 },      -- the XML panel: 786 x 349 px at scale 2, 100 px per inch
  counter3 = { 3.6, 3.6 }, bag = { 1.6, 1.6 }, dicebag = { 2.2, 2.2 }, los = { 0.8, 0.8 },
  banner = { 2.5, 2.5 }, trash = { 4.4, 4.4 }, counter = { 3.9, 3.9 },
  stopwatch = { 8, 8 }, panelBlock = { 10, 10 },
}
local FURNITURE = {
  { "acae21", "tray", "839fcc" }, { "e24b01", "board", "e24b02" }, { "e24c01", "measure", "e24c02" },
  { "c0530b", "counter3", "520a95" }, { "0e8265", "counter3", "f14264" }, { "e58368", "counter3", "7a87e9" },
  { "3b0f1d", "bag", "061bfb" }, { "6cecd8", "bag", "c30c00" }, { "fef40e", "bag", "0659ae" },
  { "e75c71", "bag", "9eb271" }, { "d51618", "bag", "359c8c" }, { "70d18f", "bag", "2d4b7e" },
  { "4c054e", "dicebag", "2d9705" }, { "714214", "dicebag", "176bc4" },
  { "546598", "los", "1b3488" }, { "ca16c5", "los", "b1625c" }, { "0dd964", "banner", "0dd965" },
  { "be2cdb", "trash", "4b1a7b" }, { "42c161", "counter", "42c164" },
  { "b91983", "importer" }, { "4ac9e3", "panel" }, { "47de64", "panel" }, { "369707", "theme" },
  { "f4ee71", "stopwatch" }, { "ed17d0", "panelBlock" },
}
for _, gone in ipairs({ "25b3ac", "ea3160", "c09349", "48dcae", "19b9bf", "96a319", "17ca2b", "927ca1", "ae1f5b", "c1aaa4" }) do
  check(OBJ[gone] == nil, gone .. " (replaced by TC-024) is gone from the save")
end
local rects = {}
local function addRect(kind, guid, x0, z0, x1, z1)
  rects[#rects + 1] = { kind = kind, guid = guid, u0 = x0, u1 = x1, v0 = z0, v1 = z1 }
end
local function footprint(guid, kind)
  local t = T(guid)
  local w, d = FOOT[kind][1], FOOT[kind][2]
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
for _, f in ipairs({ { "acae21", "839fcc" }, { "e24b01", "e24b02" }, { "e24c01", "e24c02" } }) do
  check(math.abs((T(f[2]).rotY - T(f[1]).rotY) % 360 - 180) < 1e-6, f[1] .. " / " .. f[2] .. ": the Blue twin is turned to face Blue")
end
check(T("acae21").posX == 13.5 and T("acae21").posZ == 31.6, "Red tray keeps its place")
check(T("e24b01").posX == 33.7 and T("e24b01").posZ == 31.6, "Blue's board stands in Red's strip, in the old screen's slot")
check(T("e24c01").posX == -6.4 and T("e24c01").posZ == 31.6, "Red Measure & Mark on the freed TC-roller spot")
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

---------------------------------------------------------------- importer --

do
  local mat = T("4ee1f2")
  -- Measured live with posY -9.52: getBounds centre y -0.5, size (60, 2.9, 44).
  local bounds = { center = { x = mat.posX, y = mat.posY + 9.02, z = mat.posZ }, size = { x = 36 * mat.scaleX, y = 2.9, z = 36 * mat.scaleZ } }
  local env = setmetatable({
    self = { getPosition = function() local t = T("b91983"); return { x = t.posX, y = t.posY, z = t.posZ } end },
    JSON = { decode = function() return {} end, encode = function() return "{}" end },
    getObjectFromGUID = function(g) if g == "4ee1f2" then return { getBounds = function() return bounds end } end end,
    getAllObjects = function() return {} end,
  }, { __index = _G })
  assert(load(read(root .. "/mod/scripts/b91983.lua"), "@b91983", "t", env))()
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
  for guid, tl in pairs(loaded) do
    local t = tl.t
    local a = math.rad(t.rotY)
    for _, w in ipairs(tl.widgets or {}) do
      local function world(u, v) return t.posX - u * math.cos(a) + v * math.sin(a), t.posZ + u * math.sin(a) + v * math.cos(a) end
      local x0, z0 = world(w.r.u0, w.r.v0)
      local x1, z1 = world(w.r.u1, w.r.v1)
      out:write(string.format("RECT widget %s:%s %.4f %.4f %.4f %.4f\n", guid, (tostring(w.name):gsub("%s", "_")), math.min(x0, x1), math.min(z0, z1), math.max(x0, x1), math.max(z0, z1)))
    end
  end
  out:close()
end

print(string.format("layout_test: %d checks, %d failed", checks, failures))
os.exit(failures == 0 and 0 or 1)
