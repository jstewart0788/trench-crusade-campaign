-- FTC-GUID: a18feb,8f0c3a
-- Trench Crusade objective marker: a spot on the board that models pass through, with its
-- control range drawn round it. Rulebook: Markers are up to 40mm across and do not hinder
-- movement (p146); a player controls an Objective with models on, in or within 1" (p152).

MARKER_DIAMETER_IN = 40 / 25.4
CONTROL_RANGE_IN = 1
OBJECTIVE_TAG = "tc-token:objective"
SURFACE_TAG = "tc-terrain"
SPOT_COLOR = {0.35, 1, 0.45}
RING_COLOR = {1, 1, 1}
-- Same local-space recipe as the dice tray's measuring bubbles: points in the object's
-- x/y plane divided by its scale, turned flat by rotation {270, 0, 0}.
RING_LIFT = 0.17

-- ringIn: radius of the control ring in inches. nil = 1" beyond the 40mm marker; the
-- battlefield spawner sets it for an objective covered by a terrain piece, whose whole
-- footprint is the Objective.
state = { ringIn = nil }

local COLLIDERS = {"BoxCollider", "MeshCollider", "SphereCollider", "CapsuleCollider"}

function onLoad(saved)
    if saved and saved ~= "" then
        local ok, data = pcall(JSON.decode, saved)
        if ok and type(data) == "table" and tonumber(data.ringIn) then state.ringIn = tonumber(data.ringIn) end
    end
    makeIntangible()
    drawRings()
    self.addContextMenuItem("Move objective", beginMove)
    self.addContextMenuItem("Delete objective", function() self.destruct() end)
    -- Colliders on a custom asset can appear a few frames after spawn.
    Wait.condition(function()
        makeIntangible()
        seat()
    end, function() return not self.spawning and not self.loading_custom end, 10)
end

function onSave()
    return JSON.encode(state)
end

function controlRadius()
    return state.ringIn or (MARKER_DIAMETER_IN / 2 + CONTROL_RANGE_IN)
end

function setRingRadius(params)
    local r = type(params) == "table" and tonumber(params.ringIn) or tonumber(params)
    state.ringIn = r
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

local function circle(radiusIn)
    local pts, s = {}, 1 / self.getScale().x
    for i = 0, 64 do
        local a = math.rad(i * 360 / 64)
        pts[#pts + 1] = {x = math.cos(a) * radiusIn * s, y = math.sin(a) * radiusIn * s, z = RING_LIFT}
    end
    return pts
end

function drawRings()
    self.setVectorLines({
        {points = circle(MARKER_DIAMETER_IN / 2), color = SPOT_COLOR, thickness = 0.12, rotation = {270, 0, 0}},
        {points = circle(controlRadius()), color = RING_COLOR, thickness = 0.06, rotation = {270, 0, 0}},
    })
end

-- Highest battlefield surface under the marker: generated terrain or the mat, never a model
-- or another marker.
function surfaceY(x, z)
    local best = nil
    for _, hit in ipairs(Physics.cast({origin = {x = x, y = 60, z = z}, direction = {x = 0, y = -1, z = 0}, type = 1, max_distance = 120}) or {}) do
        local o = hit.hit_object
        if o and o ~= self and not o.hasTag(OBJECTIVE_TAG)
            and (o.hasTag(SURFACE_TAG) or o.getGUID() == Global.getVar("mat_GUID")) then
            if best == nil or hit.point.y > best then best = hit.point.y end
        end
    end
    return best
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
