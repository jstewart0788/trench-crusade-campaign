-- FTC-GUID: 738804
-- CONTENT:
-- table theme
-- terrain pass-through

keepForTerrainEditor = true

-- Defer a callback until Global's onLoad has run (it sets FTC_Global_Ready
-- last). After 10s run it anyway rather than hang a broken load forever.
function whenGlobalReady(callback)
    Wait.condition(callback, function()
        return Global.getVar("FTC_Global_Ready") == true
    end, 10, callback)
end

ttsDebugEnabled = false
matTextureSelected = 1
-- Optional terrain pass-through mode, controlled by the Advanced Features XML
-- panel (ed17d0). Collider snapshots make the second press a true reversal
-- instead of blindly enabling colliders that may originally have been disabled.
ADVANCED_FEATURES_GUID = "ed17d0"
terrainPassThroughEnabled = false
terrainPassThroughOriginalStates = {}
TERRAIN_PASS_THROUGH_TAGS = {
    "CO",
    "EF",
    "GH",
    "AB",
    "Pipes",
    "Generator",
    "Corner",
    "Long Barrier",
    "Short Barrier",
    "Small L",
    "Small L flip",
    "Tower",
}
TERRAIN_PASS_THROUGH_COLLIDER_TYPES = {
    "BoxCollider",
    "MeshCollider",
    "SphereCollider",
    "CapsuleCollider",
}
mapMat_GUID = "28865a"

matTextures = {
    {name = "Green", color = {0.00, 0.31, 0.03}, url = "https://steamusercontent-a.akamaihd.net/ugc/11079691797763465477/D6702E876654301F44E0DC5417C1A99B13C53F0E/"},
    {name = "Blue", color = {0.00, 0.31, 0.44}, url = "https://steamusercontent-a.akamaihd.net/ugc/15793090662305209631/DE9F6615DECEF086ACDEF61B8EDF4DBC700D6781/"},
    {name = "Grey", color = {0.38, 0.40, 0.34}, url = "https://steamusercontent-a.akamaihd.net/ugc/12631014249723827365/F940CC388DB67806FB4FC81A4CEEFFB20C1FDBE8/"},
    {name = "Purple", color = {0.36, 0.26, 0.41}, url = "https://steamusercontent-a.akamaihd.net/ugc/12602332143542612703/BC19D77679D80E92322FC9E22379165CBAE9DC32/"},
    {name = "Twilight", color = {0.23, 0.14, 0.20}, url = "https://steamusercontent-a.akamaihd.net/ugc/10315286395009396791/2AD7FD1F77E3B893ACD1EA3E829A8775B33CE6DF/"},
    {name = "Carbon", color = {0.15, 0.15, 0.15}, url = "https://steamusercontent-a.akamaihd.net/ugc/9426029365805227259/A84CEA512AF8E878EA04F8D9C3CD443E770D302B/"},
    {name = "Space", color = {0.10, 0.12, 0.23}, url = "https://steamusercontent-a.akamaihd.net/ugc/12558773339039292347/4E36E9A8342FC6189D40D5A286325BA8CCBC381A/"},
    {name = "Wood", color = {0.41, 0.23, 0.12}, url = "https://steamusercontent-a.akamaihd.net/ugc/11148353242079270856/3CFC6B4A291D6206065F20BCE0434FDA97E0F2BD/"},
    {name = "Space 2", color = {0.09, 0.11, 0.16}, url = "https://steamusercontent-a.akamaihd.net/ugc/12441852868785068442/74AB8BD713DD255584D8845F5925AD3805B65845/"},
    {name = "Green 2", color = {0.16, 0.35, 0.10}, url = "https://steamusercontent-a.akamaihd.net/ugc/12197125747641380246/0A4FA198199CF25E6984355BC676F062F2C050F8/"},
    {name = "Stripes", color = {0.29, 0.29, 0.32}, url = "https://steamusercontent-a.akamaihd.net/ugc/12743545711768789296/FECD0141A7A79CF8AEF46BA73D606CD1445B7FAF/"},
    {name = "Yellow", color = {0.50, 0.42, 0.08}, url = "https://steamusercontent-a.akamaihd.net/ugc/14942685497117844413/942EF15E06DA92A166A51323BE72769CC423A836/"},
}

