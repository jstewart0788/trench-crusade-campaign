-- Offline test for the Warband Importer's pure half (mod/scripts/b91983.lua).
--
--     lua mod/test/importer_test.lua        (from the repo root; pnpm mod:test)
--
-- Loads the importer script under plain Lua with JSON stubbed, decodes the
-- committed fixture with the small decoder below, and checks the spawn specs
-- the script would hand to spawnObjectData. Nothing here touches TTS.

local here = (arg and arg[0] or ""):match("^(.*)[/\\]") or "."
local root = here .. "/../.."
local SCRIPT = root .. "/mod/scripts/b91983.lua"
local FIXTURE = root .. "/mod/fixtures/warband-new-antioch.json"

---------------------------------------------------------------- tiny JSON --

local function utf8Char(cp)
  if cp < 0x80 then return string.char(cp) end
  if cp < 0x800 then return string.char(0xC0 + math.floor(cp / 0x40), 0x80 + cp % 0x40) end
  if cp < 0x10000 then
    return string.char(0xE0 + math.floor(cp / 0x1000), 0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
  end
  return string.char(0xF0 + math.floor(cp / 0x40000), 0x80 + math.floor(cp / 0x1000) % 0x40,
    0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
end

local ESCAPES = { ['"'] = '"', ["\\"] = "\\", ["/"] = "/", b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }

local function decodeJson(text)
  local pos = 1
  local parseValue

  local function fail(msg)
    error(string.format("json: %s at offset %d", msg, pos), 0)
  end

  local function skipSpace()
    pos = text:find("[^ \t\r\n]", pos) or (#text + 1)
  end

  local function parseString()
    pos = pos + 1
    local out = {}
    while true do
      local run = text:match('^[^"\\]+', pos)
      if run then
        out[#out + 1] = run
        pos = pos + #run
      end
      local c = text:sub(pos, pos)
      if c == "" then fail("unterminated string") end
      if c == '"' then
        pos = pos + 1
        break
      end
      local e = text:sub(pos + 1, pos + 1)
      if e == "u" then
        local cp = tonumber(text:sub(pos + 2, pos + 5), 16)
        if not cp then fail("bad \\u escape") end
        out[#out + 1] = utf8Char(cp)
        pos = pos + 6
      elseif ESCAPES[e] then
        out[#out + 1] = ESCAPES[e]
        pos = pos + 2
      else
        fail("bad escape \\" .. e)
      end
    end
    return table.concat(out)
  end

  local function parseNumber()
    local num = text:match("^-?%d+%.?%d*[eE]?[-+]?%d*", pos)
    if not num then fail("bad number") end
    pos = pos + #num
    return tonumber(num)
  end

  local function parseArray()
    pos = pos + 1
    local out = {}
    skipSpace()
    if text:sub(pos, pos) == "]" then
      pos = pos + 1
      return out
    end
    while true do
      out[#out + 1] = parseValue()
      skipSpace()
      local c = text:sub(pos, pos)
      pos = pos + 1
      if c == "]" then return out end
      if c ~= "," then fail("expected , or ] in array") end
    end
  end

  local function parseObject()
    pos = pos + 1
    local out = {}
    skipSpace()
    if text:sub(pos, pos) == "}" then
      pos = pos + 1
      return out
    end
    while true do
      skipSpace()
      if text:sub(pos, pos) ~= '"' then fail("expected object key") end
      local key = parseString()
      skipSpace()
      if text:sub(pos, pos) ~= ":" then fail("expected :") end
      pos = pos + 1
      out[key] = parseValue()
      skipSpace()
      local c = text:sub(pos, pos)
      pos = pos + 1
      if c == "}" then return out end
      if c ~= "," then fail("expected , or } in object") end
    end
  end

  parseValue = function()
    skipSpace()
    local c = text:sub(pos, pos)
    if c == "{" then return parseObject() end
    if c == "[" then return parseArray() end
    if c == '"' then return parseString() end
    if text:sub(pos, pos + 3) == "true" then pos = pos + 4; return true end
    if text:sub(pos, pos + 4) == "false" then pos = pos + 5; return false end
    if text:sub(pos, pos + 3) == "null" then pos = pos + 4; return nil end
    return parseNumber()
  end

  local value = parseValue()
  skipSpace()
  if pos <= #text then fail("trailing garbage") end
  return value
end

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

local function near(actual, expected, what)
  check(type(actual) == "number" and math.abs(actual - expected) < 1e-6,
    string.format("%s: expected %s, got %s", what, tostring(expected), tostring(actual)))
end

local function readFile(path)
  local fh = assert(io.open(path, "rb"), "cannot open " .. path)
  local text = fh:read("*a")
  fh:close()
  return text
end

local function copy(value)
  if type(value) ~= "table" then return value end
  local out = {}
  for k, v in pairs(value) do out[k] = copy(v) end
  return out
end

-- The script is loaded with JSON stubbed; nothing at its top level touches
-- any other TTS global.
JSON = { decode = decodeJson, encode = function() return "{}" end }
dofile(SCRIPT)

local payload = decodeJson(readFile(FIXTURE))
local LIEUTENANT_BASE = "https://steamusercontent-a.akamaihd.net/ugc/10789802620685510/A59749C4A41CBE16BBAE3BD69B441EBEC20180CA/"

---------------------------------------------------------------- payload --

do
  local ok, why = validatePayload(payload)
  check(ok, "fixture validates: " .. tostring(why))
  eq(payload.code, "NA-TEST-01", "fixture code")
  eq(#payload.members, 6, "fixture member count")

  local bad = copy(payload)
  bad.version = "tc-warband-export-v0"
  local okBad, whyBad = validatePayload(bad)
  check(not okBad and whyBad:find("unsupported export version", 1, true), "wrong version is rejected")
  check(not validatePayload(nil), "nil payload is rejected")
  local noMembers = copy(payload)
  noMembers.members = nil
  check(not validatePayload(noMembers), "payload without members is rejected")
end

---------------------------------------------------------------- url --

do
  eq(warbandUrl("http://127.0.0.1:3001", "NA-TEST-01"), "http://127.0.0.1:3001/api/tts/warband/NA-TEST-01", "url")
  eq(warbandUrl("http://127.0.0.1:3001/", " NA-TEST-01 "), "http://127.0.0.1:3001/api/tts/warband/NA-TEST-01", "url trims and strips the slash")
  eq(warbandUrl("", "a b"), "http://127.0.0.1:3001/api/tts/warband/a%20b", "url falls back to the default base and encodes")
end

---------------------------------------------------------------- specs --

local anchor = anchorFor("Red", { x = 0, y = 0, z = 0 })
local specs = buildSpawnSpecs(payload, anchor, colourFor("Red"))

do
  eq(#specs, 6, "one spawn spec per member")
  local lt = specs[1]
  eq(lt.Name, "Custom_Model", "lieutenant spec kind")
  eq(lt.Nickname, "Lieutenant", "lieutenant Nickname")
  eq(lt.Description, payload.members[1].ttsDescription, "lieutenant Description is the prebuilt text")
  check(lt.Description:find("[d9b352][b]Lieutenant[/b][-]", 1, true) == 1, "lieutenant Description starts with the header")
  check(lt.Description:find('[b]Mov[/b] 6"/Infantry', 1, true), "lieutenant Description carries the stat line")
  eq(lt.GMNotes, payload.members[1].ttsGmNotes, "lieutenant GMNotes is the prebuilt text")
  eq(lt.CustomMesh.MeshURL, LIEUTENANT_BASE, "lieutenant base mesh URL")
  eq(lt.CustomMesh.ColliderURL, LIEUTENANT_BASE, "lieutenant base collider URL")
  eq(lt.CustomMesh.TypeIndex, 1, "base is a figurine")
  eq(#lt.ChildObjects, 1, "lieutenant has one child part")
  local part = lt.ChildObjects[1]
  eq(part.Name, "Custom_Model", "child part kind")
  eq(part.CustomMesh.MeshURL, payload.members[1].model.parts[1].meshUrl, "child part mesh URL")
  eq(part.CustomMesh.DiffuseURL, payload.members[1].model.parts[1].diffuseUrl, "child part diffuse URL")
  check(part.CustomMesh.MeshURL ~= lt.CustomMesh.MeshURL, "the figure is not the base mesh")
  near(part.Transform.posY, 0.1274, "child part sits on the base")
  near(part.Transform.scaleY, 1.05, "child part scale")
  eq(part.CustomMesh.TypeIndex, 0, "child part type")

  eq(lt.Tags[1], "tc-warband:NA-TEST-01", "warband tag")
  eq(lt.Tags[2], "tc-member:m1", "member tag")
  eq(lt.Tags[3], "tc-spawned", "origin tag")
  eq(#lt.Tags, 3, "tag count")

  eq(lt.Transform.rotY, 180, "Red models face -z")
  near(lt.Transform.scaleX, 1, "base scale")
  eq(lt.MeasureMovement, true, "base measures movement")
  eq(lt.Locked, false, "spawned models are not locked")

  for i, spec in ipairs(specs) do
    eq(spec.Nickname, payload.members[i].displayName, "spec " .. i .. " nickname")
    eq(spec.Tags[2], "tc-member:" .. payload.members[i].id, "spec " .. i .. " member tag")
  end
end

---------------------------------------------------------------- grid --

local function minDistance(list)
  local best = math.huge
  for i = 1, #list do
    for j = i + 1, #list do
      local a, b = list[i].Transform, list[j].Transform
      local d = math.sqrt((a.posX - b.posX) ^ 2 + (a.posZ - b.posZ) ^ 2)
      if d < best then best = d end
    end
  end
  return best
end

do
  check(minDistance(specs) >= 2.0, "grid positions do not overlap (32mm bases need 1.26\")")
  near(specs[1].Transform.posX, -6.25, "first Red cell x is centred on the mat")
  near(specs[1].Transform.posZ, 19, "first Red cell z sits 3 inside the mat's +z edge")
  near(specs[1].Transform.posY, 1.95, "models spawn one unit above the mat top")
  near(specs[6].Transform.posX, 6.25, "sixth Red cell x")
  near(specs[6].Transform.posZ, 19, "sixth Red cell stays on row one")

  local p7 = gridPosition(7, anchor, GRID)
  near(p7.x, -6.25, "seventh cell wraps to the row start")
  near(p7.z, 16.5, "seventh cell is one row toward the mat centre")

  local moved = anchorsFromMat({ center = { x = 20, y = -0.5, z = 0 }, size = { x = 60, y = 2.9, z = 44 } })
  near(moved.Red.x, 13.75, "a mat centred on x=20 moves the Red row with it")
  near(moved.Blue.x, 26.25, "and the Blue row mirrored")
  near(moved.Blue.z, -19, "Blue row sits 3 inside the -z edge")
  check(looksLikeMat({ x = 60, y = 2.9, z = 44 }), "the live mat looks like a mat")
  check(not looksLikeMat({ x = 136, y = 0.2, z = 199 }), "the table tile does not")
  check(not looksLikeMat({ x = 16, y = 0.2, z = 12 }), "the importer tile does not")

  local big = copy(payload)
  for i = 7, 14 do
    local m = copy(payload.members[2])
    m.id = "m" .. i
    big.members[i] = m
  end
  local blue = buildSpawnSpecs(big, anchorFor("Blue", { x = 0, y = 0, z = 0 }), colourFor("Blue"))
  eq(#blue, 14, "fourteen Blue specs")
  check(minDistance(blue) >= 2.0, "three Blue rows do not overlap")
  check(blue[14].Transform.posZ > blue[1].Transform.posZ, "Blue rows grow toward the mat centre (+z)")
  near(blue[1].Transform.posZ, -19, "first Blue cell z")
  check(blue[14].Transform.posZ < 0, "three Blue rows stay on Blue's half")
  eq(blue[1].Transform.rotY, 0, "Blue models face +z")

  local fallback = anchorFor("Green", { x = -22, y = 1, z = 0 })
  local green = buildSpawnSpecs(payload, fallback, colourFor("Green"))
  check(minDistance(green) >= 2.0, "fallback grid does not overlap")
  near(green[1].Transform.posZ, 8, "fallback grid sits in front of the importer")
  near((green[1].Transform.posX + green[6].Transform.posX) / 2, -22, "fallback grid is centred on the importer")
end

---------------------------------------------------------------- tint --

do
  local red = tint(BASE_COLOUR, colourFor("Red"))
  check(red.r > BASE_COLOUR.r and red.r < 0.856, "red tint moves r toward the player colour")
  check(red.g < red.r and red.b < red.r, "red tint is red")
  local full = tint(BASE_COLOUR, colourFor("Blue"), 1)
  near(full.b, 1, "amount 1 is the player colour")
  local none = tint(BASE_COLOUR, colourFor("Blue"), 0)
  near(none.b, BASE_COLOUR.b, "amount 0 is the base colour")
  near(specs[1].ColorDiffuse.r, red.r, "spec carries the tinted base colour")
  eq(colourFor("NotAColour"), PLAYER_COLOURS.Grey, "unknown colour falls back to grey")
end

---------------------------------------------------------------- no model --

do
  local plain = copy(payload)
  plain.members[2].model = nil
  local out = buildSpawnSpecs(plain, anchor, colourFor("Red"))
  eq(#out, 6, "member without a model still spawns")
  eq(out[2].CustomMesh.MeshURL, PLAIN_BASE.meshUrl, "member without a model gets the plain base")
  eq(out[2].ChildObjects, nil, "plain base has no child objects")
  eq(out[2].Nickname, "Yeoman", "plain base keeps the binding")
  eq(out[2].Description, plain.members[2].ttsDescription, "plain base keeps the description")
  eq(memberRowLabel(2, plain.members[2]), "2. Yeoman  [plain base]", "row label for a plain base")
  eq(memberRowLabel(1, payload.members[1]), "1. Lieutenant  [default model]", "row label for a default model")
end

---------------------------------------------------------------- keep / tags --

do
  local kept = buildSpawnSpecs(payload, anchor, colourFor("Red"), { m1 = true, m3 = true })
  eq(#kept, 4, "bound members are not respawned")
  eq(kept[1].Nickname, "Yeoman", "first spawned after keeping m1 is m2")
  near(kept[1].Transform.posX, -6.25, "kept members do not leave gaps in the grid")

  local merged = mergeTags({ "obj_1", "tc-warband:OLD", "tc-member:m9", "tc-spawned" }, memberTags("NA-TEST-01", "m1", "tc-bound"))
  eq(#merged, 4, "merge keeps foreign tags and replaces importer tags")
  eq(merged[1], "obj_1", "foreign tag kept")
  eq(merged[2], "tc-warband:NA-TEST-01", "new warband tag")
  eq(merged[3], "tc-member:m1", "new member tag")
  eq(merged[4], "tc-bound", "bound origin")
  eq(memberIdFromTags(merged), "m1", "member id from tags")
  eq(memberIdFromTags({ "obj_1" }), nil, "no member id without a member tag")
end

---------------------------------------------------------------- asset bundle part --

do
  local part = buildPartState({
    kind = "Custom_Assetbundle",
    assetBundleUrl = "https://example.invalid/bundle",
    position = { 0, 0.061, 0 },
    rotation = { 0, 270, 0 },
    scale = { 0.675, 0.675, 0.675 },
  })
  eq(part.Name, "Custom_Assetbundle", "asset bundle part kind")
  eq(part.CustomAssetbundle.AssetbundleURL, "https://example.invalid/bundle", "asset bundle URL")
  eq(part.CustomMesh, nil, "asset bundle part has no mesh block")
  near(part.Transform.rotY, 270, "asset bundle part rotation")
end

---------------------------------------------------------------- widgets --

-- The tile's Transform scale as committed, so the world sizes below are the
-- ones the save will produce. The face proportions (REF) come from the live
-- measurement recorded in the script header; the Custom_Tile base size cannot
-- be read offline, which is why the runtime path measures it again.
local function tileScale(guid)
  local text = readFile(root .. "/mod/save.json")
  local at = text:find('"GUID": "' .. guid .. '"', 1, true)
  check(at ~= nil, guid .. " is in mod/save.json")
  local sx = tonumber(text:match('"scaleX": ([%d%.]+)', at))
  local sy = tonumber(text:match('"scaleY": ([%d%.]+)', at))
  local sz = tonumber(text:match('"scaleZ": ([%d%.]+)', at))
  return { x = sx, y = sy, z = sz }
end

local function overlaps(a, b)
  return a.left < b.right and b.left < a.right and a.top < b.bottom and b.top < a.bottom
end

local function byId(specs)
  local out = {}
  for _, spec in ipairs(specs) do out[spec.id] = spec end
  return out
end

local scale = tileScale("b91983")
local measured = {
  visual = { size = { x = 16, y = 0.2, z = 12 }, center = { x = -22, y = 1.1, z = 0 } },
  collider = { size = { x = 16, y = 0.3, z = 12 }, center = { x = -22, y = 1.15, z = 0 } },
  position = { x = -22, y = 1, z = 0 },
}
local geom = geomFromBounds(measured.visual, measured.collider, scale, measured.position)

do
  near(geom.hx, 16 / scale.x / 2, "half width from the visual bounds")
  near(geom.hz, 12 / scale.z / 2, "half depth from the visual bounds")
  near(geom.top, 0.3 / scale.y, "top face is the thicker collider's top")
  near(geom.y, 0.3 / scale.y + WIDGET_LIFT, "widgets float above the collider")
  check(geom.y > 0.2, "widgets clear the mesh that buried them at y 0.12")
  local fallback = geomFromBounds()
  near(fallback.hx, REF.hx, "fallback half width")
  near(fallback.y, REF.top + WIDGET_LIFT, "fallback y")
  local empty = geomFromBounds({ size = { x = 0, y = 0, z = 0 } }, nil, scale, measured.position)
  near(empty.hx, REF.hx, "zero bounds fall back to the reference face")
  local wide = geomFromBounds({ size = { x = 24, y = 0.2, z = 12 }, center = { x = 0, y = 0.1, z = 0 } }, nil, scale, { x = 0, y = 0, z = 0 })
  near(wide.sx, (24 / scale.x / 2) / REF.hx, "a wider face stretches the layout")
end

do
  local labels = {}
  for i, member in ipairs(payload.members) do labels[i] = { title = memberRowTitle(i, member), detail = memberRowLabel(i, member) } end
  local view = { colourLabel = "Colour: mine", pending = false, status = "ready", members = labels, selected = 2 }
  local specs = widgetLayout(view, geom)
  local ids = byId(specs)
  check(ids.title and ids.colour and ids.bind and ids.import and ids.status, "idle layout has title, colour, bind, import, status")
  eq(ids.replace, nil, "idle layout has no Replace")
  eq(ids.cancel, nil, "idle layout has no Cancel")
  eq(#specs, 5 + #payload.members, "one row button per member")
  eq(ids.row1.label, "1. Lieutenant", "row label is the short title")
  check(ids.row1.tooltip:find("1. Lieutenant  [default model]", 1, true) == 1, "row tooltip carries the full label")
  eq(memberRowTitle(2, payload.members[2]), "2. Yeoman", "short title")
  eq(ids.row2.color, GOLD, "selected row is gold")
  eq(ids.row1.color, ROW, "unselected row is grey")
  eq(ids.row1.click_function, "selectMember1", "row click function carries the index")
  eq(ids.import.click_function, "onImport", "import click function")
  eq(ids.title.width, 0, "title is a label-only button")
  eq(ids.title.click_function, "noop", "title does nothing when clicked")
  eq(ids.import.width, 760, "Import width is the layout's at the measured face (sx 1)")
  check(ids.import.position[1] > 0 and ids.row1.position[1] < 0, "controls on the viewer's left (local +x), members on the right")
  eq(ids.import.position[2], geom.y, "Import sits at the measured height")

  local nonLabel = {}
  for _, spec in ipairs(specs) do
    check(spec.position[2] >= geom.y, spec.id .. " sits above the face")
    eq(spec.rotation[2], 0, spec.id .. " keeps the tile's orientation")
    check(spec.font_color and spec.color, spec.id .. " has explicit colours")
    local e = widgetExtent(spec)
    check(e.left >= -geom.hx and e.right <= geom.hx and e.top >= -geom.hz and e.bottom <= geom.hz, spec.id .. " stays on the tile")
    if spec.width > 0 then nonLabel[#nonLabel + 1] = { id = spec.id, extent = e } end
    if spec.id ~= "status" and not spec.id:match("^row") then
      local letters = spec.font_size / UNITS_PER_LOCAL * scale.z
      check(letters >= 0.6 and letters <= 1.3, string.format("%s letters are %.2f units tall", spec.id, letters))
    end
  end
  for i = 1, #nonLabel do
    for j = i + 1, #nonLabel do
      check(not overlaps(nonLabel[i].extent, nonLabel[j].extent), nonLabel[i].id .. " does not overlap " .. nonLabel[j].id)
    end
  end
  local inputs = inputLayout("http://127.0.0.1:3001", "NA-TEST-01", geom)
  for _, spec in ipairs(inputs) do
    local e = widgetExtent(spec)
    check(e.left >= -geom.hx and e.right <= geom.hx and e.top >= -geom.hz and e.bottom <= geom.hz, spec.id .. " input stays on the tile")
    for _, other in ipairs(nonLabel) do
      check(not overlaps(e, other.extent), spec.id .. " input does not overlap " .. other.id)
    end
    check(spec.height >= spec.font_size + 23, spec.id .. " input is tall enough for its font")
    check(spec.font_color and spec.color, spec.id .. " input has explicit colours")
    eq(spec.position[2], geom.y, spec.id .. " input sits at the measured height")
    local letters = spec.font_size / UNITS_PER_LOCAL * scale.z
    check(letters >= 0.6 and letters <= 1.3, string.format("%s letters are %.2f units tall", spec.id, letters))
  end
  eq(inputs[1].value, "http://127.0.0.1:3001", "base URL input carries the state")
  eq(inputs[2].value, "NA-TEST-01", "code input carries the state")
  eq(inputs[1].input_function, "onBaseUrlInput", "base URL callback")
  eq(inputs[2].input_function, "onCodeInput", "code callback")
  eq(inputs[1].width, 760, "base URL input width at the measured face")
  eq(inputs[2].font_size, 85, "code input font at the measured face")
  check(21 * 0.6 * inputs[1].font_size <= inputs[1].width, "the default URL fits the base URL input")

  local pending = widgetLayout({ colourLabel = "Colour: Red", pending = true, status = "confirm?", members = {}, selected = nil }, geom)
  local pids = byId(pending)
  eq(pids.import, nil, "confirm layout hides Import")
  check(pids.replace and pids.cancel, "confirm layout shows Replace and Cancel")
  if pids.replace and pids.cancel then
    check(not overlaps(widgetExtent(pids.replace), widgetExtent(pids.cancel)), "Replace and Cancel sit side by side")
    check(pids.replace.position[1] > pids.cancel.position[1], "Replace is to the viewer's left (local +x) of Cancel")
  end
  eq(pids.status.label, "confirm?", "status label")

  local many = {}
  for i = 1, MAX_ROWS + 5 do many[i] = { title = "m" .. i, detail = "m" .. i } end
  local big = byId(widgetLayout({ colourLabel = "", pending = false, status = "", members = many }, geom))
  check(big["row" .. MAX_ROWS] ~= nil, "layout shows MAX_ROWS rows")
  eq(big["row" .. (MAX_ROWS + 1)], nil, "layout stops at MAX_ROWS")
  check(widgetExtent(big["row" .. MAX_ROWS]).bottom <= geom.hz, "last row stays on the tile")
  for i = 2, MAX_ROWS do
    check(big["row" .. i].position[3] - big["row" .. (i - 1)].position[3] >= 0.12, "row " .. i .. " centre is at least 0.12 below the previous")
  end

  local narrow = geomFromBounds({ size = { x = 12, y = 0.2, z = 12 }, center = { x = 0, y = 0.1, z = 0 } }, nil, scale, { x = 0, y = 0, z = 0 })
  for _, spec in ipairs(widgetLayout(view, narrow)) do
    local e = widgetExtent(spec)
    check(e.left >= -narrow.hx and e.right <= narrow.hx, spec.id .. " stays on a square face")
  end
  for _, spec in ipairs(inputLayout("", "", narrow)) do
    local e = widgetExtent(spec)
    check(e.left >= -narrow.hx and e.right <= narrow.hx, spec.id .. " input stays on a square face")
  end

  local line = describeGeometry("Warband Importer", geom, scale, measured.visual, specs)
  check(line:find("half 1.333x1.000", 1, true) ~= nil, "geometry line reports the half extents")
  check(line:find("first title(", 1, true) ~= nil and line:find("last row6(", 1, true) ~= nil, "geometry line names the first and last widget")
  check(line:find("\n") == nil, "geometry line is one line")
end

do
  local pos = screenToLocal(0.3, -0.5, geom)
  near(pos[1], -0.3, "viewer's right is local -x")
  near(pos[3], -0.5, "viewer's up is local -z")
  near(pos[2], geom.y, "widgets float just above the face")

  local mine, colour = nextColourChoice(true, "Red")
  eq(mine, false, "cycling from 'mine' picks a seat")
  eq(colour, "Red", "the first seat is Red")
  mine, colour = nextColourChoice(false, "Red")
  eq(colour, "Blue", "Red cycles to Blue")
  mine, colour = nextColourChoice(false, COLOUR_ORDER[#COLOUR_ORDER])
  eq(mine, true, "the last seat cycles back to 'mine'")
  eq(colourButtonLabel(true, "Blue"), "Colour: mine", "label while following the player")
  eq(colourButtonLabel(false, "Blue"), "Colour: Blue", "label for a fixed seat")

  eq(wrapText("short", 10), "short", "short text is not wrapped")
  eq(wrapText("one two three four", 9), "one two\nthree\nfour", "words wrap at the limit")
  eq(wrapText("http://127.0.0.1:3001/api/tts/warband/NA-TEST-01", 20), "http://127.0.0.1:300\n1/api/tts/warband/NA\n-TEST-01", "long words break hard")
  eq(wrapText("Fetching http://127.0.0.1:3001/api/tts/warband/NA-TEST-01", LAYOUT.status.wrap):find("\n") ~= nil, true, "the fetch status wraps")
  eq(wrapText(nil, 10), "", "nil wraps to empty")
end

print(string.format("importer_test: %d checks, %d failed", checks, failures))
if failures > 0 then os.exit(1) end
