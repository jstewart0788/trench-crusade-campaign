-- FTC-GUID: a18feb,8f0c3a
-- Trench Crusade objective marker: a flat 40mm chip that models pass through, with its
-- control range drawn as vector lines. Rulebook: Markers are up to 40mm across and do not
-- hinder movement (p146); a player controls an Objective with models on, in or within 1"
-- of it (p152), and where a terrain piece covers the marker the whole piece is the
-- Objective (p152).

MARKER_DIAMETER_IN = 40 / 25.4
CONTROL_RANGE_IN = 1
OBJECTIVE_TAG = "tc-token:objective"
SURFACE_TAG = "tc-terrain"
SPOT_COLOR = {0.35, 1, 0.45}
RING_COLOR = {1, 1, 1}
-- Every marker draws its lines this far above its own pivot, so rings sit at one height.
RING_LIFT_IN = 0.06
-- Rays a little off the marker's centre, for a point that lands exactly on the seam
-- between two ground tiles (a centre ray there passes through to the table).
SEAM_OFFSETS_IN = {{0.3, 0}, {-0.3, 0}, {0, 0.3}, {0, -0.3}}

-- ringIn: radius of the control ring (nil = 1" beyond the marker). band: for a covered
-- objective, the piece's footprint grown by 1" as x/z offsets from the marker centre,
-- drawn instead of the ring.
state = { ringIn = nil, band = nil }

local COLLIDERS = {"BoxCollider", "MeshCollider", "SphereCollider", "CapsuleCollider"}

function onLoad(saved)
    if saved and saved ~= "" then
        local ok, data = pcall(JSON.decode, saved)
        if ok and type(data) == "table" then
            state.ringIn = tonumber(data.ringIn)
            if type(data.band) == "table" then state.band = data.band end
        end
    end
    self.addContextMenuItem("Move objective", beginMove)
    self.addContextMenuItem("Delete objective", function() self.destruct() end)
    -- A spawned object reports its bounds and colliders once it has finished spawning.
    Wait.condition(settle, function() return not self.spawning and not self.loading_custom end, 10, settle)
end

function onSave()
    return JSON.encode(state)
end

function settle()
    makeIntangible()
    sizeToRules()
    seat()
    drawRings()
end

function controlRadius()
    return state.ringIn or (MARKER_DIAMETER_IN / 2 + CONTROL_RANGE_IN)
end

-- params: { ringIn = <in>, band = { {x, z}, ... } in world coordinates } (the battlefield
-- spawner passes the generator's objective spec).
function setRingRadius(params)
    params = type(params) == "table" and params or { ringIn = params }
    state.ringIn = tonumber(params.ringIn)
    state.band = nil
    if type(params.band) == "table" and #params.band > 1 then
        local p = self.getPosition()
        state.band = {}
        for i, pt in ipairs(params.band) do state.band[i] = { pt[1] - p.x, pt[2] - p.z } end
    end
    drawRings()
end

-- A trigger collider blocks nothing and nothing rests on it, but the cursor still hits it,
-- so the marker can be hovered, right-clicked and deleted.
function makeIntangible()
    self.setLock(true)
    self.use_gravity = false
    for _, kind in ipairs(COLLIDERS) do
        for _, c in ipairs(self.getComponentsInChildren(kind) or {}) do
            if kind == "MeshCollider" then c.set("convex", true) end
            c.set("isTrigger", true)
        end
    end
end

-- Scales the chip so its footprint is exactly the rulebook's 40mm, whatever size the
-- built-in model comes in at.
function sizeToRules()
    self.setRotation({0, 0, 0})
    local b = self.getBoundsNormalized()
    local across = math.max(b.size.x, b.size.z)
    if across <= 0 or math.abs(across - MARKER_DIAMETER_IN) < 1e-4 then return end
    local s = self.getScale()
    local k = MARKER_DIAMETER_IN / across
    self.setScale({s.x * k, s.y, s.z * k})
end

-- Points relative to the marker in world inches, in the dice tray's measuring-bubble
-- recipe (local x/y plane over scale, turned flat by rotation {270, 0, 0}, which sends
-- local +y to world -z).
local function line(points, color, thickness)
    local s = self.getScale()
    local pts = {}
    for i, p in ipairs(points) do
        pts[i] = {x = p[1] / s.x, y = -p[2] / s.z, z = RING_LIFT_IN / s.y}
    end
    return {points = pts, color = color, thickness = thickness, rotation = {270, 0, 0}}
end

local function circle(radiusIn)
    local pts = {}
    for i = 0, 64 do
        local a = math.rad(i * 360 / 64)
        pts[#pts + 1] = {math.cos(a) * radiusIn, math.sin(a) * radiusIn}
    end
    return pts
end

function drawRings()
    local lines = { line(circle(MARKER_DIAMETER_IN / 2), SPOT_COLOR, 0.12) }
    if state.band then
        lines[2] = line(state.band, RING_COLOR, 0.06)
    else
        lines[2] = line(circle(controlRadius()), RING_COLOR, 0.06)
    end
    self.setVectorLines(lines)
end

-- Highest battlefield surface under (x, z): generated terrain or the table felt, never a model
-- or another marker. Returns the height and whether it was terrain.
local function castTop(x, z)
    local best, onTerrain = nil, false
    for _, hit in ipairs(Physics.cast({origin = {x = x, y = 60, z = z}, direction = {x = 0, y = -1, z = 0}, type = 1, max_distance = 120}) or {}) do
        local o = hit.hit_object
        if o and o ~= self and not o.hasTag(OBJECTIVE_TAG) then
            local terrain = o.hasTag(SURFACE_TAG)
            if terrain or o.getGUID() == Global.getVar("felt_GUID") then
                if best == nil or hit.point.y > best then best, onTerrain = hit.point.y, terrain end
            end
        end
    end
    return best, onTerrain
end

function surfaceY(x, z)
    local top, onTerrain = castTop(x, z)
    if onTerrain then return top end
    local seam = nil
    for _, d in ipairs(SEAM_OFFSETS_IN) do
        local y, terrain = castTop(x + d[1], z + d[2])
        if terrain and (seam == nil or y > seam) then seam = y end
    end
    return seam or top
end

function seat()
    local p = self.getPosition()
    local top = surfaceY(p.x, p.z)
    if not top then return end
    local b = self.getBounds()
    local underside = b.center.y - b.size.y / 2
    self.setPosition({x = p.x, y = p.y + (top - underside), z = p.z})
end

function beginMove(player_color)
    self.setLock(false)
    broadcastToColor("Drag the objective to its new spot; it locks when you let go.", player_color, {0.35, 1, 0.45})
end

function onDrop()
    self.use_gravity = false
    seat()
    self.setLock(true)
end