function ttsDebugLog(message)
    if ttsDebugEnabled then
        print(message)
    end
end


function onLoad(saved_data)
    terrainPassThroughEnabled = false
    terrainPassThroughOriginalStates = {}
    if saved_data ~= "" then
        local loaded_data = JSON.decode(saved_data)
        matTextureSelected = loaded_data.svMatTextureSelected or matTextureSelected
        terrainPassThroughEnabled = loaded_data.svTerrainPassThroughEnabled or false
        terrainPassThroughOriginalStates = loaded_data.svTerrainPassThroughOriginalStates or {}
    end

    if terrainPassThroughEnabled then
        -- Component state is not dependable across a TTS save/reload. Re-apply
        -- after the restored objects have had a couple of frames to register;
        -- objects still loading custom assets are deferred individually below.
        Wait.frames(applyTerrainPassThroughMode, 2)
    end
    -- Object load order is not deterministic, so refresh the separate XML panel
    -- after both scripts have had time to register their public functions.
    Wait.frames(syncAdvancedFeaturesPanel, 2)

    whenGlobalReady(applyMatTexture)
end

function onSave()
    saved_data = JSON.encode({
        svMatTextureSelected = matTextureSelected,
        svTerrainPassThroughEnabled = terrainPassThroughEnabled,
        svTerrainPassThroughOriginalStates = terrainPassThroughOriginalStates,
    })

    return saved_data
end

-- ***********
-- TABLE THEME
-- ***********

function normalizeMatTextureIndex(index)
    if index > #matTextures then
        return 1
    end
    if index < 1 then
        return #matTextures
    end
    return index
end

function applyMatTexture()
    matTextureSelected = normalizeMatTextureIndex(matTextureSelected)
    local selected = matTextures[matTextureSelected]
    local mapMat = getObjectFromGUID(mapMat_GUID)
    if not mapMat or not selected then return end

    local customInfo = mapMat.getCustomObject()
    if customInfo.image ~= selected.url then
        customInfo.image = selected.url
        -- reload() respawns the mat, which resets its interaction flags back to the
        -- object's saved defaults -- making it clickable/draggable again after a theme
        -- change. Snapshot the current flags and restore them once the reloaded copy
        -- finishes spawning, so the mat stays locked and uninteractable as it is now.
        local wasLocked = mapMat.getLock()
        local wasInteractable = mapMat.interactable
        mapMat.setCustomObject(customInfo)
        restoreMatFlags(mapMat.reload(), wasLocked, wasInteractable)
    end
end

-- Re-apply the mat's lock/interactable/tooltip after a reload. reload() is async
-- (the object respawns over a few frames), so wait for spawning to finish before
-- writing the flags; otherwise they land on the old, about-to-be-destroyed copy.
function restoreMatFlags(reloaded, locked, interactable)
    local function mat() return reloaded or getObjectFromGUID(mapMat_GUID) end
    Wait.condition(function()
        local m = mat()
        if not m then return end
        m.setLock(locked)
        m.interactable = interactable
        m.tooltip = interactable
    end, function()
        local m = mat()
        return m ~= nil and not m.spawning
    end)
end

function setMatTexture(index)
    matTextureSelected = normalizeMatTextureIndex(index)
    applyMatTexture()
end

function setMatTexture1() setMatTexture(1) end
function setMatTexture2() setMatTexture(2) end
function setMatTexture3() setMatTexture(3) end
function setMatTexture4() setMatTexture(4) end
function setMatTexture5() setMatTexture(5) end
function setMatTexture6() setMatTexture(6) end
function setMatTexture7() setMatTexture(7) end
function setMatTexture8() setMatTexture(8) end
function setMatTexture9() setMatTexture(9) end
function setMatTexture10() setMatTexture(10) end
function setMatTexture11() setMatTexture(11) end
function setMatTexture12() setMatTexture(12) end

