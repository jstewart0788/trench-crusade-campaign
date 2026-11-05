-- Warband Importer (TC-016). Fetches a warband export from the platform API and
-- spawns one bound model per member; a Bind mode copies a member's binding onto
-- any model the player picks up instead.
--
-- Everything above the "TTS glue" line touches no TTS global so
-- mod/test/importer_test.lua can exercise it under plain Lua. TTS runs
-- MoonSharp (Lua 5.2): no `//`, no goto, no integer/float distinctions.

EXPORT_VERSION = "tc-warband-export-v1"
DEFAULT_BASE_URL = "https://tc.rynfin.org"
API_PATH = "/api/tts/warband/"

TAG_WARBAND = "tc-warband:"
TAG_MEMBER = "tc-member:"
TAG_SPAWNED = "tc-spawned"
TAG_BOUND = "tc-bound"

MAX_ROWS = 14

-- Gannel's 32mm base: the top-level mesh of every Gannel's model (the
-- Lieutenant 15e05f in 3700111403 among them). Members without a default model
-- spawn on this alone so the player can drop their own figure on it.
PLAIN_BASE = {
  meshUrl = "https://steamusercontent-a.akamaihd.net/ugc/10789802620685510/A59749C4A41CBE16BBAE3BD69B441EBEC20180CA/",
  diffuseUrl = nil,
  colliderUrl = "https://steamusercontent-a.akamaihd.net/ugc/10789802620685510/A59749C4A41CBE16BBAE3BD69B441EBEC20180CA/",
  scale = {1, 1, 1},
}
BASE_COLOUR = { r = 0.0871, g = 0.0871, b = 0.0871 }
TINT_AMOUNT = 0.6

PLAYER_COLOURS = {
  Red = {0.856, 0.1, 0.094},
  Blue = {0.118, 0.53, 1},
  Teal = {0.129, 0.694, 0.607},
  Purple = {0.627, 0.125, 0.941},
  Orange = {0.956, 0.392, 0.113},
  Yellow = {0.905, 0.898, 0.172},
  Green = {0.192, 0.701, 0.168},
  White = {1, 1, 1},
  Pink = {0.96, 0.439, 0.807},
  Brown = {0.443, 0.231, 0.09},
  Black = {0.25, 0.25, 0.25},
  Grey = {0.5, 0.5, 0.5},
}
COLOUR_ORDER = {"Red", "Blue", "Teal", "Purple", "Orange", "Yellow", "Green", "White", "Pink", "Brown"}

-- Where an imported warband lands: on the game mat, which the glue measures at
-- import time (object 4ee1f2 "matObjSurface", a Custom_Model; getBounds on the
-- live table on 2026-11-04 gave centre (0, -0.5, 0) and size (60, 2.9, 44), so
-- the playing surface is x -30..30, z -22..22 with its top at y 0.95 - the big
-- 136x199 tile 28865a under it is the table, not the mat). Red's first row sits
-- MAT_EDGE_INSET inside the +z edge and grows toward the centre, Blue mirrored
-- from -z; both are centred on the mat's x. The earlier fixed anchors at
-- z = +/-44 dropped models 22" off the mat where nobody saw them. Any other
-- colour gets a grid in front of the importer tile itself.
GRID = { perRow = 6, dx = 2.5, dz = 2.5, y = 1.5 }
MAT_GUID = "4ee1f2"
MAT_EDGE_INSET = 3
MAT_LIFT = 1
DEFAULT_MAT = { center = { x = 0, y = -0.5, z = 0 }, size = { x = 60, y = 2.9, z = 44 } }

function trim(s)
  s = tostring(s or "")
  s = s:gsub("^%s+", "")
  s = s:gsub("%s+$", "")
  return s
end

function urlEncode(s)
  return (s:gsub("[^%w%-%._~]", function(c)
    return string.format("%%%02X", string.byte(c))
  end))
end

function warbandUrl(baseUrl, code)
  local base = trim(baseUrl)
  if base == "" then base = DEFAULT_BASE_URL end
  base = base:gsub("/+$", "")
  return base .. API_PATH .. urlEncode(trim(code))
end

