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
  near(specs[1].Transform.posX, 13.75, "first Red cell x")
  near(specs[1].Transform.posZ, 44, "first Red cell z")
  near(specs[6].Transform.posX, 26.25, "sixth Red cell x")
  near(specs[6].Transform.posZ, 44, "sixth Red cell stays on row one")

  local p7 = gridPosition(7, anchor, GRID)
  near(p7.x, 13.75, "seventh cell wraps to the row start")
  near(p7.z, 46.5, "seventh cell is one row further from the mat")

  local big = copy(payload)
  for i = 7, 14 do
    local m = copy(payload.members[2])
    m.id = "m" .. i
    big.members[i] = m
  end
  local blue = buildSpawnSpecs(big, anchorFor("Blue", { x = 0, y = 0, z = 0 }), colourFor("Blue"))
  eq(#blue, 14, "fourteen Blue specs")
  check(minDistance(blue) >= 2.0, "three Blue rows do not overlap")
  check(blue[14].Transform.posZ < blue[1].Transform.posZ, "Blue rows grow toward -z")
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
  near(kept[1].Transform.posX, 13.75, "kept members do not leave gaps in the grid")

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

print(string.format("importer_test: %d checks, %d failed", checks, failures))
if failures > 0 then os.exit(1) end