-- DEBUG-only: apply an arbitrary image URL to the map mat, bypassing the
-- matTextures presets. Mirrors applyMatTexture's reload + flag-restore so the mat
-- stays locked/uninteractable across the swap. matTextureSelected is left
-- untouched (this URL is not persisted), so a save+reload reverts to the selected
-- Table Theme swatch. Used by the "Custom URL" row on the Map Mat Picker overlay.
function setMatTextureFromUrl(url)
    if Global.getVar("DEBUG") ~= true then return end
    if type(url) ~= "string" then return end
    url = url:gsub("^%s+", ""):gsub("%s+$", "")
    if url == "" then return end
    local mapMat = getObjectFromGUID(mapMat_GUID)
    if not mapMat then return end
    local customInfo = mapMat.getCustomObject()
    if customInfo.image == url then return end
    customInfo.image = url
    local wasLocked = mapMat.getLock()
    local wasInteractable = mapMat.interactable
    mapMat.setCustomObject(customInfo)
    restoreMatFlags(mapMat.reload(), wasLocked, wasInteractable)
end

-- Read by the Table Theme swatches in mapFilter.ttslua (GUID 369707) so its XML
-- buttons can mark the active theme. The swatch buttons there forward back to the
-- setMatTexture<i> functions above.
function matTextureSelectedIndex() return matTextureSelected end

-- ***********************
-- TERRAIN PASS-THROUGH
-- ***********************

function hasTerrainPassThroughTag(obj)
    if not obj or obj.isDestroyed() then return false end
    for _, tag in ipairs(TERRAIN_PASS_THROUGH_TAGS) do
        if obj.hasTag(tag) then return true end
    end
    return false
end

-- Snapshot every relevant collider plus the physics flags we temporarily
-- harden. Stored by GUID so the mode remains exactly reversible after a save.
function captureTerrainPassThroughState(obj)
    if not obj or obj.isDestroyed() then return nil end
    local guid = obj.getGUID()
    if not guid or guid == "" then return nil end

    local existing = terrainPassThroughOriginalStates[guid]
    if existing then return existing end

    local state = {
        locked = obj.getLock(),
        useGravity = obj.use_gravity,
        colliders = {},
    }
    for _, colliderType in ipairs(TERRAIN_PASS_THROUGH_COLLIDER_TYPES) do
        local enabledStates = {}
        for index, collider in ipairs(obj.getComponentsInChildren(colliderType) or {}) do
            enabledStates[index] = collider.get("enabled") ~= false
        end
        state.colliders[colliderType] = enabledStates
    end
    terrainPassThroughOriginalStates[guid] = state
    return state
end

function setTerrainObjectPassThrough(obj)
    if not hasTerrainPassThroughTag(obj) then return 0 end
    if not captureTerrainPassThroughState(obj) then return 0 end

    -- A collider-free unlocked object can fall through the table. Terrain is
    -- normally locked already, but harden it while the mode is active and put
    -- its original flags back when the mode is disabled.
    obj.setLock(true)
    obj.use_gravity = false

    local colliderCount = 0
    for _, colliderType in ipairs(TERRAIN_PASS_THROUGH_COLLIDER_TYPES) do
        for _, collider in ipairs(obj.getComponentsInChildren(colliderType) or {}) do
            collider.set("enabled", false)
            colliderCount = colliderCount + 1
        end
    end
    return colliderCount
end