function validatePayload(payload)
  if type(payload) ~= "table" then return false, "response is not a JSON object" end
  if payload.version ~= EXPORT_VERSION then
    return false, "unsupported export version " .. tostring(payload.version) .. " (want " .. EXPORT_VERSION .. ")"
  end
  if type(payload.code) ~= "string" or payload.code == "" then return false, "payload has no code" end
  if type(payload.warband) ~= "table" then return false, "payload has no warband" end
  if type(payload.members) ~= "table" then return false, "payload has no members" end
  for i, member in ipairs(payload.members) do
    if type(member.id) ~= "string" or member.id == "" then return false, "member " .. i .. " has no id" end
  end
  return true
end

function colourFor(name)
  return PLAYER_COLOURS[name] or PLAYER_COLOURS.Grey
end

function tint(base, rgb, amount)
  amount = amount or TINT_AMOUNT
  return {
    r = base.r + (rgb[1] - base.r) * amount,
    g = base.g + (rgb[2] - base.g) * amount,
    b = base.b + (rgb[3] - base.b) * amount,
  }
end

function matFrame(bounds)
  bounds = bounds or DEFAULT_MAT
  return {
    centreX = bounds.center.x,
    minZ = bounds.center.z - bounds.size.z / 2,
    maxZ = bounds.center.z + bounds.size.z / 2,
    top = bounds.center.y + bounds.size.y / 2,
  }
end

-- A flat object about the mat's size, for tables where 4ee1f2 is gone.
function looksLikeMat(size)
  return size.x >= 50 and size.x <= 70 and size.z >= 34 and size.z <= 54 and size.y <= 5
end

function anchorsFromMat(bounds)
  local frame = matFrame(bounds)
  local halfRow = (GRID.perRow - 1) * GRID.dx / 2
  return {
    Red = { x = frame.centreX - halfRow, y = frame.top + MAT_LIFT, z = frame.maxZ - MAT_EDGE_INSET, dirX = 1, dirZ = -1, rotY = 180 },
    Blue = { x = frame.centreX + halfRow, y = frame.top + MAT_LIFT, z = frame.minZ + MAT_EDGE_INSET, dirX = -1, dirZ = 1, rotY = 0 },
  }
end

function anchorFor(colour, origin, matBounds)
  local anchors = anchorsFromMat(matBounds)
  if anchors[colour] then return anchors[colour] end
  return {
    x = origin.x - (GRID.perRow - 1) * GRID.dx / 2,
    z = origin.z + 8,
    dirX = 1,
    dirZ = 1,
    rotY = 180,
  }
end

function gridPosition(index, anchor, grid)
  local i = index - 1
  local col = i % grid.perRow
  local row = (i - col) / grid.perRow
  return {
    x = anchor.x + anchor.dirX * col * grid.dx,
    y = anchor.y or grid.y,
    z = anchor.z + anchor.dirZ * row * grid.dz,
  }
end

function memberTags(code, memberId, origin)
  return { TAG_WARBAND .. code, TAG_MEMBER .. memberId, origin }
end

