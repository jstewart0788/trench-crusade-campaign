-- Warband Importer (TC-016). Fetches a warband export from the platform API and
-- spawns one bound model per member; a Bind mode copies a member's binding onto
-- any model the player picks up instead.
--
-- Everything above the "TTS glue" line touches no TTS global so
-- mod/test/importer_test.lua can exercise it under plain Lua. TTS runs
-- MoonSharp (Lua 5.2): no `//`, no goto, no integer/float distinctions.

EXPORT_VERSION = "tc-warband-export-v1"
DEFAULT_BASE_URL = "http://127.0.0.1:3001"
API_PATH = "/api/tts/warband/"

TAG_WARBAND = "tc-warband:"
TAG_MEMBER = "tc-member:"
TAG_SPAWNED = "tc-spawned"
TAG_BOUND = "tc-bound"

MAX_ROWS = 30

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

-- Where an imported warband lands. In 1v1 the mat is centred on x=20 and runs
-- 60" along x by 44" along z; Red plays from +z, Blue from -z (dice mats at
-- z=+/-29, the LCT Army Placer parks armies at z=+/-74). The grid starts past
-- the dice mat, centred on the mat, and grows away from the table centre one
-- row of `perRow` at a time. Any other colour gets a grid in front of the
-- importer tile itself.
GRID = { perRow = 6, dx = 2.5, dz = 2.5, y = 1.5 }
ANCHORS = {
  Red = { x = 13.75, z = 44, dirX = 1, dirZ = 1, rotY = 180 },
  Blue = { x = 26.25, z = -44, dirX = -1, dirZ = -1, rotY = 0 },
}

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

function anchorFor(colour, origin)
  if ANCHORS[colour] then return ANCHORS[colour] end
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
    y = grid.y,
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

function memberRowLabel(index, member)
  local name = member.displayName or "?"
  if member.unit and member.unit.name and member.unit.name ~= name then
    name = name .. " (" .. member.unit.name .. ")"
  end
  local kind = "plain base"
  if member.model then kind = "default model" end
  return string.format("%d. %s  [%s]", index, name, kind)
end

---------------------------------------------------------------- TTS glue --

state = { baseUrl = DEFAULT_BASE_URL, code = "", colour = "Red", useMyColour = true }
session = { payload = nil, selected = nil, armed = {}, pending = nil }

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
  Wait.frames(refreshUi, 3)
end

function refreshUi()
  self.UI.setAttribute("baseUrl", "text", state.baseUrl)
  self.UI.setAttribute("code", "text", state.code or "")
  self.UI.setAttribute("useMyColour", "isOn", state.useMyColour and "true" or "false")
  self.UI.setAttribute("colourBtn", "active", state.useMyColour and "false" or "true")
  self.UI.setAttribute("colourBtn", "text", "Colour: " .. (state.colour or "Red"))
  renderMembers()
end

function setStatus(text)
  self.UI.setAttribute("status", "text", text)
  log("[Warband Importer] " .. text)
end

function onBaseUrlChanged(player, value)
  state.baseUrl = trim(value)
  if state.baseUrl == "" then state.baseUrl = DEFAULT_BASE_URL end
  self.UI.setAttribute("baseUrl", "text", state.baseUrl)
end

function onCodeChanged(player, value)
  state.code = trim(value)
end

function onUseMyColourChanged(player, value)
  state.useMyColour = (value == "True" or value == "true")
  refreshUi()
end

function onCycleColour(player)
  local following = COLOUR_ORDER[1]
  for i, name in ipairs(COLOUR_ORDER) do
    if name == state.colour then following = COLOUR_ORDER[i + 1] or COLOUR_ORDER[1] end
  end
  state.colour = following
  refreshUi()
end

function targetColour(player)
  if state.useMyColour then return player.color end
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

function onImport(player)
  local code = trim(state.code)
  if code == "" then
    setStatus("Type a warband code, then Import.")
    return
  end
  local colour = targetColour(player)
  local existing = findWarbandObjects(code)
  if #existing.spawned + #existing.bound > 0 then
    session.pending = { code = code, colour = colour }
    self.UI.setAttribute("confirmText", "text", string.format(
      "%s is already on the table: replace %d spawned model(s) and re-bind %d of your own?",
      code, #existing.spawned, #existing.bound))
    self.UI.setAttribute("confirmRow", "active", "true")
    setStatus("Confirm the re-import.")
    return
  end
  fetchWarband(code, colour)
end

function onConfirmReplace(player)
  local pending = session.pending
  session.pending = nil
  self.UI.setAttribute("confirmRow", "active", "false")
  if not pending then return end
  local removed = 0
  for _, obj in ipairs(findWarbandObjects(pending.code).spawned) do
    obj.destruct()
    removed = removed + 1
  end
  setStatus(string.format("Removed %d spawned model(s) for %s.", removed, pending.code))
  fetchWarband(pending.code, pending.colour)
end

function onConfirmCancel(player)
  session.pending = nil
  self.UI.setAttribute("confirmRow", "active", "false")
  setStatus("Import cancelled.")
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
  renderMembers()
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

  local specs = buildSpawnSpecs(payload, anchorFor(colour, self.getPosition()), colourFor(colour), keep)
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

function applyBinding(object, member, code, origin)
  object.setName(member.displayName or "")
  object.setDescription(member.ttsDescription or member.displayName or "")
  object.setGMNotes(member.ttsGmNotes or "")
  object.setTags(mergeTags(object.getTags(), memberTags(code, member.id, origin)))
end

function onSelectMember(player, value, id)
  local index = tonumber(id:match("^row(%d+)$"))
  if not index or not session.payload or not session.payload.members[index] then return end
  session.selected = index
  renderMembers()
  setStatus(string.format("Selected %s. Press Bind, then pick up your model.", session.payload.members[index].displayName or "?"))
end

function onBind(player)
  if not session.payload or not session.selected then
    setStatus("Import a warband and select a member first.")
    return
  end
  local colour = player.color
  if session.armed[colour] then
    session.armed[colour] = nil
    setStatus("Bind cancelled.")
    return
  end
  session.armed[colour] = session.selected
  local member = session.payload.members[session.selected]
  setStatus(string.format("%s: pick up the model that becomes %s (Bind again to cancel).", colour, member.displayName or "?"))
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
  setStatus(string.format("Bound %s to %s%s.", member.displayName or "?", wasCalled, suffix))
  renderMembers()
end

function renderMembers()
  local members = (session.payload and session.payload.members) or {}
  for i = 1, MAX_ROWS do
    local id = "row" .. i
    local member = members[i]
    if member then
      self.UI.setAttribute(id, "active", "true")
      self.UI.setAttribute(id, "text", memberRowLabel(i, member))
      if session.selected == i then
        self.UI.setAttribute(id, "color", "#d9b352")
        self.UI.setAttribute(id, "textColor", "#000000")
      else
        self.UI.setAttribute(id, "color", "#333333")
        self.UI.setAttribute(id, "textColor", "#e6e6e6")
      end
    else
      self.UI.setAttribute(id, "active", "false")
    end
  end
  if #members > MAX_ROWS then
    setStatus(string.format("Showing the first %d of %d members.", MAX_ROWS, #members))
  end
end