function restoreTerrainPassThroughState(obj, state)
    if not obj or obj.isDestroyed() then return 0 end

    local colliderCount = 0
    for _, colliderType in ipairs(TERRAIN_PASS_THROUGH_COLLIDER_TYPES) do
        local original = state and state.colliders and state.colliders[colliderType] or {}
        for index, collider in ipairs(obj.getComponentsInChildren(colliderType) or {}) do
            local wasEnabled = original[index]
            if wasEnabled == nil then wasEnabled = true end
            collider.set("enabled", wasEnabled)
            colliderCount = colliderCount + 1
        end
    end

    -- Restore colliders before unlocking/re-enabling gravity so an originally
    -- movable object cannot fall through the table between assignments.
    if state then
        if state.useGravity ~= nil then obj.use_gravity = state.useGravity end
        if state.locked ~= nil then obj.setLock(state.locked) end
    end
    return colliderCount
end

-- Custom-model colliders may not exist on the frame the object spawns. Wait for
-- the asset to finish loading, with a bounded fallback for a broken asset URL.
function scheduleTerrainPassThroughObject(obj)
    if not terrainPassThroughEnabled or not obj then return end
    local function applyIfStillEnabled()
        if terrainPassThroughEnabled and obj and not obj.isDestroyed() then
            setTerrainObjectPassThrough(obj)
        end
    end
    Wait.condition(applyIfStillEnabled, function()
        return obj == nil or obj.isDestroyed() or (not obj.spawning and not obj.loading_custom)
    end, 15, applyIfStillEnabled)
end

function applyTerrainPassThroughMode()
    local objects = getObjectsWithAnyTags(TERRAIN_PASS_THROUGH_TAGS) or {}
    local colliderCount = 0
    for _, obj in ipairs(objects) do
        if obj and not obj.isDestroyed() then
            if obj.spawning or obj.loading_custom then
                scheduleTerrainPassThroughObject(obj)
            else
                colliderCount = colliderCount + setTerrainObjectPassThrough(obj)
            end
        end
    end
    return #objects, colliderCount
end

function restoreTerrainPassThroughMode()
    local objectCount = 0
    local colliderCount = 0
    for guid, state in pairs(terrainPassThroughOriginalStates) do
        local obj = getObjectFromGUID(guid)
        if obj and not obj.isDestroyed() then
            colliderCount = colliderCount + restoreTerrainPassThroughState(obj, state)
            objectCount = objectCount + 1
        end
    end
    terrainPassThroughOriginalStates = {}
    return objectCount, colliderCount
end

function terrainPassThroughIsEnabled()
    return terrainPassThroughEnabled == true
end

function syncAdvancedFeaturesPanel()
    local panel = getObjectFromGUID(ADVANCED_FEATURES_GUID)
    if not panel then return end
    pcall(function()
        panel.call("syncAdvancedFeaturesUI")
    end)
end

function toggleTerrainPassThrough()
    terrainPassThroughEnabled = not terrainPassThroughEnabled
    local objectCount = 0
    if terrainPassThroughEnabled then
        objectCount = applyTerrainPassThroughMode()
    else
        objectCount = restoreTerrainPassThroughMode()
    end

    syncAdvancedFeaturesPanel()
    local status = terrainPassThroughEnabled and "ON" or "OFF"
    local color = terrainPassThroughEnabled and {0.35, 0.90, 1.00} or {0.75, 0.75, 0.75}
    broadcastToAll(string.format("Disable terrain colliders: %s (%d tagged objects).", status, objectCount), color)
end

-- Universal events are delivered to object scripts as well as Global. This
-- keeps the active mode working for terrain loaded later and after state swaps.
function onObjectSpawn(obj)
    if terrainPassThroughEnabled then scheduleTerrainPassThroughObject(obj) end
end

function onObjectStateChange(obj, oldStateGuid)
    if terrainPassThroughEnabled then scheduleTerrainPassThroughObject(obj) end
end

function onObjectDestroy(obj)
    if not obj or not terrainPassThroughOriginalStates then return end
    local guid = obj.getGUID()
    if guid and guid ~= "" then terrainPassThroughOriginalStates[guid] = nil end
end