function isImporterTag(tag)
  return tag == TAG_SPAWNED or tag == TAG_BOUND
    or tag:sub(1, #TAG_WARBAND) == TAG_WARBAND
    or tag:sub(1, #TAG_MEMBER) == TAG_MEMBER
end

function mergeTags(existing, fresh)
  local out = {}
  for _, tag in ipairs(existing or {}) do
    if not isImporterTag(tag) then out[#out + 1] = tag end
  end
  for _, tag in ipairs(fresh) do out[#out + 1] = tag end
  return out
end

function memberIdFromTags(tags)
  for _, tag in ipairs(tags or {}) do
    if tag:sub(1, #TAG_MEMBER) == TAG_MEMBER then return tag:sub(#TAG_MEMBER + 1) end
  end
  return nil
end

function vec(a)
  if a == nil then return { x = 0, y = 0, z = 0 } end
  return { x = a[1] or a.x or 0, y = a[2] or a.y or 0, z = a[3] or a.z or 0 }
end

function transform(pos, rot, scale)
  return {
    posX = pos.x, posY = pos.y, posZ = pos.z,
    rotX = rot.x, rotY = rot.y, rotZ = rot.z,
    scaleX = scale.x, scaleY = scale.y, scaleZ = scale.z,
  }
end

local function objectFields(nickname, description, gmNotes, colour)
  return {
    Nickname = nickname,
    Description = description,
    GMNotes = gmNotes,
    ColorDiffuse = colour,
    Locked = false,
    Grid = true,
    Snap = true,
    IgnoreFoW = false,
    DragSelectable = true,
    Autoraise = true,
    Sticky = true,
    Tooltip = true,
    GridProjection = false,
    HideWhenFaceDown = false,
    Hands = false,
  }
end

-- A figure part exactly as Gannel's models carry them (3700111403, Lieutenant
-- 15e05f -> child 2ac641): a Custom_Model with its own mesh and diffuse on a
-- shared collider. The Scripted Table's figures are Custom_Assetbundle children.
function buildPartState(part)
  local state = objectFields("", "", "", { r = 1, g = 1, b = 1 })
  state.Name = part.kind
  state.Transform = transform(vec(part.position), vec(part.rotation), vec(part.scale or {1, 1, 1}))
  state.MeasureMovement = false
  if part.kind == "Custom_Assetbundle" then
    state.CustomAssetbundle = {
      AssetbundleURL = part.assetBundleUrl or "",
      AssetbundleSecondaryURL = "",
      MaterialIndex = 0,
      TypeIndex = 0,
      LoopingEffectIndex = 0,
    }
  else
    state.CustomMesh = {
      MeshURL = part.meshUrl or "",
      DiffuseURL = part.diffuseUrl or "",
      NormalURL = "",
      ColliderURL = part.colliderUrl or "",
      Convex = true,
      MaterialIndex = 3,
      TypeIndex = 0,
      CustomShader = {
        SpecularColor = { r = 1, g = 1, b = 1 },
        SpecularIntensity = 0,
        SpecularSharpness = 2,
        FresnelStrength = 0,
      },
      CastShadows = true,
    }
  end
  return state
end

-- The base is the top-level Custom_Model (TypeIndex 1 = figurine) with the
-- figure parts attached as ChildObjects, mirroring the harvested saves.
function buildMemberState(member, code, position, rotY, playerRgb)
  local model = member.model
  local base = (model and model.base) or PLAIN_BASE
  local parts = (model and model.parts) or {}
  local state = objectFields(
    member.displayName or "",
    member.ttsDescription or member.displayName or "",
    member.ttsGmNotes or "",
    tint(BASE_COLOUR, playerRgb)
  )
  state.Name = "Custom_Model"
  state.Transform = transform(position, { x = 0, y = rotY, z = 0 }, vec(base.scale or {1, 1, 1}))
  state.MeasureMovement = true
  state.Tags = memberTags(code, member.id, TAG_SPAWNED)
  state.CustomMesh = {
    MeshURL = base.meshUrl,
    DiffuseURL = base.diffuseUrl or "",
    NormalURL = "",
    ColliderURL = base.colliderUrl or "",
    Convex = true,
    MaterialIndex = 1,
    TypeIndex = 1,
    CustomShader = {
      SpecularColor = { r = 0.875, g = 0.8129, b = 0.7463 },
      SpecularIntensity = 0.015,
      SpecularSharpness = 2,
      FresnelStrength = 0,
    },
    CastShadows = true,
  }
  if #parts > 0 then
    state.ChildObjects = {}
    for i, part in ipairs(parts) do
      state.ChildObjects[i] = buildPartState(part)
    end
  end
  return state
end

-- One object state per member, laid out on the grid in member order. Members
-- listed in `keep` (by id) already have a bound model on the table and are
-- left out so re-importing does not duplicate them.
function buildSpawnSpecs(payload, anchor, playerRgb, keep)
  local specs = {}
  local slot = 0
  for _, member in ipairs(payload.members) do
    if not (keep and keep[member.id]) then
      slot = slot + 1
      specs[#specs + 1] = buildMemberState(member, payload.code, gridPosition(slot, anchor, GRID), anchor.rotY, playerRgb)
    end
  end
  return specs
end

-- The row button shows the short title; the full label is its tooltip.
function memberRowTitle(index, member)
  return string.format("%d. %s", index, member.displayName or "?")
end

function memberRowLabel(index, member)
  local name = member.displayName or "?"
  if member.unit and member.unit.name and member.unit.name ~= name then
    name = name .. " (" .. member.unit.name .. ")"
  end
  local kind = "plain base"
  if member.model then kind = "default model" end
  return string.format("%d. %s  [%s]", index, name, kind)
end

---------------------------------------------------------------- widgets --

-- The panel is classic 3D widgets (self.createInput / self.createButton) in the
-- tile's local space, laid out for the tile face that TTS reports at load:
--
-- * Measured live on 2026-11-04 through the External Editor API
--   (scripts/tts_exec.py, getVisualBoundsNormalized / getBoundsNormalized /
--   getScale on b91983 at scale (6,1,6)): visual bounds size (16, 0.2, 12) with
--   its centre 0.1 above the object position, collider bounds (16, 0.3, 12)
--   centred 0.15 above. So the face is local x -1.333..1.333 by z -1..1 (the
--   tile keeps its 4:3 image although save.json has CustomTile.Stretch true -
--   the Custom Tile page's "If the source image is stretched to make for a
--   symmetrical tile" did not hold on this build, the measurement wins), the
--   mesh spans local y 0..0.2 and the collider y 0..0.3: the pivot is the bottom
--   face. Widgets at y 0.12 sat inside the slab and never rendered; y 0.30 did.
-- * API (https://api.tabletopsimulator.com/object/): position is "Where the
--   button appears, relative to the Object's center"; width is "How wide the
--   button will be, relative to the Object"; the bounds tables carry "center",
--   "size" and "offset". No unit is named, so the width unit was read off the
--   screen: a width-900 button spanned two thirds of the 16-unit face at scale
--   6, i.e. 500 units per local unit, consistent with the LCT dice mats
--   (acae21, scale 3.75) whose 160/110/80-unit widgets sit 0.29 and 0.2 local
--   units apart. Font units are assumed to match; this is the one number that
--   remains unverified by a direct measurement.
-- * Inputs: height is "(font_size * # of lines) + 23" (createInput tips); a
--   width-900 input with height 100-130 and font 70-100 at button scale 1 reads
--   well at tile scale 6 (live-tuned 2026-11-04).
-- * Labels keep rotation {0,0,0}: their top points to local -z, and the tile's
--   rotY of 270 in save.json turns that toward +x, the way every seat faces
--   (CameraStates[0] yaw 90, hand zones rotY 270). Screen right is local -x.
--
-- The layout below is written for the measured reference face (REF) and is
-- stretched at load to whatever face the object reports (geomFromBounds), so a
-- different tile image cannot bury or overflow it.
REF = { hx = 4 / 3, hz = 1.0, top = 0.3 }
UNITS_PER_LOCAL = 500
-- Height renders on a different scale from width: 170-tall tracker buttons at
-- a 0.26 pitch read as separate on screen (so at least 654 per local unit),
-- while 210-tall ones measured about 0.38 local in a screenshot (548). 650 is
-- the bracketed value the overlap checks use; unverified beyond that.
HEIGHT_UNITS_PER_LOCAL = 650
WIDGET_LIFT = 0.1

-- Two blocks across the 4:3 face: the controls down the viewer's left
-- (col -0.66, 600 wide) and the member list down the right (col 0.66). Row
-- pitches respect the API's floor - "The minimum width/height is 60. Any lower
-- number (besides 0) will appear to be 60" - which is why member rows are 60
-- tall at a 0.14 pitch: a 25-tall row at 0.055 rendered as one blob on
-- 2026-11-04, and 40-tall rows at 0.14 read as separate rows.
LEFT = -0.56
RIGHT = 0.80
LAYOUT = {
  title = { row = -0.91, col = LEFT, font = 80 },
  baseUrl = { row = -0.72, col = LEFT, width = 760, height = 85, font = 55 },
  code = { row = -0.47, col = LEFT, width = 760, height = 115, font = 85 },
  colour = { row = -0.22, col = LEFT, width = 760, height = 90, font = 55 },
  bind = { row = 0.0, col = LEFT, width = 760, height = 90, font = 60 },
  import = { row = 0.24, col = LEFT, width = 760, height = 110, font = 80 },
  confirm = { row = 0.24, offset = 0.39, width = 370, height = 110, font = 60 },
  status = { row = 0.62, col = LEFT, width = 760, height = 170, font = 32, wrap = 40 },
  members = { row = -0.91, pitch = 0.14, col = RIGHT, width = 500, height = 60, font = 28 },
}

INPUT_BASE_URL = 0
INPUT_CODE = 1

GOLD = { 0.85, 0.70, 0.32 }
PANEL = { 0.12, 0.12, 0.12 }
ROW = { 0.2, 0.2, 0.2 }
LIGHT = { 0.95, 0.92, 0.85 }
DARK = { 0.05, 0.05, 0.05 }
GREEN = { 0.18, 0.49, 0.2 }
RED = { 0.55, 0.13, 0.13 }
GREY = { 0.33, 0.33, 0.33 }
WHITE = { 1, 1, 1 }

-- Face geometry from what the object reports: visual bounds give the face,
-- the collider can be thicker, and bounds are world-space so scale divides
-- them back to local units. Falls back to REF when nothing is measured.
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

function screenToLocal(col, row, geom)
  return { -col * geom.sx, geom.y, row * geom.sz }
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

function nextColourChoice(useMyColour, colour)
  if useMyColour then return false, COLOUR_ORDER[1] end
  for i, name in ipairs(COLOUR_ORDER) do
    if name == colour then
      if COLOUR_ORDER[i + 1] then return false, COLOUR_ORDER[i + 1] end
      return true, colour
    end
  end
  return false, COLOUR_ORDER[1]
end

function colourButtonLabel(useMyColour, colour)
  if useMyColour then return "Colour: mine" end
  return "Colour: " .. tostring(colour or COLOUR_ORDER[1])
end

function wrapText(text, maxChars)
  local lines = {}
  local line = ""
  for token in tostring(text or ""):gmatch("%S+") do
    local word = token
    while #word > maxChars do
      if line ~= "" then
        lines[#lines + 1] = line
        line = ""
      end
      lines[#lines + 1] = word:sub(1, maxChars)
      word = word:sub(maxChars + 1)
    end
    if line == "" then
      line = word
    elseif #line + 1 + #word <= maxChars then
      line = line .. " " .. word
    else
      lines[#lines + 1] = line
      line = word
    end
  end
  if line ~= "" then lines[#lines + 1] = line end
  return table.concat(lines, "\n")
end

local function fontFor(units, geom)
  local s = geom.sx
  if geom.sz < s then s = geom.sz end
  return math.floor(units * s + 0.5)
end

local function widget(id, col, row, width, height, font, geom)
  return {
    id = id,
    position = screenToLocal(col, row, geom), rotation = { 0, 0, 0 },
    width = math.floor(width * geom.sx + 0.5), height = math.floor(height * geom.sz + 0.5),
    font_size = fontFor(font, geom),
  }
end

function inputLayout(baseUrl, code, geom)
  geom = geom or geomFromBounds()
  local url = widget("baseUrl", LAYOUT.baseUrl.col, LAYOUT.baseUrl.row, LAYOUT.baseUrl.width, LAYOUT.baseUrl.height, LAYOUT.baseUrl.font, geom)
  url.input_function = "onBaseUrlInput"
  url.label = "API base URL"
  url.tooltip = "Where the roster tool is serving /api/tts/warband/<code>"
  url.value = baseUrl or ""
  url.alignment = 3
  url.color = LIGHT
  url.font_color = DARK
  local codeInput = widget("code", LAYOUT.code.col, LAYOUT.code.row, LAYOUT.code.width, LAYOUT.code.height, LAYOUT.code.font, geom)
  codeInput.input_function = "onCodeInput"
  codeInput.label = "Warband code"
  codeInput.tooltip = "The code the roster tool handed out for your warband"
  codeInput.value = code or ""
  codeInput.alignment = 3
  codeInput.color = WHITE
  codeInput.font_color = DARK
  return { url, codeInput }
end

local function button(id, label, click, col, row, width, height, font, colour, fontColour, tooltip, geom)
  local spec = widget(id, col, row, width, height, font, geom)
  spec.label = label
  spec.click_function = click
  spec.tooltip = tooltip or ""
  spec.color = colour
  spec.font_color = fontColour
  return spec
end

-- `view` is what the buttons show: colourLabel, pending (re-import confirm
-- shown), status, members (row labels, at most MAX_ROWS) and selected.
function widgetLayout(view, geom)
  geom = geom or geomFromBounds()
  local L = LAYOUT
  local specs = {}
  specs[#specs + 1] = button("title", "WARBAND IMPORTER", "noop", L.title.col, L.title.row, 0, 0, L.title.font, PANEL, GOLD, nil, geom)
  specs[#specs + 1] = button("colour", view.colourLabel, "onCycleColour", L.colour.col, L.colour.row,
    L.colour.width, L.colour.height, L.colour.font, GREY, LIGHT,
    "Which seat the models are placed and tinted for; 'mine' follows whoever presses Import", geom)
  specs[#specs + 1] = button("bind", "Bind", "onBind", L.bind.col, L.bind.row,
    L.bind.width, L.bind.height, L.bind.font, GREY, LIGHT,
    "Select a member below, press Bind, then pick up your own model", geom)
  if view.pending then
    specs[#specs + 1] = button("replace", "Replace", "onConfirmReplace", L.import.col - L.confirm.offset, L.confirm.row,
      L.confirm.width, L.confirm.height, L.confirm.font, RED, LIGHT, "Delete the spawned models and import again", geom)
    specs[#specs + 1] = button("cancel", "Cancel", "onConfirmCancel", L.import.col + L.confirm.offset, L.confirm.row,
      L.confirm.width, L.confirm.height, L.confirm.font, GREY, LIGHT, "Leave the table as it is", geom)
  else
    specs[#specs + 1] = button("import", "Import", "onImport", L.import.col, L.import.row,
      L.import.width, L.import.height, L.import.font, GREEN, LIGHT, "Fetch the warband and spawn its models", geom)
  end
  specs[#specs + 1] = button("status", wrapText(view.status, L.status.wrap), "noop", L.status.col, L.status.row,
    L.status.width, L.status.height, L.status.font, PANEL, LIGHT, nil, geom)
  local m = L.members
  for i, member in ipairs(view.members or {}) do
    if i > MAX_ROWS then break end
    local row = m.row + (i - 1) * m.pitch
    local bg, fg = ROW, LIGHT
    if view.selected == i then bg, fg = GOLD, DARK end
    specs[#specs + 1] = button("row" .. i, member.title, "selectMember" .. i, m.col, row, m.width, m.height, m.font, bg, fg,
      member.detail .. "\nClick to select, then Bind", geom)
  end
  return specs
end

-- One chat line so the numbers can be read back from the table if the panel
-- still renders wrong.
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

state = { baseUrl = DEFAULT_BASE_URL, code = "", colour = "Red", useMyColour = true }
session = { payload = nil, selected = nil, armed = {}, pending = nil, status = "Start the API, type a code, press Import." }
buttonIndex = {}
geometry = nil

function onSave()
  return JSON.encode(state)
end

function onLoad(saved)
  if saved and saved ~= "" then
    local ok, loaded = pcall(JSON.decode, saved)
    if ok and type(loaded) == "table" then
      for k, v in pairs(loaded) do state[k] = v end
    end
  end
  if trim(state.baseUrl) == "" then state.baseUrl = DEFAULT_BASE_URL end
  for i = 1, MAX_ROWS do
    _G["selectMember" .. i] = function(obj, colour, alt) onSelectMember(colour, i) end
  end
  relayout()
end

function measureGeometry()
  local visual = self.getVisualBoundsNormalized()
  local collider = self.getBoundsNormalized()
  local scale = self.getScale()
  geometry = geomFromBounds(visual, collider, scale, self.getPosition())
  return visual, scale
end

-- Re-measures the face and rebuilds every widget; also callable from the
-- console: getObjectFromGUID("b91983").call("relayout").
function relayout()
  local visual, scale = measureGeometry()
  self.clearInputs()
  for _, spec in ipairs(inputLayout(state.baseUrl, state.code, geometry)) do
    self.createInput(widgetParams(spec))
  end
  renderButtons()
  print(describeGeometry(self.getName(), geometry, scale, visual, widgetLayout(currentView(), geometry)))
end

function widgetParams(spec)
  local params = {}
  for k, v in pairs(spec) do
    if k ~= "id" then params[k] = v end
  end
  params.function_owner = self
  return params
end

function noop() end

function currentView()
  local labels = {}
  local members = (session.payload and session.payload.members) or {}
  for i = 1, math.min(#members, MAX_ROWS) do
    labels[i] = { title = memberRowTitle(i, members[i]), detail = memberRowLabel(i, members[i]) }
  end
  return {
    colourLabel = colourButtonLabel(state.useMyColour, state.colour),
    pending = session.pending ~= nil,
    status = session.status,
    members = labels,
    selected = session.selected,
  }
end

function renderButtons()
  self.clearButtons()
  buttonIndex = {}
  for i, spec in ipairs(widgetLayout(currentView(), geometry)) do
    self.createButton(widgetParams(spec))
    buttonIndex[spec.id] = i - 1
  end
  local members = (session.payload and session.payload.members) or {}
  if #members > MAX_ROWS then
    setStatus(string.format("Showing the first %d of %d members.", MAX_ROWS, #members))
  end
end

function setStatus(text)
  session.status = text
  log("[Warband Importer] " .. text)
  if buttonIndex.status then
    self.editButton({ index = buttonIndex.status, label = wrapText(text, LAYOUT.status.wrap) })
  end
end

function onBaseUrlInput(obj, colour, value, stillEditing)
  state.baseUrl = value or ""
  if not stillEditing then
    state.baseUrl = trim(value)
    if state.baseUrl == "" then state.baseUrl = DEFAULT_BASE_URL end
    self.editInput({ index = INPUT_BASE_URL, value = state.baseUrl })
  end
end

function onCodeInput(obj, colour, value, stillEditing)
  state.code = value or ""
  if not stillEditing then state.code = trim(value) end
end

-- The input callbacks only fire on keystrokes and deselection, so Import also
-- reads the widgets directly in case a value was typed but never deselected.
function readInputs()
  for _, input in ipairs(self.getInputs() or {}) do
    if input.index == INPUT_BASE_URL then
      state.baseUrl = trim(input.value)
    elseif input.index == INPUT_CODE then
      state.code = trim(input.value)
    end
  end
  if state.baseUrl == "" then state.baseUrl = DEFAULT_BASE_URL end
end

function onCycleColour(obj, colour)
  state.useMyColour, state.colour = nextColourChoice(state.useMyColour, state.colour)
  renderButtons()
end

function targetColour(playerColour)
  if state.useMyColour then return playerColour end
  return state.colour or "Red"
end

function findWarbandObjects(code)
  local found = { spawned = {}, bound = {} }
  for _, obj in ipairs(getObjectsWithTag(TAG_WARBAND .. code)) do
    if obj.hasTag(TAG_BOUND) then
      found.bound[#found.bound + 1] = obj
    elseif obj.hasTag(TAG_SPAWNED) then
      found.spawned[#found.spawned + 1] = obj
    end
  end
  return found
end

function onImport(obj, playerColour)
  readInputs()
  local code = trim(state.code)
  if code == "" then
    setStatus("Type a warband code, then Import.")
    return
  end
  local colour = targetColour(playerColour)
  local existing = findWarbandObjects(code)
  if #existing.spawned + #existing.bound > 0 then
    session.pending = { code = code, colour = colour }
    session.status = string.format(
      "%s is already on the table: replace %d spawned model(s) and re-bind %d of your own?",
      code, #existing.spawned, #existing.bound)
    renderButtons()
    return
  end
  fetchWarband(code, colour)
end

function onConfirmReplace(obj, playerColour)
  local pending = session.pending
  session.pending = nil
  renderButtons()
  if not pending then return end
  local removed = 0
  for _, obj in ipairs(findWarbandObjects(pending.code).spawned) do
    obj.destruct()
    removed = removed + 1
  end
  setStatus(string.format("Removed %d spawned model(s) for %s.", removed, pending.code))
  fetchWarband(pending.code, pending.colour)
end

function onConfirmCancel(obj, playerColour)
  session.pending = nil
  session.status = "Import cancelled."
  renderButtons()
end

function fetchWarband(code, colour)
  local url = warbandUrl(state.baseUrl, code)
  setStatus("Fetching " .. url)
  WebRequest.get(url, function(request)
    onWarbandResponse(request, code, colour)
  end)
end

function onWarbandResponse(request, code, colour)
  if request.is_error then
    setStatus("Request failed: " .. tostring(request.error))
    return
  end
  if request.response_code ~= 200 then
    setStatus(string.format("HTTP %s for %s", tostring(request.response_code), code))
    return
  end
  local ok, payload = pcall(JSON.decode, request.text)
  if not ok or payload == nil then
    setStatus("Response is not JSON.")
    return
  end
  local valid, why = validatePayload(payload)
  if not valid then
    setStatus("Rejected: " .. why)
    return
  end
  session.payload = payload
  session.selected = nil
  session.armed = {}
  spawnWarband(payload, colour)
  renderButtons()
end

function spawnWarband(payload, colour)
  local byId = {}
  for _, member in ipairs(payload.members) do byId[member.id] = member end

  local keep = {}
  local rebound = 0
  for _, obj in ipairs(findWarbandObjects(payload.code).bound) do
    local id = memberIdFromTags(obj.getTags())
    if id and byId[id] then
      applyBinding(obj, byId[id], payload.code, TAG_BOUND)
      keep[id] = true
      rebound = rebound + 1
    end
  end

  local mat = findMat()
  local specs = buildSpawnSpecs(payload, anchorFor(colour, self.getPosition(), mat), colourFor(colour), keep)
  for _, spec in ipairs(specs) do
    spawnObjectData({
      data = spec,
      position = { x = spec.Transform.posX, y = spec.Transform.posY, z = spec.Transform.posZ },
      rotation = { x = 0, y = spec.Transform.rotY, z = 0 },
    })
  end

  local suffix = ""
  if rebound > 0 then suffix = string.format(", re-bound %d of your own", rebound) end
  setStatus(string.format("%s: spawned %d model(s) for %s%s.", payload.warband.name or payload.code, #specs, colour, suffix))
end

-- The mat by GUID, else the first flat object about its size; nil falls back
-- to the measured default in DEFAULT_MAT.
function findMat()
  local mat = getObjectFromGUID(MAT_GUID)
  if mat then return mat.getBounds() end
  for _, obj in ipairs(getAllObjects()) do
    local bounds = obj.getBounds()
    if bounds and bounds.size and looksLikeMat(bounds.size) then return bounds end
  end
  return nil
end

function applyBinding(object, member, code, origin)
  object.setName(member.displayName or "")
  object.setDescription(member.ttsDescription or member.displayName or "")
  object.setGMNotes(member.ttsGmNotes or "")
  object.setTags(mergeTags(object.getTags(), memberTags(code, member.id, origin)))
end

function onSelectMember(playerColour, index)
  if not session.payload or not session.payload.members[index] then return end
  session.selected = index
  session.status = string.format("Selected %s. Press Bind, then pick up your model.", session.payload.members[index].displayName or "?")
  renderButtons()
end

function onBind(obj, playerColour)
  if not session.payload or not session.selected then
    setStatus("Import a warband and select a member first.")
    return
  end
  if session.armed[playerColour] then
    session.armed[playerColour] = nil
    setStatus("Bind cancelled.")
    return
  end
  session.armed[playerColour] = session.selected
  local member = session.payload.members[session.selected]
  setStatus(string.format("%s: pick up the model that becomes %s (Bind again to cancel).", playerColour, member.displayName or "?"))
end

-- Fires in object scripts for any object a player picks up, which is the same
-- moment ForceOrg's importer binds a unit to a model. Only an armed colour binds.
function onObjectPickUp(colour, object)
  local index = session.armed[colour]
  if not index or object == self then return end
  session.armed[colour] = nil
  local payload = session.payload
  if not payload or not payload.members[index] then return end
  local member = payload.members[index]
  local wasCalled = object.getName()
  applyBinding(object, member, payload.code, TAG_BOUND)
  local removed = 0
  for _, obj in ipairs(findWarbandObjects(payload.code).spawned) do
    if obj ~= object and memberIdFromTags(obj.getTags()) == member.id then
      obj.destruct()
      removed = removed + 1
    end
  end
  if wasCalled == "" then wasCalled = "your model" end
  local suffix = ""
  if removed > 0 then suffix = " (default model removed)" end
  session.status = string.format("Bound %s to %s%s.", member.displayName or "?", wasCalled, suffix)
  log("[Warband Importer] " .. session.status)
  renderButtons()
end
