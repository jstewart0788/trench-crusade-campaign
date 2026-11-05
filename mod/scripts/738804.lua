-- FTC-GUID: 738804
-- CONTENT:
-- size changer manager
-- deploy zones manager
-- objectives manager
-- game manager

menuX = 18
menuZ = 1.05-1.05

keepForTerrainEditor = true

mat_GUID = nil

-- Defer a callback until Global's onLoad has run (it sets FTC_Global_Ready
-- last). After 10s run it anyway rather than hang a broken load forever.
function whenGlobalReady(callback)
    Wait.condition(callback, function()
        return Global.getVar("FTC_Global_Ready") == true
    end, 10, callback)
end

function initGlobalRefs()
    mat_GUID = Global.getVar("mat_GUID")
    objectiveDebug = Global.getVar("DEBUG") == true
end
ttsDebugEnabled = false
matTextureSelected = 1
missionSetupControlsVisible = false
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
defaultMatTextureURL = "https://steamusercontent-a.akamaihd.net/ugc/11325734395194619417/872CDB652BC3D15E79DBC768D03D9298C36DB992/"

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
    math.randomseed(os.time())
    --self.setPosition({40,-4,0})
    --self.setRotation({0,270,0})
    -- load from saved
    --getData()
    deploySelected = nil
    deployMode = nil
    terrainPassThroughEnabled = false
    terrainPassThroughOriginalStates = {}
    if saved_data ~= "" then
        local loaded_data = JSON.decode(saved_data)
        gameMode = loaded_data.svgameMode
        singlesMode = loaded_data.svsSinglesMode
        inGame = loaded_data.svinGame
        currentTurn = loaded_data.svcurrentTurn
        currentPhase = loaded_data.svcurrentPhase
        mapSizeSelected = loaded_data.svmapSizeSelected
        sizeConfirmed = loaded_data.svsizeConfirmed
        deploySelected = loaded_data.svdeploySelected
        deployMode = loaded_data.svdeployMode
        matTextureSelected = loaded_data.svMatTextureSelected or matTextureSelected
        missionSetupControlsVisible = loaded_data.svMissionSetupControlsVisible
        terrainPassThroughEnabled = loaded_data.svTerrainPassThroughEnabled or false
        terrainPassThroughOriginalStates = loaded_data.svTerrainPassThroughOriginalStates or {}
        if missionSetupControlsVisible == nil then
            missionSetupControlsVisible = gameMode == "game" and not inGame
        end
    end

    if sizeConfirmed then
        if isValidDeployMode(deployMode) then
            setDeployZonesMode(deployMode, true)
        else
            setDeployZonesForSize(true)
        end
        if not deploySelected or not DeployZonesData[deploySelected] then
            deploySelected = #DeployZonesData
        end
    else
        deploySelected = #DeployZonesData
    end
    rebuildOverlayTracking()
    syncTerritoryLineButton()
    if terrainPassThroughEnabled then
        -- Component state is not dependable across a TTS save/reload. Re-apply
        -- after the restored objects have had a couple of frames to register;
        -- objects still loading custom assets are deferred individually below.
        Wait.frames(applyTerrainPassThroughMode, 2)
    end
    -- Object load order is not deterministic, so refresh the separate XML panel
    -- after both scripts have had time to register their public functions.
    Wait.frames(syncAdvancedFeaturesPanel, 2)

    -- Everything below reads Global's variables (mat_GUID, counters), so it waits
    -- for Global's onLoad; losing that race left the mat/counter references nil.
    whenGlobalReady(function()
        initGlobalRefs()
        mat = getObjectFromGUID(mat_GUID)
        applyMatTexture(false)
        if simulation then ttsDebugLog("THIS IS "..currentTurn.." TURN") end

        redTurnCounter = getObjectFromGUID(Global.getVar("redTurnCounter_GUID"))
        blueTurnCounter = getObjectFromGUID(Global.getVar("blueTurnCounter_GUID"))
        gameTurnCounter = getObjectFromGUID(Global.getVar("gameTurnCounter_GUID"))
        if inGame == false then
            Notes.setNotes(notePadTxt)
        else
            Notes.setNotes("")
        end
        if not gameTurnCounter then
            ttsDebugLog("gameTurnCounter not found during onLoad")
        end
        writeMenus()
        -- The phase highlight and active-turn strip colours live only in the
        -- non-persistent Global overlay, so they reset to the XML defaults on reload.
        -- Re-push them from the restored game state (immediate + a race-safe retry in
        -- case the overlay isn't live yet when this object's onLoad runs). Guarded by
        -- inGame so the pre-game setup screen keeps all phase glyphs dimmed.
        if inGame then
            updateGameStateHUD()
            Wait.time(updateGameStateHUD, 1)
        end
    end)
end

function onSave()
    saved_data = JSON.encode({
        svinGame = inGame,
        svgameMode = gameMode,
        svsSinglesMode = singlesMode,
        svcurrentTurn = currentTurn,
        svcurrentPhase = currentPhase,
        svmapSizeSelected = mapSizeSelected,
        svsizeConfirmed = sizeConfirmed,
        svdeploySelected = deploySelected,
        svdeployMode = deployMode,
        svMatTextureSelected = matTextureSelected,
        svMissionSetupControlsVisible = missionSetupControlsVisible,
        svTerrainPassThroughEnabled = terrainPassThroughEnabled,
        svTerrainPassThroughOriginalStates = terrainPassThroughOriginalStates,
    })

    return saved_data
end

-- ********************
-- SIZE CHANGER MANAGER
-- ********************

positionValue={0,-9.52,0}
-- Mat scale = board inches / 36 (the surface mesh is 36" square). Keep these
-- exact: the deployment/quarter/reserve overlays measure the board as
-- getScale() * sizeMulti, so rounded scales (e.g. 1.66 -> 59.76") shift lines.
sizeData={
    {id=1, name='King of the Colosseum - 36" x 36"', scale={1,1,1}, defaultObjectives=0},
    {id=2, name='C o m b a t     P a t r o l - 44" x 30"', scale={44/36,1,30/36}, defaultObjectives=0},
    {id=4, name='S t r i k e     F o r c e - 44" x 60"', scale={60/36,1,44/36}, defaultObjectives=0},
    {id=5, name='O n s l a u g h t - 44" x 90"', scale={90/36,1,44/36}, defaultObjectives=0},
    {id=6, name='B o a r d i n g     A c t i o n - 28" x 48"', scale={48/36,1,28/36}, defaultObjectives=0},
}

menuSizeX = 0
menuSizeY = 5
menuSizeZ = 16
arrowOffset=9.5

-- Default to Strike Force (id 4). Resolved by id (not a literal index) so it
-- survives the Incursion removal and any future reordering of sizeData.
mapSizeSelected=1
for i, s in ipairs(sizeData) do
    if s.id == 4 then
        mapSizeSelected = i
        break
    end
end
numberSizes=#sizeData
sizeConfirmed=false

-- Select a battlefield size by its stable sizeData id (not table index). The
-- per-size buttons call this so they keep working regardless of sizeData order.
function setSelectedSizeById(id)
    for i, s in ipairs(sizeData) do
        if s.id == id then
            mapSizeSelected = i
            return
        end
    end
end
-- The old "SELECT BATTLEFIELD SIZE" up/down picker has been replaced by one
-- button per battlefield size. Every button below starts a singles-style game
-- (no seat/turn enforcement) via its confirm* handler; the size buttons pick their
-- size first. Buttons are laid out in a two-column grid:
--   row 1: 1v1            | Solo            (Strike Force size)
--   row 2: Combat Patrol  | Onslaught       (Onslaught relocates the menus)
--   row 3: Colosseum      | Boarding Action
-- (There is no separate Strike Force button: 1v1/Solo already cover that size.)
local menuColLeft  = -menuSizeX - 6.0
local menuColRight = -menuSizeX + 6.0
local menuRow1 = menuSizeZ + 0.0
local menuRow2 = menuSizeZ + 2.65
local menuRow3 = menuSizeZ + 5.30

confirmBtn = {
    index          = i,
    label          = "1v1",
    click_function = "confirmStandardGame",
    function_owner = self,
    position       = { menuColLeft, menuSizeY, menuRow1 },
    rotation       = { 0, 0, 0 },
    height         = 810,
    width          = 4500,
    scale          = { 1, 1, 1 },
    font_size      = 375,
    color          = {
         0.191999942,
        0.701,
        0.167999923},  -- Rich Forest Green
    font_color     = { 1.0, 1.0, 1.0 },  -- Pure White
    hover_color    = { 0.25, 0.78, 0.22, 1 },
    press_color    = { 0.13, 0.55, 0.12, 1 }
}

confirmBtn4 = {
    index          = i,
    label          = "Solo",
    click_function = "confirmForSingles",
    function_owner = self,
    position       = { menuColRight, menuSizeY, menuRow1 },
    rotation       = { 0, 0, 0 },
    height         = 810,
    width          = 4500,
    scale          = { 1, 1, 1 },
    font_size      = 375,
    color          = {
        0.117999949,
        0.53,
         1},  -- Vibrant Royal Blue
    font_color     = { 1.0, 1.0, 1.0 },  -- Pure White
    hover_color    = { 0.18, 0.6, 1, 1 },
    press_color    = { 0.08, 0.4, 0.82, 1 }
}

confirmBtn5 = {
    index          = i,
    label          = "Combat Patrol",
    click_function = "confirmCombatPatrol",
    function_owner = self,
    position       = { menuColLeft, menuSizeY, menuRow2 },
    rotation       = { 0, 0, 0 },
    height         = 810,
    width          = 4500,
    scale          = { 1, 1, 1 },
    font_size      = 375,
    color          = { 0.70, 0.16, 0.16 },  -- Red
    font_color     = { 1.0, 1.0, 1.0 },  -- Pure White
    hover_color    = { 0.82, 0.22, 0.22, 1 },
    press_color    = { 0.55, 0.10, 0.10, 1 }
}

-- Onslaught (purple) sits next to Combat Patrol. Like Solo it runs singles-style,
-- but forces the 44"x90" battlefield, keeps the plain default mat art, and applies
-- the full Onslaught board reshuffle (matrix props dropped, menus relocated).
confirmBtnOnslaught = {
    index          = i,
    label          = "Onslaught",
    click_function = "confirmOnslaught",
    function_owner = self,
    position       = { menuColRight, menuSizeY, menuRow2 },
    rotation       = { 0, 0, 0 },
    height         = 810,
    width          = 4500,
    scale          = { 1, 1, 1 },
    font_size      = 375,
    color          = { 0.55, 0.27, 0.78 },  -- Purple
    font_color     = { 1.0, 1.0, 1.0 },  -- Pure White
    hover_color    = { 0.63, 0.35, 0.85, 1 },
    press_color    = { 0.42, 0.18, 0.62, 1 }
}

confirmBtnColosseum = {
    index          = i,
    label          = "Colosseum",
    click_function = "confirmColosseum",
    function_owner = self,
    position       = { menuColLeft, menuSizeY, menuRow3 },
    rotation       = { 0, 0, 0 },
    height         = 810,
    width          = 4500,
    scale          = { 1, 1, 1 },
    font_size      = 375,
    color          = { 0.85, 0.55, 0.15 },  -- Amber
    font_color     = { 1.0, 1.0, 1.0 },  -- Pure White
    hover_color    = { 0.93, 0.63, 0.22, 1 },
    press_color    = { 0.68, 0.43, 0.10, 1 }
}

confirmBtnBoardingAction = {
    index          = i,
    label          = "Boarding Action",
    click_function = "confirmBoardingAction",
    function_owner = self,
    position       = { menuColRight, menuSizeY, menuRow3 },
    rotation       = { 0, 0, 0 },
    height         = 810,
    width          = 4500,
    scale          = { 1, 1, 1 },
    font_size      = 375,
    color          = { 0.40, 0.45, 0.55 },  -- Slate
    font_color     = { 1.0, 1.0, 1.0 },  -- Pure White
    hover_color    = { 0.48, 0.53, 0.63, 1 },
    press_color    = { 0.30, 0.34, 0.43, 1 }
}

-- "GAME MODES" header above row 1, styled like the Deployment Zone picker (white
-- fill, black text, bordered) but with no arrows. Centered between the two columns
-- and wide enough to span from the left edge of 1v1 to the right edge of Solo.
-- height/font_size mirror deployPickerButtonHeight/deployPickerButtonFontSize as
-- literals (those vars are defined later in the chunk, after this table).
gameModesHeaderBtn = {
    index          = i,
    label          = "GAME MODES",
    click_function = "none",
    function_owner = self,
    position       = { -menuSizeX, menuSizeY, menuSizeZ - 2.05 },
    rotation       = { 0, 0, 0 },
    height         = 810,
    width          = 9900,
    scale          = { 1, 1, 1 },
    font_size      = 640,
    color          = { 0.17, 0.17, 0.19 },  -- Charcoal
    font_color     = { 1, 1, 1 }            -- White text
}

function refreshMat()
    mat = getObjectFromGUID(mat_GUID)
end

function normalizeMatTextureIndex(index)
    if index > #matTextures then
        return 1
    end
    if index < 1 then
        return #matTextures
    end
    return index
end

function applyMatTexture(rewriteMenu)
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

    if rewriteMenu then
        Wait.frames(function() writeMenus() end, 2)
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
    applyMatTexture(true)
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

function writeSizeMenu()
    self.clearButtons()
    if sizeConfirmed then
        return
    end
    createButtonWithBorder(startBtnDisabled)
    -- Borders are a lightened tint of each button's own fill so they read against
    -- the dark navy table (the default near-black border would disappear there).
    createButtonWithBorder(gameModesHeaderBtn, { 0.55, 0.58, 0.66, 1 })  -- light slate
    createButtonWithBorder(confirmBtn,             { 0.45, 0.90, 0.40, 1 })  -- bright green
    createButtonWithBorder(confirmBtn4,            { 0.43, 0.66, 1.00, 1 })  -- sky blue
    createButtonWithBorder(confirmBtn5,            { 0.94, 0.42, 0.42, 1 })  -- light red
    createButtonWithBorder(confirmBtnOnslaught,    { 0.78, 0.55, 0.95, 1 })  -- light purple
    createButtonWithBorder(confirmBtnColosseum,    { 1.00, 0.78, 0.40, 1 })  -- light amber
    createButtonWithBorder(confirmBtnBoardingAction, { 0.70, 0.76, 0.86, 1 })  -- light slate-blue
    -- The selection screen always shows the mat at Strike Force size, regardless of
    -- which size was last played (Back to Selection can leave mapSizeSelected on,
    -- say, Onslaught). Each button then sets its own scale on confirm via
    -- confirmSizeMat().
    setSelectedSizeById(4)
    mat.setScale(sizeData[mapSizeSelected].scale)
    mat.setPosition(positionValue)
end






-- The standard game on the Strike Force battlefield. Every start button runs
-- singles-style (no seat/turn enforcement); 1v1 and Solo are two labels for this
-- same game. Force Strike Force (id 4) so it no longer depends on a size picker.
function confirmForSingles()
    singlesMode = "singles"
    setSelectedSizeById(4)
    deployMode = "edition11"
    loadGameWithoutMapContainers()
end

function confirmStandardGame()
    confirmForSingles()
end

-- Combat Patrol plays like Solo (one player drives both sides), but uses the
-- Combat Patrol deployment zones.
function confirmCombatPatrol()
    singlesMode = "singles"
    deployMode = "combatPatrolGame"
    -- Combat Patrol is always played on the 44" x 30" battlefield. Force that size
    -- so it applies regardless of which button was last used; confirmSizeMat() (via
    -- loadGameWithoutMapContainers) then scales the mat to match.
    setSelectedSizeById(2)
    loadGameWithoutMapContainers()
end

-- Onslaught keeps its own dedicated logic: a singles game on the 44"x90"
-- battlefield that relocates the menus to clear the longer board
-- (applyOnslaughtButtonLayout).
function confirmOnslaught()
    singlesMode = "singles"
    setSelectedSizeById(ONSLAUGHT_SIZE_ID)
    deployMode = "edition11"
    loadGameWithoutMapContainers()
    applyOnslaughtButtonLayout()
end

-- The remaining per-size buttons (Colosseum / Boarding Action): a singles game
-- scaled to the chosen battlefield on the default mat.
sizeDeployModeById = {
    [1] = "colosseum",
    [4] = "strikeForce",
    [6] = "boardingAction",
}

function confirmSizedSinglesGame(sizeId)
    singlesMode = "singles"
    setSelectedSizeById(sizeId)
    deployMode = sizeDeployModeById[sizeId] or "strikeForce"
    loadGameWithoutMapContainers()
end

function confirmColosseum()      confirmSizedSinglesGame(1) end
function confirmBoardingAction() confirmSizedSinglesGame(6) end

function loadGameWithoutMapContainers()
    confirmSizeMat()
end

function applySurfaceMatTexture(url)
    mat = getObjectFromGUID(mat_GUID)
    if not mat or not url then return end

    local customInfo = mat.getCustomObject()
    if customInfo.diffuse ~= url then
        customInfo.diffuse = url
        mat.setCustomObject(customInfo)
        mat = mat.reload()
    end
end

function applyDefaultMatTexture()
    applySurfaceMatTexture(defaultMatTextureURL)
end

function confirmSizeMat()
    gameMode= "game"
    missionSetupControlsVisible = true
    applyDefaultMatTexture()
    sizeConfirmed=true
        mat.setScale(sizeData[mapSizeSelected].scale)
    self.setRotation({0,270,0})
    if deployMode and isValidDeployMode(deployMode) then
        setDeployZonesMode(deployMode, false)
    else
        setDeployZonesForSize(false)
    end
    writeMenus()
end

-- Onslaught (id 5, 44"x90") is long enough that the default deployment toggle
-- button row sits over the battlefield. On a 1v1 Onslaught game only, relocate
-- the six interactive buttons into a single column off the long edge (x=50,
-- y=-1) with evenly stepped z. Matched by sizeData id so it survives reordering.
-- Buttons reset to their baked ftc_base.json transforms on game reload.
ONSLAUGHT_SIZE_ID = 5
onslaughtButtonLayout = {
    {guid = "7b7ab8", pos = {50, 1, 19}},  -- Strat Reserves
    {guid = "8c71ab", pos = {50, 1, 26}},  -- Area Denial
    {guid = "7e7711", pos = {50, 1, 33}},  -- Territory Line
    {guid = "59decf", pos = {50, 1, -19}},  -- Table Quarters
    {guid = "8aba11", pos = {50, 1, -26}},  -- Deployment Zone
    {guid = "15d652", pos = {50, 1, -33}},  -- Show Objectives
    {guid = "369707", pos = {61, 0, -25.5}},  -- Table Theme picker overlay (MAP_FILTER_GUID)
}

function selectedSizeIsOnslaught()
    local entry = sizeData[mapSizeSelected]
    return entry ~= nil and entry.id == ONSLAUGHT_SIZE_ID
end

function applyOnslaughtButtonLayout()
    for _, b in ipairs(onslaughtButtonLayout) do
        local obj = getObjectFromGUID(b.guid)
        if obj then
            obj.setPosition(b.pos)
        end
    end
    broadcastToAll("Onslaught mode enabled, menus are moved to the top of the table", {1, 0.6, 0.1})
end

-- On a 1v1/Solo Onslaught game the setup controls are repositioned to clear the
-- longer battlefield:
--   * TOP row -- Start Game, First-player toggle, Deployment Zone picker (+ arrows
--     and the Clear Table flank) -- is lifted +X so it lands a few X-units above
--     the counter row rather than out past the table edge.
-- Applied at render time so it tracks the selected size and survives reload.
ONSLAUGHT_MID_ROW_X_OFFSET = 39   -- world +X for the mid setup row
ONSLAUGHT_TOP_ROW_DX = 19         -- world +X delta for the Start/First/Deployment cluster
ONSLAUGHT_TOP_ROW_DZ = 0          -- world +Z delta (0 = directly above the MID row)

-- True only once a game mode is confirmed (gameMode == "game") and the chosen size
-- is Onslaught -- so nothing shifts during size preview or for other sizes.
function onslaughtSetupActive()
    return gameMode == "game" and selectedSizeIsOnslaught()
end

-- World +X the MID row is shifted by (0 when not an Onslaught game).
function setupMidRowXOffset()
    return onslaughtSetupActive() and ONSLAUGHT_MID_ROW_X_OFFSET or 0
end

-- World (dx, dz) the TOP-row cluster is translated by (0,0 when not Onslaught).
function topRowDX() return onslaughtSetupActive() and ONSLAUGHT_TOP_ROW_DX or 0 end
function topRowDZ() return onslaughtSetupActive() and ONSLAUGHT_TOP_ROW_DZ or 0 end

-- The menu object is rotated rotY=270, so world +X = local -Z and world +Z = local
-- +X. Returns a copy of a top-row button definition translated by (topRowDX,
-- topRowDZ) in world space, preserving the cluster's internal layout. Returns the
-- original table when there is no translation.
function withSetupXOffset(btnDef)
    local dx, dz = topRowDX(), topRowDZ()
    if dx == 0 and dz == 0 then return btnDef end
    local copy = {}
    for k, v in pairs(btnDef) do copy[k] = v end
    copy.position = {btnDef.position[1] + dz, btnDef.position[2], btnDef.position[3] - dx}
    return copy
end

function updateDeployObjectivesSelection()
    deploySelected = #DeployZonesData
end

function selectedDeployment()
    return DeployZonesData and DeployZonesData[deploySelected] or nil
end

function selectedDeploymentSpawnsOverlay()
    local zone = selectedDeployment()
    return zone ~= nil and zone.draw and zone.draw.type ~= "none"
end

-- END size changer

-- ********************
-- DEPLOY ZONES MANAGER
-- ********************

DeployZonesStrikeForce = {
    --Chapter Approved 2025 Missions
    {name = "Hammer and Anvil", objectivesID = 101, draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromSide = 18},
        --[[2]]{type = "line", color = "Teal", position = "-x", fromSide = 18}}},
    {name = "Dawn of War", objectivesID = 102, draw = {
        --[[1]]{type = "line", color = "Teal", position = "-z", fromSide = 12},
        --[[2]]{type = "line", color = "Red", position = "z", fromSide = 12}}},
    {name = "Sweeping Engagement", objectivesID = 103, draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-z", steps = {{fromSide = 8}, {fromSide = 14}}},
        --[[2]]{type = "stepped", color = "Red", position = "z", steps = {{fromSide = 14}, {fromSide = 8}}}}},
    {name = "Search and Destroy", objectivesID = 104, draw = {
        --[[1]]{type = "quarter", color = "Teal", position = "-x-z", fromCenter = 9},
        --[[2]]{type = "quarter", color = "Red", position = "xz", fromCenter = 9},
        --[[3]]{type = "circle", color = "White", fromCenter = 9}}},
    {name = "Crucible of Battle", objectivesID = 105, draw = {
        --[[1]]{type = "triangle", color = "Red", position = "x"},
        --[[2]]{type = "triangle", color = "Teal", position = "-x"}}},
    {name = "Tipping Point", objectivesID = 106, draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-x", steps = {{fromSide = 12}, {fromSide = 20}}},
        --[[2]]{type = "stepped", color = "Red", position = "x", steps = {{fromSide = 20}, {fromSide = 12}}}}},
    --Hidden Supplies variants
    {name = "Hammer and Anvil (HS)", objectivesID = 107, draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromSide = 18},
        --[[2]]{type = "line", color = "Teal", position = "-x", fromSide = 18}}},
    {name = "Hammer and Anvil (HS2)", objectivesID = 108, draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromSide = 18},
        --[[2]]{type = "line", color = "Teal", position = "-x", fromSide = 18}}},
    {name = "Dawn of War (HS)", objectivesID = 109, draw = {
        --[[1]]{type = "line", color = "Teal", position = "-z", fromSide = 12},
        --[[2]]{type = "line", color = "Red", position = "z", fromSide = 12}}},
    {name = "Dawn of War (HS2)", objectivesID = 110, draw = {
        --[[1]]{type = "line", color = "Teal", position = "-z", fromSide = 12},
        --[[2]]{type = "line", color = "Red", position = "z", fromSide = 12}}},
    {name = "Sweeping Engagement (HS)", objectivesID = 111, draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-z", steps = {{fromSide = 8}, {fromSide = 14}}},
        --[[2]]{type = "stepped", color = "Red", position = "z", steps = {{fromSide = 14}, {fromSide = 8}}}}},
    {name = "Sweeping Engagement (HS2)", objectivesID = 112, draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-z", steps = {{fromSide = 8}, {fromSide = 14}}},
        --[[2]]{type = "stepped", color = "Red", position = "z", steps = {{fromSide = 14}, {fromSide = 8}}}}},
    {name = "Search and Destroy (HS)", objectivesID = 113, draw = {
        --[[1]]{type = "quarter", color = "Teal", position = "-x-z", fromCenter = 9},
        --[[2]]{type = "quarter", color = "Red", position = "xz", fromCenter = 9},
        --[[3]]{type = "circle", color = "White", fromCenter = 9}}},
    {name = "Search and Destroy (HS2)", objectivesID = 114, draw = {
        --[[1]]{type = "quarter", color = "Teal", position = "-x-z", fromCenter = 9},
        --[[2]]{type = "quarter", color = "Red", position = "xz", fromCenter = 9},
        --[[3]]{type = "circle", color = "White", fromCenter = 9}}},
    {name = "Crucible of Battle (HS)", objectivesID = 115, draw = {
        --[[1]]{type = "triangle", color = "Red", position = "x"},
        --[[2]]{type = "triangle", color = "Teal", position = "-x"}}},
    {name = "Crucible of Battle (HS2)", objectivesID = 116, draw = {
        --[[1]]{type = "triangle", color = "Red", position = "x"},
        --[[2]]{type = "triangle", color = "Teal", position = "-x"}}},
    {name = "Tipping Point (HS)", objectivesID = 117, draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-x", steps = {{fromSide = 12}, {fromSide = 20}}},
        --[[2]]{type = "stepped", color = "Red", position = "x", steps = {{fromSide = 20}, {fromSide = 12}}}}},
    {name = "Tipping Point (HS2)", objectivesID = 118, draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-x", steps = {{fromSide = 12}, {fromSide = 20}}},
        --[[2]]{type = "stepped", color = "Red", position = "x", steps = {{fromSide = 20}, {fromSide = 12}}}}},
    {name = "No Deployment Zone", draw = {type = "none"}},
}

DeployZonesCombatPatrol = {
    {name = "(CP) Clash of Patrols", objectivesID = 22, draw = {
        --[[1]]{type = "line", color = "Red", position = "-z", fromCenter = 10 },
        --[[2]]{type = "line", color = "Teal", position = "z", fromCenter = 10}}},
    {name = "(CP) Archeotech Recovery", objectivesID = 23, draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromCenter = 12 },
        --[[2]]{type = "line", color = "Teal", position = "-x", fromCenter = 12}}},
    {name = "(CP) Forward Outpost", objectivesID = 24, draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromCenter = 12 },
        --[[2]]{type = "line", color = "Teal", position = "-x", fromCenter = 12}}},
    {name = "(CP) Scorched Earth", objectivesID = 25, draw = {
        --[[1]]{type = "triangle", color = "Red", position = "x"},
        --[[2]]{type = "triangle", color = "Teal", position = "-x"}}},
    {name = "(CP) Sweeping Raid", objectivesID = 26, draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromCenter = 12 },
        --[[2]]{type = "line", color = "Teal", position = "-x", fromCenter = 12}}},
    {name = "(CP) Display of Might", objectivesID = 27, draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromCenter = 12 },
        --[[2]]{type = "line", color = "Teal", position = "-x", fromCenter = 12}}},
    {name = "(CP) Four Corners", objectivesID = 28, draw = {
        --[[1]]{type = "cornerRectangle", color = "Yellow", position = "xz", fromCenter = 9},
        --[[2]]{type = "cornerRectangle", color = "Blue", position = "x-z", fromCenter = 9},
        --[[3]]{type = "cornerRectangle", color = "Red", position = "-xz", fromCenter = 9},
        --[[4]]{type = "cornerRectangle", color = "Black", position = "-x-z", fromCenter = 9}}},
    {name = "(CP) Three Circles", objectivesID = 29, draw = {
        --[[1]]{type = "circleDeployment", color = "Blue", position = "z", fromCenter = 13, radius = 9},
        --[[2]]{type = "circleDeployment", color = "Black", position = "-x", fromCenter = 16, fromCenterZ = 13, radius = 9},
        --[[3]]{type = "circleDeployment", color = "Yellow", position = "x", fromCenter = 16, fromCenterZ = 13, radius = 9}}},
    {name = "No Deployment Zone", draw = {type = "none"}},
}

DeployZonesCombatPatrolGame = {
    {name = "Combat Patrol 1", draw = {
        -- Points are measured like the mission image: red (0,0) is the lower-left corner,
        -- x runs across the 30" width, y runs up the 44" height. Teal mirrors this.
        --[[1]]{type = "cornerPolyline", color = "Red", position = "bottomLeft", points = {{0, 22}, {15, 11}, {15, 0}}},
        --[[2]]{type = "cornerPolyline", color = "Teal", position = "topRight", points = {{0, 22}, {15, 11}, {15, 0}}}},
        territory = {{position = "bottomLeft", color = "Yellow", points = {{0, 22}, {30, 22}}}}},
    {name = "Combat Patrol 2", draw = {
        --[[1]]{type = "cornerPolyline", color = "Red", position = "bottomLeft", points = {{0, 16}, {30, 0}}},
        --[[2]]{type = "cornerPolyline", color = "Teal", position = "topRight", points = {{0, 16}, {30, 0}}}},
        territory = {{position = "bottomLeft", color = "Yellow", points = {{0, 22}, {30, 22}}}}},
    {name = "Combat Patrol 3", draw = {
        --[[1]]{type = "cornerPolyline", color = "Red", position = "bottomLeft", points = {{0, 11}, {14, 11}, {14, 0}}},
        --[[2]]{type = "cornerPolyline", color = "Teal", position = "topRight", points = {{0, 11}, {14, 11}, {14, 0}}}},
        territory = {{position = "bottomLeft", color = "Yellow", points = {{0, 22}, {30, 22}}}}},
    {name = "No Deployment Zone", draw = {type = "none"}},
}

DeployZonesColosseum = {
    {name = "King of the Colosseum", objectivesID = 301, draw = {
        --[[1]]{type = "line", color = "Teal", position = "-z", fromSide = 9},
        --[[2]]{type = "line", color = "Red", position = "z", fromSide = 9}}},
    {name = "No Deployment Zone", draw = {type = "none"}},
}

DeployZonesEdition11 = {
    {name = "Hammer and Anvil", draw = {
        --[[1]]{type = "line", color = "Red", position = "x", fromSide = 18},
        --[[2]]{type = "line", color = "Teal", position = "-x", fromSide = 18}}},
    {name = "Dawn of War", draw = {
        --[[1]]{type = "line", color = "Teal", position = "-z", fromSide = 12},
        --[[2]]{type = "line", color = "Red", position = "z", fromSide = 12}}},
    {name = "Sweeping Engagement", draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-z", steps = {{fromSide = 8}, {fromSide = 14}}},
        --[[2]]{type = "stepped", color = "Red", position = "z", steps = {{fromSide = 14}, {fromSide = 8}}}}},
    {name = "Search and Destroy", draw = {
        --[[1]]{type = "quarter", color = "Teal", position = "-x-z", fromCenter = 9},
        --[[2]]{type = "quarter", color = "Red", position = "xz", fromCenter = 9},
        --[[3]]{type = "circle", color = "White", fromCenter = 9}}},
    {name = "Crucible of Battle", draw = {
        --[[1]]{type = "triangle", color = "Red", position = "x"},
        --[[2]]{type = "triangle", color = "Teal", position = "-x"}}},
    {name = "Tipping Point", draw = {
        --[[1]]{type = "stepped", color = "Teal", position = "-x", steps = {{fromSide = 12}, {fromSide = 20}}},
        --[[2]]{type = "stepped", color = "Red", position = "x", steps = {{fromSide = 20}, {fromSide = 12}}}}},
    {name = "No Deployment Zone", draw = {type = "none"}},
}

DeployZonesDefault = {
    {name = "No Deployment Zone", draw = {type = "none"}},
}

DeployZonesBoardingAction = {
    {name = "No Deployment Zone", draw = {type = "none"}},
}

DeployZonesData = DeployZonesDefault
deployMode = "strikeForce"

function isValidDeployMode(mode)
    return mode == "colosseum" or mode == "combatPatrol" or mode == "combatPatrolGame" or mode == "strikeForce" or mode == "boardingAction" or mode == "edition11"
end

function setDeployZonesForSize(preserveSelected)
    -- Use Strike Force data if we have an invalid mapSizeSelected
    local sizeEntry = sizeData[mapSizeSelected] or sizeData[4]
    local sizeId = sizeEntry.id
    if sizeId == 1 then
        setDeployZonesMode("colosseum", preserveSelected)
    elseif sizeId == 2 then
        setDeployZonesMode("combatPatrol", preserveSelected)
    elseif sizeId == 4 or sizeId == 5 then
        setDeployZonesMode("strikeForce", preserveSelected)
    elseif sizeId == 6 then
        setDeployZonesMode("boardingAction", preserveSelected)
    else
        -- Default to Strike Force here as well
        setDeployZonesMode("strikeForce", preserveSelected)
    end
end

function setDeployZonesMode(mode, preserveSelected)
    local byMode = {
        colosseum = DeployZonesColosseum,
        combatPatrol = DeployZonesCombatPatrol,
        combatPatrolGame = DeployZonesCombatPatrolGame,
        strikeForce = DeployZonesStrikeForce,
        boardingAction = DeployZonesBoardingAction,
        edition11 = DeployZonesEdition11,
    }
    deployMode = mode
    DeployZonesData = byMode[mode] or DeployZonesDefault
    if preserveSelected and deploySelected and DeployZonesData[deploySelected] then
        return
    end
    deploySelected = #DeployZonesData
end

deployLineHeight = 4.2
deployLineYPos = deployLineHeight-0.1
deployCircleHeight = 2.1
deployCircleYPos = deployCircleHeight-0.1
sizeMulti = 36
-- Arrow offset/size mirror the disposition picker (dispositionArrowOffset 5.75,
-- arrow width 600, font 300) so the Deployment Zone row matches them visually.
arrowOffset = 5.75
deployPickerButtonHeight = 562.5
deployPickerButtonFontSize = 320
deployPickerArrowFontSize = 300

defaultDeployHeight=2
deployOffset = 0
-- Keep overlays visually touching the play surface without intersecting it.
-- `defaultDeployHeight` remains the fallback when the surface bounds are not
-- available (for example during a broken/partial load).
deployOverlaySurfaceEpsilon = 0.01
deploymentOverlayGUIDs = {}
deploymentCircleOverlayGUIDs = {}
nineInchOverlayGUIDs = {}
territoryOverlayGUIDs = {}

secondRowOffset= 1.2
deployHeaderBtn = {
    index = 1, label = "Deployment", click_function = "none", function_owner = self,
    position = { -menuX, 5, -0.5 }, rotation = {0, 0, 0}, height = 0, width = 6000,
    font_size = 600, color = {0, 0, 0}, font_color = {1, 1, 1}
}
-- Menu object is rotated rotY=270, so worldX = menuX - localZ. Adding 3.5 to local
-- z shifts these -3.5 in world X. Clear Table / Back to Selection read
-- deployBtn.position[3], so they follow.
deployBtn = {
    index = i, label = "", click_function = "none", function_owner = self,
    position = { 0, 5, 6.5}, rotation = {0, 0, 0}, height = deployPickerButtonHeight, width = 4500,
    font_size = deployPickerButtonFontSize, color = {1, 1, 1}, font_color = {0, 0, 0}
}
deployUpBtn = {
    index = 1, label = "->", click_function = "deployUp", function_owner = self,
    position = { arrowOffset, 5, 6.5}, rotation = {0, 0, 0}, height = deployPickerButtonHeight, width = 600,
    font_size = deployPickerArrowFontSize, color = {0, 0, 0}, font_color = {1, 1, 1}
}
deployDownBtn = {
    index = 1, label = "<-", click_function = "deployDown", function_owner = self,
    position = { -arrowOffset, 5, 6.5}, rotation = {0, 0, 0}, height = deployPickerButtonHeight, width = 600,
    font_size = deployPickerArrowFontSize, color = {0, 0, 0}, font_color = {1, 1, 1}
}
dispositionControlWorldX = 33.50
blueDispositionControlWorldZ = 12.1
redDispositionControlWorldZ = -12.1
dispositionControlWorldY = 1.0

dispositionScale = 0.4125
dispositionButtonHeight = deployPickerButtonHeight
dispositionButtonWidth = 4500
dispositionArrowHeight = 562.5
dispositionArrowWidth = 600
dispositionArrowFontSize = 300
dispositionButtonFontSize = 380
dispositionArrowOffset = 5.75
-- CLEAR TABLE flanks the Deployment Zone picker on its row (world X/Y taken from
-- deployBtn) at the world Z the old disposition button used (left, -12.1), placed
-- via positionToLocal so the alignment holds under any menu scale/rotation.
function deployFlankButtonLocal(dispositionWorldZ)
    -- Translate by the same (dx, dz) as the rest of the top-row cluster so these
    -- stay glued to the (possibly relocated) Deployment Zone picker row.
    local row = self.positionToWorld({0, deployBtn.position[2], deployBtn.position[3] - topRowDX()})
    return self.positionToLocal({row.x, row.y, dispositionWorldZ + topRowDZ()})
end

-- Mat wipe area + survivors, mirroring the map cards' own Clear/Load wipe so
-- this standalone button behaves identically (mats survive, everything else on
-- the mat is destroyed). Keep this whitelist in sync with the map cards.
matClearZoneScale = {x = 60.12, y = 73, z = 44.04}
matClearKeepGuids = {["28865a"] = true, ["4ee1f2"] = true}

-- Shown immediately during setup; hidden once the game starts.
function writeClearMatButton()
    if inGame then return end

    local pos = deployFlankButtonLocal(redDispositionControlWorldZ)
    createButtonWithBorder({
        label = "Clear Table", click_function = "clearMat", function_owner = self,
        position = {pos.x, pos.y, pos.z}, rotation = {0, 0, 0},
        height = dispositionButtonHeight, width = dispositionButtonWidth,
        font_size = dispositionButtonFontSize,
        color = {0.90, 0.35, 0.35}, font_color = {0, 0, 0},
        tooltip = "Remove everything placed on the table",
    })
end

-- Deferred wipe: destroy every object the scripting zone overlaps except the
-- mats, MapExclude-tagged objects, and this menu, then remove the zone itself.
function matClearZoneCallback(zone)
    Wait.frames(function()
        for _, obj in ipairs(zone.getObjects()) do
            if obj ~= self and not matClearKeepGuids[obj.getGUID()] and obj.getGMNotes() ~= "MapExclude" then
                obj.destruct()
            end
        end
        zone.destruct()
    end, 2)
end

function clearMat()
    applyDefaultMatTexture()
    missionSetupControlsVisible = false
    writeMenus()

    spawnObject({
        position = {x = 0, y = 26, z = 0},
        scale = matClearZoneScale,
        type = "ScriptingTrigger",
        callback_function = matClearZoneCallback,
        callback_owner = self,
    })
end

function drawDeployZone(zone)
    local drawDataZone = zone.draw
    for i, drawData in ipairs(drawDataZone) do
        if drawData.type == "arrow" then
            drawArrow(drawData)
        end
        if drawData.type == "line" then
            drawLine(drawData)
        end
        if drawData.type == "stepped" then
            drawSteps(drawData)
        end
        if drawData.type == "quarter" then
            drawQuarter(drawData)
        end
        if drawData.type == "diagonal" then
            drawDiagonal(drawData)
        end
        if drawData.type == "rectangle" then
            drawRectangle(drawData)
        end
        if drawData.type == "corner" then
            drawCorner(drawData)
        end
        if drawData.type == "triangle" then
            drawTriangle(drawData)
        end
        if drawData.type == "circle" then
            drawCircle(drawData, "deployZone")
        end
        if drawData.type == "circleInZone" then
            drawCircleInZone(drawData, "deployZone")
        end
        if drawData.type == "cornerRectangle" then
            drawCornerRectangle(drawData)
        end
        if drawData.type == "circleDeployment" then
            drawCircleDeployment(drawData)
        end
        if drawData.type == "cornerPolyline" then
            drawCornerPolyline(drawData)
        end
    end
    setDeployHeight()
end

function alignOverlayToMat(obj)
    if not obj or obj.isDestroyed() then return false end

    local surface = getObjectFromGUID(mat_GUID)
    if not surface then
        local pos = obj.getPosition()
        obj.setPosition({pos[1], defaultDeployHeight + deployOffset, pos[3]})
        return false
    end

    local surfaceBounds = surface.getBounds()
    local overlayBounds = obj.getBounds()
    if not surfaceBounds or not surfaceBounds.center or not surfaceBounds.size
        or not overlayBounds or not overlayBounds.center or not overlayBounds.size then
        local pos = obj.getPosition()
        obj.setPosition({pos[1], defaultDeployHeight + deployOffset, pos[3]})
        return false
    end

    local surfaceTop = surfaceBounds.center.y + (surfaceBounds.size.y / 2)
    local overlayBottom = overlayBounds.center.y - (overlayBounds.size.y / 2)
    local pos = obj.getPosition()
    obj.setPosition({
        pos[1],
        pos[2] + (surfaceTop + deployOffset + deployOverlaySurfaceEpsilon - overlayBottom),
        pos[3],
    })
    return true
end

function setDeployHeight()
    for _, guid in ipairs(deploymentOverlayGUIDs) do
        local found = getObjectFromGUID(guid)
        if found then
            if deploymentCircleOverlayGUIDs[guid] then
                local pos = found.getPosition()
                found.setPosition({pos[1], deployCircleYPos + deployOffset, pos[3]})
            else
                alignOverlayToMat(found)
            end
        end
    end

    -- Spawned line blocks can report stale bounds on their first frame. Re-align
    -- those once registered, but never bounds-align cloned circle meshes: their
    -- custom collider bounds do not match the visible ring and lift the circle.
    Wait.frames(function()
        for _, guid in ipairs(deploymentOverlayGUIDs) do
            local found = getObjectFromGUID(guid)
            if found and not deploymentCircleOverlayGUIDs[guid] then
                alignOverlayToMat(found)
            end
        end
    end, 2)
end

function drawRectangle(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local linePosL = {x = 0, y = deployLineYPos, z = 0}
    local lineRotL = {x = 0, y = 90, z = 0}
    local lineScaleL = {x = 5, y = deployLineHeight, z = 0.02}
    local linePosS1 = {x = 0, y = deployLineYPos, z = 0}
    local lineRotS1 = {x = 0, y = 0, z = 0}
    local lineScaleS1 = {x = 5, y = deployLineHeight, z = 0.02}
    local linePosS2 = {x = 0, y = deployLineYPos, z = 0}
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "z" or drawData.position == "-z" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end
    if drawData.wide ~= 0 then
        mapBase = drawData.wide * 2
    end

    lineScaleL.x = drawData.wide * 2
    linePosL.x = drawData.fromCenter

    lineScaleS1.x = (mapHeight/2)-drawData.fromCenter
    linePosS1.x = drawData.fromCenter + ((mapHeight/2) - drawData.fromCenter)/2
    linePosS1.z = drawData.wide

    linePosS2.x = linePosS1.x
    linePosS2.z = -linePosS1.z

    if drawData.position == "x" then
        -- default values
    end
    if drawData.position == "-x" then
            linePosL.x = - linePosL.x
            linePosS2.x = -linePosS2.x
            linePosS1.x = -linePosS1.x
    end
    if drawData.position == "z" then
        linePosL.z = linePosL.x
        linePosL.x = 0
        lineRotL.y = 0

        local tmp = linePosS1.z
        linePosS1.z = linePosS1.x
        linePosS1.x = tmp
        lineRotS1.y = 90

        linePosS2.z = linePosS1.z
        linePosS2.x = -tmp

    end
    if drawData.position == "-z" then
        linePosL.z = -linePosL.x
        linePosL.x = 0
        lineRotL.y = 0

        local tmp = linePosS1.z
        linePosS1.z = -linePosS1.x
        linePosS1.x = -tmp
        lineRotS1.y = 90

        linePosS2.z = linePosS1.z
        linePosS2.x = tmp

    end
    spawnLine(linePosL, lineRotL, lineScaleL, drawData.color, "deployZone") -- orizz
    spawnLine(linePosS1, lineRotS1, lineScaleS1, drawData.color,  "deployZone") -- vert1
    spawnLine(linePosS2, lineRotS1, lineScaleS1, drawData.color, "deployZone") -- vert2
end

function drawCorner(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local linePosL = {x = 0, y = deployLineYPos, z = 0}
    local lineRotL = {x = 0, y = 0, z = 0}
    local lineScaleL = {x = 5, y = deployLineHeight, z = 0.02}
    local linePosS1 = {x = 0, y = deployLineYPos, z = 0}
    local lineRotS1 = {x = 0, y = 90, z = 0}
    local lineScaleS1 = {x = 5, y = deployLineHeight, z = 0.02}
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "x" or drawData.position == "-x" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end
    lineScaleL.x = (mapHeight/2) + drawData.wide
    linePosL.x = (mapHeight/4)-(drawData.wide/2)
    linePosL.z = drawData.fromCenter

    lineScaleS1.x = (mapBase/2)-drawData.fromCenter
    linePosS1.z = drawData.fromCenter + lineScaleS1.x/2
    linePosS1.x = -drawData.wide

    if drawData.position == "z" then
        -- default values
    end
    if drawData.position == "-z" then
            linePosL.x = - linePosL.x
            linePosL.z = - linePosL.z

            linePosS1.z = -linePosS1.z
            linePosS1.x = -linePosS1.x
    end
    if drawData.position == "x" then -- not valid, to do
        linePosL.z = linePosL.x
        linePosL.x = 0
        lineRotL.y = 0

        local tmp = linePosS1.z
        linePosS1.z = linePosS1.x
        linePosS1.x = tmp
        lineRotS1.y = 90
    end
    if drawData.position == "-x" then-- not valid, to do
        linePosL.z = -linePosL.x
        linePosL.x = 0
        lineRotL.y = 0

        local tmp = linePosS1.z
        linePosS1.z = -linePosS1.x
        linePosS1.x = -tmp
        lineRotS1.y = 90
    end
    spawnLine(linePosL, lineRotL, lineScaleL, drawData.color, "deployZone") -- long
    spawnLine(linePosS1, lineRotS1, lineScaleS1, drawData.color,  "deployZone") -- short
end

function drawDiagonal(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local linePos = {x = 0, y = deployLineYPos, z = 0}
    local lineRot = {x = 0, y = 0, z = 0}
    local lineScale = {x = 5, y = deployLineHeight, z = 0.02}
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "x" or drawData.position == "-x" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end
    local mainDiagonal = 0
    local edgeLoss = 0
    local triBase = 0 -- triangle with hypotenuse as the needed deploy line

    local edgeAngle = 0 -- angle of the line from the given map edge
    local edgeAngleRad = 0
    local halfTriBase = 0 -- triangle with hypotenuse that is half the line lenght
    local halfTriHeight = 0 -- triangle with hypotenuse that is half the line lenght
    mainDiagonal = math.sqrt(math.pow(mapBase, 2) + math.pow(mapHeight, 2))
    edgeAngleRad = math.atan(mapBase / mapHeight)
    edgeAngle = math.deg(edgeAngleRad)
    edgeLoss = drawData.fromCenter / math.cos(edgeAngleRad)
    triBase = mapBase-edgeLoss
    local ratio = triBase / mapBase
    lineScale.x = mainDiagonal * ratio
    lineRot.y = edgeAngle
    halfTriBase = lineScale.x * math.sin(edgeAngleRad) / 2
    halfTriHeight = lineScale.x * math.cos(edgeAngleRad) / 2
    linePos.x = (mapHeight/2) - (lineScale.x/2) * math.cos(edgeAngleRad)
    linePos.z = (mapBase/2) - (lineScale.x/2) * math.sin(edgeAngleRad)
    if drawData.position == "z" then -- upper right
        -- default values
    end
    if drawData.position == "-z" then
        linePos.x = - linePos.x
        linePos.z = - linePos.z
    end
    spawnLine(linePos, lineRot, lineScale, drawData.color,  "deployZone")
end

function drawTriangle(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local linePos = {x = 0, y = deployLineYPos, z = 0}
    local lineRot = {x = 0, y = 0, z = 0}
    local lineScale = {x = 5, y = deployLineHeight, z = 0.02}
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "z" or drawData.position == "-z" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end

    local triBase = 0 -- triangle with hypotenuse as the needed deploy line
    local triHeight = 0 -- triangle with hypotenuse as the needed deploy line

    local edgeAngle = 0 -- angle of the line from the given map edge
    local edgeAngleRad = 0

    triBase = mapBase
    triHeight = mapHeight/2
    edgeAngleRad = math.atan(triBase/triHeight )
    if drawData.position == "z" or drawData.position == "-z" then
        edgeAngleRad = -edgeAngleRad
    end
    edgeAngle = math.deg(edgeAngleRad)
    lineScale.x = math.sqrt(triBase^2+triHeight^2)
    lineRot.y = edgeAngle

    if drawData.position == "x" then
        linePos.x=mapHeight/4
        linePos.z=0
    end
    if drawData.position == "-x" then
        linePos.x=-mapHeight/4
        linePos.z=0
    end
    if drawData.position == "z" then
        lineRot.y= lineRot.y-90
        linePos.x=0
        linePos.z=mapHeight/4
    end
    if drawData.position == "-z" then
        lineRot.y= lineRot.y+90
        linePos.x=0
        linePos.z=-mapHeight/4
    end
    spawnLine(linePos, lineRot, lineScale, drawData.color,  "deployZone")
end

function drawQuarter(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local linePos = {x = 0, y = deployLineYPos, z = 0}
    local lineRot = {x = 0, y = 90, z = 0}
    local lineScale = {x = 5, y = deployLineHeight, z = 0.02}
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "x" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end
    lineScale.x = (mapBase/2)-drawData.fromCenter
    linePos.z =  (lineScale.x/2) + drawData.fromCenter
    if drawData.position == "xz" then
        -- default values
    end
    if drawData.position == "x-z" or drawData.position == "-x-z" then
        linePos.z = -linePos.z
    end
    spawnLine(linePos, lineRot, lineScale, drawData.color,  "deployZone") -- short line
    lineScale.x = (mapHeight/2)-drawData.fromCenter
    linePos.z = 0
    linePos.x =  (lineScale.x/2) + drawData.fromCenter
    lineRot.y = 0
    if drawData.position == "-xz" or drawData.position == "-x-z" then
        linePos.x = -linePos.x
    end
    spawnLine(linePos, lineRot, lineScale, drawData.color, "deployZone") -- long line
end

function drawSegment(x1, z1, x2, z2, color, type)
    local dx = x2 - x1
    local dz = z2 - z1
    local length = math.sqrt(dx * dx + dz * dz)
    if length <= 0 then
        return
    end

    -- Yaw is negated vs a plain atan2(dz,dx): TTS's Y rotation is the opposite
    -- handedness to our (x,z) math, so without this diagonals come out mirrored
    -- (slope flipped) while axis-aligned segments look fine either way.
    local yaw
    if math.abs(dx) < 1e-6 then
        yaw = dz >= 0 and -90 or 90
    else
        yaw = -math.deg(math.atan(dz / dx))
        if dx < 0 then
            yaw = yaw + 180
        end
    end

    spawnLine(
        {x = (x1 + x2) / 2, y = deployLineYPos, z = (z1 + z2) / 2},
        {x = 0, y = yaw, z = 0},
        {x = length, y = deployLineHeight, z = 0.02},
        color,
        type
    )
end

function drawCornerPolyline(drawData, tag)
    local mat = getObjectFromGUID(mat_GUID)
    if not mat or not drawData.points then return end
    tag = tag or "deployZone"

    local mapWidth = mat.getScale().z * sizeMulti
    local mapHeight = mat.getScale().x * sizeMulti
    local halfWidth = mapWidth / 2
    local halfHeight = mapHeight / 2
    local pos = drawData.position or "bottomLeft"

    local function worldPoint(point)
        local fromLeft = math.min(point[1] or 0, mapWidth)
        local fromBottom = math.min(point[2] or 0, mapHeight)
        if pos == "topRight" then
            return {
                x = halfHeight - fromBottom,
                z = -halfWidth + fromLeft,
            }
        end
        return {
            x = -halfHeight + fromBottom,
            z = halfWidth - fromLeft,
        }
    end

    for i = 1, #drawData.points - 1 do
        local a = worldPoint(drawData.points[i])
        local b = worldPoint(drawData.points[i + 1])
        drawSegment(a.x, a.z, b.x, b.z, drawData.color, tag)
    end
end

function drawCircle(drawData, type)
    local originalCircle=getObjectFromGUID(Global.getVar("centerCircle_GUID"))
    local circleObj = originalCircle.clone({ position = {0, -5, 0}})
    if circleObj then
        circleObj.setLock(true)
        circleObj.interactable = false
        circleObj.use_gravity = false
        circleObj.auto_raise = false
        local blockComp = circleObj.getComponent("BoxCollider")
        if blockComp then
            blockComp.set("enabled", false)
        end
        local meshComp = circleObj.getComponent("MeshCollider")
        if meshComp then
            meshComp.set("enabled", false)
        end
        -- Colliders must be off before the teleport below, or the clone can
        -- spawn briefly overlapping terrain at the map center and get shoved
        -- upward by physics de-penetration over the next few ticks.
        circleObj.setScale({drawData.fromCenter, deployCircleHeight, drawData.fromCenter})
        circleObj.setPosition({0, deployCircleYPos, 0})
        circleObj.setColorTint(getDeploymentOverlayColor(drawData.color))
        circleObj.setGMNotes(type)
        circleObj.setName("")
        trackOverlayObject(circleObj, type)
        deploymentCircleOverlayGUIDs[circleObj.getGUID()] = true
    end
end

function drawCircleInZone(drawData, type)
    local mat = getObjectFromGUID(mat_GUID)
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "z" or drawData.position == "-z" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end
    local posX=0
    local posZ=0
    if drawData.position == "x" then
        posX=((mapHeight/2-drawData.deployFromCenter)/2)+drawData.deployFromCenter
    end
    if drawData.position == "-x" then
        posX=-((mapHeight/2-drawData.deployFromCenter)/2)+drawData.deployFromCenter
    end
    if drawData.position == "z" then
        posZ=((mapHeight/2-drawData.deployFromCenter)/2)+drawData.deployFromCenter
    end
    if drawData.position == "-z" then
        posZ=-((mapHeight/2-drawData.deployFromCenter)/2)+drawData.deployFromCenter
    end
     drawCircleNotCentered(drawData, type, posX,posZ)
end

function drawCircleNotCentered(drawData, type, centerX, centerZ)
    local originalCircle=getObjectFromGUID(Global.getVar("centerCircle_GUID"))
    local circleObj = originalCircle.clone({ position = {0, -5, 0}})
    if circleObj then
        circleObj.setLock(true)
        circleObj.interactable = false
        circleObj.use_gravity = false
        circleObj.auto_raise = false
        local blockComp = circleObj.getComponent("BoxCollider")
        if blockComp then
            blockComp.set("enabled", false)
        end
        local meshComp = circleObj.getComponent("MeshCollider")
        if meshComp then
            meshComp.set("enabled", false)
        end
        -- Colliders must be off before the teleport below, or the clone can
        -- spawn briefly overlapping terrain and get shoved upward by physics
        -- de-penetration over the next few ticks.
        circleObj.setScale({drawData.fromCenter, deployCircleHeight, drawData.fromCenter})
        circleObj.setPosition({centerX, deployCircleYPos, centerZ})
        circleObj.setColorTint(getDeploymentOverlayColor(drawData.color))
        circleObj.setGMNotes(type)
        circleObj.setName("")
        trackOverlayObject(circleObj, type)
        deploymentCircleOverlayGUIDs[circleObj.getGUID()] = true
    end
end

function drawCornerRectangle(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge

    -- Calculate rectangle dimensions to extend from center boundary to map edge
    local rectWidth = 0
    local rectHeight = 0
    local centerX = 0
    local centerZ = 0

    if drawData.position == "xz" then -- upper right (Blue)
        rectWidth = (mapHeight/2) - drawData.fromCenter
        rectHeight = (mapBase/2) - drawData.fromCenter
        centerX = drawData.fromCenter + (rectWidth/2)
        centerZ = drawData.fromCenter + (rectHeight/2)
    elseif drawData.position == "x-z" then -- lower right (Black)
        rectWidth = (mapHeight/2) - drawData.fromCenter
        rectHeight = (mapBase/2) - drawData.fromCenter
        centerX = drawData.fromCenter + (rectWidth/2)
        centerZ = -(drawData.fromCenter + (rectHeight/2))
    elseif drawData.position == "-xz" then -- upper left (Yellow)
        rectWidth = (mapHeight/2) - drawData.fromCenter
        rectHeight = (mapBase/2) - drawData.fromCenter
        centerX = -(drawData.fromCenter + (rectWidth/2))
        centerZ = drawData.fromCenter + (rectHeight/2)
    elseif drawData.position == "-x-z" then -- lower left (Red)
        rectWidth = (mapHeight/2) - drawData.fromCenter
        rectHeight = (mapBase/2) - drawData.fromCenter
        centerX = -(drawData.fromCenter + (rectWidth/2))
        centerZ = -(drawData.fromCenter + (rectHeight/2))
    end

    -- Draw the four sides of the rectangle
    -- Top edge
    spawnLine({centerX, deployLineYPos, centerZ + rectHeight/2}, {0, 0, 0}, {rectWidth, deployLineHeight, 0.02}, drawData.color, "deployZone")
    -- Bottom edge
    spawnLine({centerX, deployLineYPos, centerZ - rectHeight/2}, {0, 0, 0}, {rectWidth, deployLineHeight, 0.02}, drawData.color, "deployZone")
    -- Left edge
    spawnLine({centerX - rectWidth/2, deployLineYPos, centerZ}, {0, 90, 0}, {rectHeight, deployLineHeight, 0.02}, drawData.color, "deployZone")
    -- Right edge
    spawnLine({centerX + rectWidth/2, deployLineYPos, centerZ}, {0, 90, 0}, {rectHeight, deployLineHeight, 0.02}, drawData.color, "deployZone")
end

function drawCircleDeployment(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge

    -- Calculate circle position based on position and fromCenter distance
    local centerX = 0
    local centerZ = 0

    if drawData.position == "z" then -- top center
        centerX = 0
        centerZ = drawData.fromCenter
    elseif drawData.position == "-z" then -- bottom center
        centerX = 0
        centerZ = -drawData.fromCenter
    elseif drawData.position == "-x" then -- left side
        centerX = -drawData.fromCenter
        centerZ = -(drawData.fromCenterZ or 0)
    elseif drawData.position == "x" then -- right side
        centerX = drawData.fromCenter
        centerZ = -(drawData.fromCenterZ or 0)
    end

    -- Draw the circle using the existing circle drawing function
    local originalCircle = getObjectFromGUID(Global.getVar("centerCircle_GUID"))
    local circleObj = originalCircle.clone({ position = {0, -5, 0}})
    if circleObj then
        circleObj.setLock(true)
        circleObj.interactable = false
        circleObj.use_gravity = false
        circleObj.auto_raise = false
        local blockComp = circleObj.getComponent("BoxCollider")
        if blockComp then
            blockComp.set("enabled", false)
        end
        local meshComp = circleObj.getComponent("MeshCollider")
        if meshComp then
            meshComp.set("enabled", false)
        end
        -- Colliders must be off before the teleport below, or the clone can
        -- spawn briefly overlapping terrain and get shoved upward by physics
        -- de-penetration over the next few ticks.
        circleObj.setScale({drawData.radius, deployCircleHeight, drawData.radius})
        circleObj.setPosition({centerX, deployCircleYPos, centerZ})
        circleObj.setColorTint(getDeploymentOverlayColor(drawData.color))
        circleObj.setGMNotes("deployZone")
        circleObj.setName("")
        trackOverlayObject(circleObj, "deployZone")
        deploymentCircleOverlayGUIDs[circleObj.getGUID()] = true
    end
end

function drawSteps(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "z" or drawData.position == "-z" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end

    length = mapBase / #drawData.steps
    zPos = (mapBase / 2) - (length / 2)
    for index, step in pairs(drawData.steps) do
        local xPos = 0
        if step.fromCenter then
            xPos = step.fromCenter
        else
            xPos = (mapHeight / 2) - step.fromSide
        end
        drawLineCommon(xPos, zPos, length, false, drawData.position, drawData.color)

        zPos = zPos - (length / 2)

        if index < #drawData.steps then
            -- Also draw a line connecting this step and the next.
            nextStepFromCenter = 0
            if step.fromCenter then
                nextStepFromCenter = drawData.steps[index + 1].fromCenter
            else
                nextStepFromCenter = (mapHeight / 2) - drawData.steps[index + 1].fromSide
            end
            connectorLength = nextStepFromCenter - xPos

            connectorXPos = xPos + (connectorLength / 2)
            connectorLength = math.abs(connectorLength)

            drawLineCommon(connectorXPos, zPos, connectorLength, true, drawData.position, drawData.color)
        end

        zPos = zPos - (length / 2)
    end
end

function drawLine(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local mapBase = mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "z" or drawData.position == "-z" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end
    if drawData.fromSide then
        if drawData.fromSide ~= 0 then
            drawData.fromCenter = (mapHeight / 2) - drawData.fromSide
        end
    end
    drawLineCommon(drawData.fromCenter, 0, mapBase, false, drawData.position, drawData.color)
end

function drawLineCommon(xPos, zPos, length, rotated, position, color)
    local linePos = {x = xPos, y = deployLineYPos, z = zPos}
    local lineRot = {x = 0, y = 90, z = 0}
    if rotated then
        lineRot.y = 0
    end
    local lineScale = {x = length, y = deployLineHeight, z = 0.02}
    if position == "x" then
        -- default values
    end
    if position == "-x" then
        linePos.x = -linePos.x
    end
    if position == "z" then
        lineRot.y = 90 - lineRot.y
        local oldZ = linePos.z
        linePos.z = linePos.x
        linePos.x = oldZ
    end
    if position == "-z" then
        lineRot.y = 90 - lineRot.y
        local oldZ = linePos.z
        linePos.z = -linePos.x
        linePos.x = oldZ
    end
    spawnLine(linePos, lineRot, lineScale, color, "deployZone")
end

function drawArrow(drawData)
    local mat = getObjectFromGUID(mat_GUID)
    local linePos = {x = 0, y = deployLineYPos, z = 0}
    local lineRot = {x = 0, y = 0, z = 0}
    local lineScale = {x = 5, y = deployLineHeight, z = 0.02}
    local mapBase =  mat.getScale().z * sizeMulti --short edge
    local mapHeight = mat.getScale().x * sizeMulti --long edge
    if drawData.position == "z" or drawData.position == "-z" then
        mapBase = mat.getScale().x * sizeMulti
        mapHeight = mat.getScale().z * sizeMulti
    end
    if drawData.wide ~= 0 then
        mapBase = drawData.wide *2
    end
    local triBase = (mapBase / 2) -- triangle with hypotenuse as the needed deploy line
    local triHeight = (mapHeight / 2) - drawData.fromCenter - drawData.fromEdge -- triangle with hypotenuse as the needed deploy line
    local edgeAngle = 0 -- angle of the line from the given map edge
    local edgeAngleRad = 0
    local halfTriBase = 0 -- triangle with hypotenuse that is half the line lenght
    local halfTriHeight = 0 -- triangle with hypotenuse that is half the line lenght
    lineScale.x = math.sqrt(math.pow(triBase, 2) + math.pow(triHeight, 2))
    edgeAngleRad = math.atan(triBase / triHeight)
    edgeAngle = math.deg(edgeAngleRad)
    lineRot.y = edgeAngle
    halfTriBase = (lineScale.x / 2) * math.sin(edgeAngleRad)
    halfTriHeight = (lineScale.x  / 2 ) * math.cos(edgeAngleRad)
    linePos.x = triHeight - halfTriHeight + drawData.fromCenter
    linePos.z = -1 * (triBase - halfTriBase)
    if drawData.position == "x" then
        --default values
    end
    if drawData.position == "-x" then
        linePos.z = -linePos.z
        linePos.x = -linePos.x
    end
    if drawData.position == "z" then
        local tmp = linePos.z
        linePos.z = linePos.x
        linePos.x = -tmp
        lineRot.y = 90 + lineRot.y
    end
    if drawData.position == "-z" then
        local tmp = linePos.z
        linePos.z = -linePos.x
        linePos.x = tmp
        lineRot.y = 90 + lineRot.y
    end

    spawnLine(linePos, lineRot, lineScale, drawData.color, "deployZone")
    if drawData.position == "x" or drawData.position == "-x"  then
        linePos.z = -linePos.z
        lineRot.y = -lineRot.y
    end
    if drawData.position == "z" or drawData.position == "-z"  then
        linePos.x = -linePos.x
        lineRot.y = -lineRot.y
    end
    spawnLine(linePos, lineRot, lineScale, drawData.color, "deployZone")
end

function getDeploymentOverlayColor(color)
    if color == "Teal" then
        return {r = 0.35, g = 0.65, b = 1}
    end

    return color
end

function getOverlayGuidStore(type)
    if type == "deployZone9" then
        return nineInchOverlayGUIDs
    end
    if type == "territory" then
        return territoryOverlayGUIDs
    end

    return deploymentOverlayGUIDs
end

function trackOverlayObject(obj, type)
    if not obj then
        return
    end

    table.insert(getOverlayGuidStore(type), obj.getGUID())
end

function destroyTrackedOverlayObjects(store)
    for _, guid in ipairs(store) do
        local obj = getObjectFromGUID(guid)
        if obj then
            obj.destroy()
        end
    end
end

-- Re-apply the non-interactive overlay state spawnLine sets at spawn time.
-- Runtime collider/interactable tweaks don't reliably survive a TTS save, so
-- a line restored from an autosave/rewind can come back as a physical snag
-- ("models get stuck on it"). Re-hardening on adoption kills that symptom.
function hardenOverlayObject(obj)
    if not obj then return end
    obj.setLock(true)
    obj.interactable = false
    obj.use_gravity = false
    local blockComp = obj.getComponent("BoxCollider")
    if blockComp then
        blockComp.set("enabled", false)
    end
    local meshComp = obj.getComponent("MeshCollider")
    if meshComp then
        meshComp.set("enabled", false)
    end
end

-- Spawned overlay objects (deploy zones, 9" lines, the territory divider) are
-- saved into every autosave/rewind snapshot, but their tracking lists are not
-- (see onSave). After a reload the lists are empty while the objects still
-- exist, so the toggles can no longer find/destroy them. Re-adopt every overlay
-- by its GMNotes tag so the toggles regain control of orphaned objects.
function rebuildOverlayTracking()
    deploymentOverlayGUIDs = {}
    deploymentCircleOverlayGUIDs = {}
    nineInchOverlayGUIDs = {}
    territoryOverlayGUIDs = {}

    for _, obj in ipairs(getAllObjects()) do
        local note = obj.getGMNotes()
        if note == "deployZone" then
            table.insert(deploymentOverlayGUIDs, obj.getGUID())
            if obj.getType() == "Custom_Model" then
                deploymentCircleOverlayGUIDs[obj.getGUID()] = true
            end
            hardenOverlayObject(obj)
        elseif note == "deployZone9" then
            table.insert(nineInchOverlayGUIDs, obj.getGUID())
            hardenOverlayObject(obj)
        elseif note == "territory" then
            table.insert(territoryOverlayGUIDs, obj.getGUID())
            hardenOverlayObject(obj)
        end
    end
end

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

-- Bring the territory toggle (7e7711) back in line with what's actually on the
-- table after a reload: "showing" (2) when a divider exists, "hidden" (1)
-- otherwise. Mirrors syncIngameDeploymentButton for the deployment toggle.
-- Deferred a frame so the button object is guaranteed live when called from
-- Global onLoad (object load order isn't guaranteed).
function syncTerritoryLineButton()
    Global.setVar("interactiveButtonTerritoryLine", #territoryOverlayGUIDs > 0 and 2 or 1)
    Wait.frames(function()
        local tlButton = getObjectFromGUID("7e7711")
        if tlButton then tlButton.call("syncTerritoryLineButtonImage") end
    end, 1)
end

function spawnLine(linePos, lineRot, lineScale, color, type)
    local lineObj = spawnObject({
        type = "BlockSquare",
        position = linePos,
        rotation = lineRot,
        scale = {x = lineScale.x, y = lineScale.y * 0.5625, z = lineScale.z},
        callback_function = function(spawnedLine)
            alignOverlayToMat(spawnedLine)
        end,
    })
    if lineObj then
        lineObj.setLock(true)
        lineObj.interactable = false
        lineObj.use_gravity = false
        lineObj.setGMNotes(type)
        lineObj.setColorTint(getDeploymentOverlayColor(color))
        local blockComp = lineObj.getComponent("BoxCollider")
        if blockComp then
            blockComp.set("enabled", false)
        end
        local meshComp = lineObj.getComponent("MeshCollider")
        if meshComp then
            meshComp.set("enabled", false)
        end
        trackOverlayObject(lineObj, type)
    end
end

function destroyDeployZones()
    destroyTrackedOverlayObjects(deploymentOverlayGUIDs)
    destroyTrackedOverlayObjects(nineInchOverlayGUIDs)
    deploymentOverlayGUIDs = {}
    deploymentCircleOverlayGUIDs = {}
    nineInchOverlayGUIDs = {}
end

function placeDeploy()
    destroyDeployZones()
    local data = DeployZonesData[deploySelected]
    drawDeployZone(data)
    writeMenus()
    syncIngameDeploymentButton()
end

-- A deployment overlay was just (re)drawn, so keep the in-game toggle (8aba11)
-- in sync: "showing" (2) when a real zone is on the table, "hidden" (1) for "No
-- Deployment Zone". Without this the toggle keeps its stale value and the
-- player's first press is wasted re-syncing instead of actually hiding the zone.
function syncIngameDeploymentButton()
    Global.setVar("interactiveButtonDeploymentZones", selectedDeploymentSpawnsOverlay() and 2 or 1)
    local dzButton = getObjectFromGUID("8aba11")
    if dzButton then dzButton.call("syncDeploymentZoneButtonImage") end
end

function deployUp()
    deployUpDown(true)
end

function deployDown()
    deployUpDown(false)
end

function deployUpDown(upDown)
    deployOffset = 0
    objectivesOffset = 0
    deploymentPregamePlaced = true
    if DeployZonesData[deploySelected].objectivesID then
        destroyAllObjectives()
    end
    local add=1
    if not upDown then
        add=-1
    end
    deploySelected = deploySelected + add
    if deploySelected > #DeployZonesData then
        deploySelected = 1
    end
    if deploySelected < 1 then
        deploySelected = #DeployZonesData
    end
    writeMenus()
    placeDeploy()
end

-- Select+draw the deployment zone whose name matches, mirroring deployUpDown.
function selectDeployZoneByName(zoneName)
    for i, zone in ipairs(DeployZonesData) do
        if zone.name == zoneName then
            deployOffset = 0
            objectivesOffset = 0
            deploymentPregamePlaced = true
            if DeployZonesData[deploySelected] and DeployZonesData[deploySelected].objectivesID then
                destroyAllObjectives()
            end
            deploySelected = i
            writeMenus()
            placeDeploy()
            return true
        end
    end
    broadcastToAll('Map "' .. zoneName .. '" has no matching deployment zone in the current size mode.', "Yellow")
    return false
end

-- END deploy zones manager

-- ******************
-- OBJECTIVES MANAGER
-- ******************

-- 9" secondary deployment lines toggle button (teal 59decf)
local nineInchColor = {0x59/255, 0xDE/255, 0xCF/255}
nineFromDeployBtn = {
    index = 1,
    label = '9" from DZ',
    tooltip = 'Toggle 9" lines offset from current deployment lines',
    click_function = "toggleNineFromDeployment",
    function_owner = self,
    position = { -menuX, 5, menuZ + (secondRowOffset * 3) },
    rotation = {0, 0, 0},
    height = 450,
    width = 1600,
    font_size = 200,
    color = nineInchColor,
    font_color = {0, 0, 0}
}

defaultObjectivesHeight=1.0

-- PROTOTYPE: place objective markers on top of any object carrying an objective tag.
-- Each tag maps to a marker template GUID and the state that template should be set to.
--   e6b8fb: state 1 = home objective (both sides; only the rotation differs)
--   3c9b57: state 1 = central / triangle objective
--   7fd7df: state 1 = neutral (expansion) objective
objectiveSpawnY = 1.03       -- fallback height (table surface) used only if the downward raycast hits nothing
objectiveMinSurfaceY = 1.04  -- hard floor for the detected surface; markers never seat below this Y even if the raycast finds something lower (e.g. under a center ruin on some Izar maps)
objectiveTopOffset = 0.1     -- spawn lift above the detected surface (before the final seat below)
objectiveSeatClearance = 0.0 -- gap left under a seated marker; 0 = touching, bump up to avoid z-fighting
objectiveDebug = false  -- build-wide debug flag (true on --test builds); set by initGlobalRefs once Global is ready
-- rotY (optional) overrides only the Y rotation of the placed marker; the
-- model's existing X/Z tilt is preserved. Omit it to keep the template default.
-- Tag aliases (new naming convention; old names kept for backwards compatibility):
--   obj_center  == obj_central  (single central marker)
--   obj_center1 == obj_center2 == obj_triangle (triangle-group; 2 of them collapse to one)
objectiveMarkerByTag = {
    obj_central   = {guid = "3c9b57", state = 1},
    obj_center    = {guid = "3c9b57", state = 1},
    obj_triangle  = {guid = "3c9b57", state = 1},
    obj_center1   = {guid = "3c9b57", state = 1},
    obj_center2   = {guid = "3c9b57", state = 1},
    obj_neutral   = {guid = "7fd7df", state = 1},
    obj_home_blue = {guid = "e6b8fb", state = 1, rotY = 270},
    obj_home_red  = {guid = "e6b8fb", state = 1, rotY = 270},
}
-- Triangle-group tags: handled together for the 2 -> 1 central-marker collapse below.
objectiveTriangleTags = {
    obj_triangle = true,
    obj_center1  = true,
    obj_center2  = true,
}
-- Resolution priority when an object carries more than one obj_ tag: the first tag
-- in this list wins and the rest are ignored. Highest priority first:
--   obj_triangle / obj_center1 / obj_center2  (tied)
--   > obj_central / obj_center  (tied)
--   > obj_neutral
--   > obj_home_red / obj_home_blue  (tied)
objectiveTagOrder = {
    "obj_triangle", "obj_center1", "obj_center2",
    "obj_central", "obj_center",
    "obj_neutral",
    "obj_home_red", "obj_home_blue",
}

function placeObjectives()
    destroyAllObjectives()

    -- Resolve each candidate object to its first-matching objective tag.
    local triangleTargets = {}
    local placements = {}  -- {target = obj, tag = "..."}
    for _, target in ipairs(getAllObjects()) do
        if target.getGMNotes() ~= "objective" then
            for _, tag in ipairs(objectiveTagOrder) do
                if target.hasTag(tag) then
                    if objectiveTriangleTags[tag] then
                        table.insert(triangleTargets, target)
                    else
                        table.insert(placements, {target = target, tag = tag})
                    end
                    break  -- highest-priority tag wins; one marker per object
                end
            end
        end
    end

    local placed = 0

    -- Edge case: exactly two obj_triangle objects collapse to a single central
    -- marker placed at the midpoint between where the two markers would have gone.
    -- Any other count (0, 1, 3+) falls back to one marker per object.
    if #triangleTargets == 2 then
        local p1 = objectiveMarkerPosition(triangleTargets[1])
        local p2 = objectiveMarkerPosition(triangleTargets[2])
        local mx, mz = (p1.x + p2.x) / 2, (p1.z + p2.z) / 2
        local mid = {x = mx, y = objectiveSurfaceY(mx, mz), z = mz}
        local m = objectiveMarkerByTag.obj_triangle
        if objectiveDebug then
            print(string.format("[objectives] 2x obj_triangle -> single central marker at midpoint (%.2f, %.2f, %.2f)", mid.x, mid.y, mid.z))
        end
        if spawnObjectiveMarkerAt(m.guid, m.state, mid, m.rotY) then
            placed = placed + 1
        end
    else
        for _, target in ipairs(triangleTargets) do
            table.insert(placements, {target = target, tag = "obj_triangle"})
        end
    end

    for _, pl in ipairs(placements) do
        local marker = objectiveMarkerByTag[pl.tag]
        if spawnObjectiveMarkerAt(marker.guid, marker.state, objectiveMarkerPosition(pl.target), marker.rotY) then
            placed = placed + 1
        end
    end

    broadcastToAll(placed .. " objective(s) placed", {0.25, 1, 0.25})
end

-- Casts a ray straight down through (x, z) and returns the height just above the
-- highest surface there (terrain, mat, etc.), so markers sit on top of terrain of
-- any height instead of a fixed Y that buries them under taller pieces. Other
-- objective markers are ignored so a marker never stacks on one already placed.
-- Falls back to the table height if the ray hits nothing.
function objectiveSurfaceY(x, z)
    local hits = Physics.cast({
        origin = {x = x, y = 50, z = z},
        direction = {x = 0, y = -1, z = 0},
        type = 1,
        max_distance = 100,
    })
    local surfaceY = nil
    for _, hit in ipairs(hits) do
        local obj = hit.hit_object
        if not (obj and obj.getGMNotes() == "objective") then
            if surfaceY == nil or hit.point.y > surfaceY then
                surfaceY = hit.point.y
            end
        end
    end
    local surface = surfaceY or objectiveSpawnY
    if surface < objectiveMinSurfaceY then
        surface = objectiveMinSurfaceY
    end
    return surface + objectiveTopOffset
end

-- Position a marker should sit at for a given target: horizontal center of the
-- target's bounds, lifted onto whatever surface is actually there at that point.
function objectiveMarkerPosition(target)
    local b = target.getBounds()
    return {
        x = b.center.x,
        y = objectiveSurfaceY(b.center.x, b.center.z),
        z = b.center.z,
    }
end

-- Clones the template at pos, sets it to the requested state, then locks/tags
-- the resulting object. setState swaps in a different object (with its own
-- GMNotes and lock), so the final transform/lock/tag happen AFTER it settles.
function spawnObjectiveMarkerAt(templateGUID, state, pos, rotY)
    local template = getObjectFromGUID(templateGUID)
    if not template then
        broadcastToAll("Objective template (" .. templateGUID .. ") not found.", {1, 0.25, 0.25})
        return false
    end

    local copy = template.clone({position = pos})
    if not copy then
        broadcastToAll("Failed to clone objective template (" .. templateGUID .. ").", {1, 0.25, 0.25})
        return false
    end
    -- Lock the clone right away. The template is unlocked, so an unlocked clone
    -- would fall through the table during the frame waits below; worse, setState
    -- destroys-and-respawns the object, and if it's mid-fall the new object can be
    -- lost before we reposition it (this is why state-changed markers went missing).
    copy.setLock(true)

    Wait.frames(function()
        local marker = copy
        if state and marker.getStateId() ~= state then
            -- setState returns a NEW object in the target state (with its own lock
            -- and GMNotes); from here on operate only on that returned reference.
            marker = marker.setState(state)
        end
        Wait.frames(function()
            if marker == nil then
                broadcastToAll("Objective marker (template " .. templateGUID .. ") was lost during setState.", {1, 0.25, 0.25})
                return
            end
            -- Instant setPosition (not smooth): a smooth glide is async and setLock
            -- would freeze the token mid-flight. This guarantees it lands at pos.
            if rotY then
                local r = marker.getRotation()
                marker.setRotation({r.x, rotY, r.z})
            end
            marker.setPosition(pos)
            -- Seat it on the surface instead of floating: measure the marker's world
            -- bounds and drop it by the gap between its underside and the detected
            -- surface height. Deterministic -- no physics settling, no unlock/relock.
            local b = marker.getBounds()
            if b then
                local surfaceY  = pos.y - objectiveTopOffset
                local underside = b.center.y - b.size.y / 2
                local seatY     = pos.y + (surfaceY + objectiveSeatClearance - underside)
                marker.setPosition({x = pos.x, y = seatY, z = pos.z})
            end
            marker.setLock(true)
            marker.setGMNotes("objective")
            -- Pass-through but still mouse-pickable. The collider does double duty in
            -- TTS: physics blocking AND cursor raycasts (hover tooltip / right-click
            -- state menu). Disabling it kills both, so instead make it a *trigger* --
            -- triggers don't block other objects yet are still hit by the mouse ray.
            marker.use_gravity = false
            local boxCol = marker.getComponent("BoxCollider")
            if boxCol then boxCol.set("isTrigger", true) end
            local meshCol = marker.getComponent("MeshCollider")
            if meshCol then
                meshCol.set("convex", true)  -- Unity only allows convex mesh colliders to be triggers
                meshCol.set("isTrigger", true)
            end
            if objectiveDebug then
                local p = marker.getPosition()
                print(string.format("[objectives] placed %s (template %s state %s) final pos (%.2f, %.2f, %.2f)",
                    marker.getGUID(), templateGUID, tostring(state), p.x, p.y, p.z))
            end
        end, 2)
    end, 2)
    return true
end

function destroyAllObjectives()
    for i, obj in ipairs(getAllObjects()) do
        if obj.getGMNotes() == "objective" then
            obj.destroy()
        end
    end
end

-- END objectives manager


-- ************
-- GAME MANAGER
-- ************

simulation = false -- is used to test in single player
redFirstLbl = "R  e  d    p l a y e r    f i r s t\n(click to toggle)"
blueFirstLbl = "B l u e    p l a y e r    f i r s t\n(click to toggle)"
inGame = false
gameTurnCounter = nil
armyMover = ""
first = "Red"
currentTurn = "Red"

phases = {"Initiative Phase", "Activation Phase", "Morale Phase"}
currentPhase = 1
startBtn = {
    index = 1, label = "S T A R T  G A M E", click_function = "startGame", function_owner = self,
    position = {0, 5, 2.5}, rotation = {0, 0, 0}, height = 750, width = 5000,
    font_size = 500, color = {0, 0.6, 0}, font_color = {1, 1, 1}
}
startBtnDisabled = {
    index = 1, label = "S T A R T  G A M E", click_function = "startGameDisabled", function_owner = self,
    position = {0, 5, 2.5}, rotation = {0, 0, 0}, height = 750, width = 5000,
    font_size = 500, color = {0.55, 0.55, 0.55}, font_color = {0.85, 0.85, 0.85}
}
firstPlayerBtn = {
    index = 1, label = redFirstLbl, click_function = "togglePlyr", function_owner = self,
    position = {0, 5, 4.5}, rotation = {0, 0, 0}, height = 750, width = 5000,
    font_size = 300, color = {1, 0, 0}, font_color = {1, 1, 1}
}
nextPhaseLbl = "Pass\nTurn"
nextPhaseBtn = {
    index = 1, label = nextPhaseLbl, tooltip = "Left click - Next phase\nRight click - Skip to next turn", click_function = "nextPhase", function_owner = self,
    position = {0, 5, 3.5}, rotation = {0, 0, 0}, height = 1500, width = 5000,
    font_size = 600, color = {0.90, 0.30, 0.30}, font_color = {1, 1, 1}
}
position = {menuX, 5, menuZ}
notePadTxt = ""

MAP_FILTER_GUID = "369707"

function shouldShowMapSetupOverlay()
    return gameMode == "game" and not inGame and missionSetupControlsVisible == true
end

function syncMapSetupOverlay()
    local mapFilter = getObjectFromGUID(MAP_FILTER_GUID)
    if not mapFilter then return end
    if shouldShowMapSetupOverlay() then
        mapFilter.call("showFilterMenu")
    else
        mapFilter.call("hideFilterMenu")
    end
end

function writeMenus()
    self.clearButtons()
    if not sizeConfirmed then
        writeSizeMenu()
        writeDeployMenu()
    else
        if inGame == false then
            writeStartMenu()
            writeDeployMenu()
        else
            writeIngameMenu()
        end
    end
    writeClearMatButton()
    syncMapSetupOverlay()
end

menuButtonBorderThickness = 70

-- Creates a button with a border by drawing a slightly larger backing button behind it
-- (TTS buttons have no outline property). borderColor defaults to dark grey.
function createButtonWithBorder(params, borderColor)
    local border = {}
    for k, v in pairs(params) do border[k] = v end
    border.label = ""
    border.font_size = 1
    border.height = (params.height or 0) + menuButtonBorderThickness
    border.width = (params.width or 0) + menuButtonBorderThickness
    local resolvedBorderColor = borderColor or {0.1, 0.1, 0.1, 1}
    border.color = resolvedBorderColor
    border.hover_color = resolvedBorderColor
    border.press_color = resolvedBorderColor
    self.createButton(border)

    -- Raise the real button slightly in y so it renders on top of the border.
    local top = {}
    for k, v in pairs(params) do top[k] = v end
    top.position = {params.position[1], params.position[2] + 0.01, params.position[3]}
    self.createButton(top)
end

function writeStartMenu()
    if gameMode ~= "game" then return end
    createButtonWithBorder(withSetupXOffset(startBtn))
    createButtonWithBorder(withSetupXOffset(firstPlayerBtn))
end

function writeDeployPickerMenu()
    if not deploySelected or not DeployZonesData[deploySelected] then
        deploySelected = #DeployZonesData
    end
    deployBtn.label = DeployZonesData[deploySelected].name
    createButtonWithBorder(withSetupXOffset(deployBtn))
    createButtonWithBorder(withSetupXOffset(deployUpBtn))
    createButtonWithBorder(withSetupXOffset(deployDownBtn))
end

function writeDeployMenu()
    writeDeployPickerMenu()
    -- Table-texture swatches live on the Table Theme overlay (GUID 369707); no
    -- physical buttons here anymore.
    -- self.createButton(nineFromDeployBtn)
end

function writeIngameMenu()
    destroyNineInchDeployLines()

    nextPhaseBtn.color = currentTurn == "Blue" and {0.30, 0.58, 0.90} or {0.90, 0.30, 0.30}
    nextPhaseBtn.font_color = {1, 1, 1}
    nextPhaseBtn.label = phases[currentPhase].."\nNext Phase"
    if currentPhase == #phases then
        nextPhaseBtn.label = phases[currentPhase].."\nPass Turn"
    end
    -- In Onslaught the phase button rides the same top-row offset as the Start
    -- button it replaces, so it appears in the relocated top area too.
    createButtonWithBorder(withSetupXOffset(nextPhaseBtn))
end

function startGame(obj, player, alt)
    if alt then
        simulation = true
    end
    if singlesMode ~= "singles" then
        -- Count the number of players (if needed later)
        local playerList = Player.getPlayers()
        local numberOfPlayers = 0
        for i, p in ipairs(playerList) do
            numberOfPlayers = numberOfPlayers + 1
        end


        if not Player["Red"].seated or not Player["Blue"].seated then
            broadcastToAll("Must have both players seated", {1, 0, 0})
            if not simulation then
                return
            end
        end
    end

    local selectedDeployZone = DeployZonesData and DeployZonesData[deploySelected]
    if not selectedDeployZone or selectedDeployZone.name == "No Deployment Zone" then
        broadcastToAll("Cannot start: select a deployment zone first.", {1, 0, 0})
        if not simulation then
            return
        end
    end

    Global.call("recordPlayers")
    inGame = true
    hideDeploymentZonesForGameStart()
    showObjectivesForGameStart()

    -- The table-theme overlay only applies during setup; drop its panel now.
    local mapFilter = getObjectFromGUID(MAP_FILTER_GUID)
    if mapFilter then mapFilter.call("hideFilterMenu") end

    startCustomTurns()
    broadcastToAll(phases[currentPhase], "Yellow")
    resetActivationTokens()
    Notes.setNotes("")
    writeMenus()
    updateGameStateHUD()
    simulation = false
end

function startGameDisabled()
    broadcastToAll("Choose game mode first", {1, 0.75, 0})
end


-- Flip every Activation token back to "not acted". Called automatically at game
-- start and on each phase change; the manual button lives on spawnGameTools.
function resetActivationTokens()
    for _, obj in ipairs(getAllObjects()) do
        if obj.getVar("BCBtype") == "ActivationToken" then
            obj.call("resetAlredyActed")
        end
    end
end

function newRoundStarted()
    updateGameStateHUD()
end

local function counterValue(counter)
    if not counter then return 0 end
    local ok, value = pcall(function() return counter.call("getValue") end)
    if ok and value ~= nil then return tonumber(value) or 0 end
    if counter.Counter then return counter.Counter.getValue() end
    return 0
end

-- "Round R, <Color> Turn T" stamp for the turn-pass chat message. Uses the round
-- counter (ee92cf) and the active player's turn counter.
function getTurnStateLabel()
    local roundObj = getObjectFromGUID("ee92cf")
    local round = counterValue(roundObj)
    local turnCounter = (currentTurn == "Red") and redTurnCounter or blueTurnCounter
    local turnNum = counterValue(turnCounter)
    return "Round " .. round .. ", " .. currentTurn .. " Turn " .. turnNum
end

function gameNotStartedGuard()
    if inGame then return false end
    broadcastToAll("Game hasn't started!", {1, 0.5, 0})
    return true
end

local function getHudPlayerColor(player)
    if type(player) == "string" then
        return player
    end
    if type(player) == "table" and player.color then
        return player.color
    end
    return nil
end

function hudPassTurn(player)
    if gameNotStartedGuard() then return end
    local playerColor = getHudPlayerColor(player)
    passTurn(self, playerColor or currentTurn, false)
end

local function hudCanControlTurn(player, targetTurn)
    if gameNotStartedGuard() then return end
    local playerColor = getHudPlayerColor(player)
    if singlesMode ~= "singles" and playerColor and playerColor ~= targetTurn then return false end
    if currentTurn ~= targetTurn then return end
    return true
end

local function hudAdvanceIfActive(player, targetTurn)
    if not hudCanControlTurn(player, targetTurn) then return end
    nextPhase(self, currentTurn, false)
end

function hudTurnWatch1(player)
    hudAdvanceIfActive(player, "Blue")
end

function hudTurnWatch2(player)
    hudAdvanceIfActive(player, "Red")
end

local _phaseIds     = { "Ph1", "Ph2", "Ph3" }
local _phaseToId    = { [1]="Ph1", [2]="Ph2", [3]="Ph3" }

function updatePhaseHUD()
    for _, id in ipairs(_phaseIds) do
        Global.call("setHudAttribute", {id = id.."1", attr = "textColor", value = "#FFFFFF30"})
        Global.call("setHudAttribute", {id = id.."2", attr = "textColor", value = "#FFFFFF30"})
    end
    local active = _phaseToId[currentPhase]
    if active then
        local activeRow = (currentTurn == "Blue") and "1" or "2"
        Global.call("setHudAttribute", {id = active..activeRow, attr = "textColor", value = "White"})
    end
end

local function hudJumpToPhaseForTurn(player, targetTurn, idx)
    if not hudCanControlTurn(player, targetTurn) then return end
    jumpToPhase(idx)
end

function hudPhaseIniBlue(player) hudJumpToPhaseForTurn(player, "Blue", 1) end
function hudPhaseActBlue(player) hudJumpToPhaseForTurn(player, "Blue", 2) end
function hudPhaseMorBlue(player) hudJumpToPhaseForTurn(player, "Blue", 3) end

function hudPhaseIniRed(player) hudJumpToPhaseForTurn(player, "Red", 1) end
function hudPhaseActRed(player) hudJumpToPhaseForTurn(player, "Red", 2) end
function hudPhaseMorRed(player) hudJumpToPhaseForTurn(player, "Red", 3) end

function jumpToPhase(idx)
    if gameNotStartedGuard() then return end
    currentPhase = idx
    broadcastToAll(phases[currentPhase], "Yellow")
    writeMenus()
    updateGameStateHUD()
end

function updateGameStateHUD()
    local roundObj = getObjectFromGUID("ee92cf")
    local round = counterValue(roundObj)
    Global.call("setHudValue", {id = "RoundWatch", value = tostring(round)})
    updatePhaseHUD()
    if inGame then
        local blueActive = currentTurn ~= "Red"
        Global.call("setHudAttribute", {id = "ChsStpPanel1", attr = "color", value = blueActive and "#2E86FFF8" or "#0B255C28"})
        Global.call("setHudAttribute", {id = "ChsStpPanel2", attr = "color", value = blueActive and "#4A101028" or "#FF3737F8"})
        Global.call("setHudAttribute", {id = "ChsStpPanel1", attr = "outline", value = blueActive and "#FFFFFF" or "#5B8FDECC"})
        Global.call("setHudAttribute", {id = "ChsStpPanel1", attr = "outlineSize", value = blueActive and "6" or "1"})
        Global.call("setHudAttribute", {id = "ChsStpPanel2", attr = "outline", value = blueActive and "#D46060CC" or "#FFFFFF"})
        Global.call("setHudAttribute", {id = "ChsStpPanel2", attr = "outlineSize", value = blueActive and "1" or "6"})
    else
        Global.call("setHudAttribute", {id = "ChsStpPanel1", attr = "color", value = "#1A5FC8E6"})
        Global.call("setHudAttribute", {id = "ChsStpPanel2", attr = "color", value = "#B52020E6"})
        Global.call("setHudAttribute", {id = "ChsStpPanel1", attr = "outline", value = "#5B8FDECC"})
        Global.call("setHudAttribute", {id = "ChsStpPanel1", attr = "outlineSize", value = "2"})
        Global.call("setHudAttribute", {id = "ChsStpPanel2", attr = "outline", value = "#D46060CC"})
        Global.call("setHudAttribute", {id = "ChsStpPanel2", attr = "outlineSize", value = "2"})
    end
end

function nextPhase(obj, player_color_click, alt_click)
    resetActivationTokens()
    if alt_click then
        passTurn(obj, player_color_click, alt_click)
        return
    end
    currentPhase = currentPhase + 1
    if currentPhase > #phases then
        currentPhase = 1
        passTurn(obj, player_color_click, alt_click)
    end
    broadcastToAll(phases[currentPhase], "Yellow")
    writeMenus()
    updateGameStateHUD()
end

function passTurn(obj, player_color_click, alt_click)
    if(singlesMode != "singles") then
        if player_color_click ~= currentTurn then
            if simulation then
                broadcastToAll("INTRUDER", "Pink")
            else
                return
            end
        end
    end

    currentPhase = 1
    if currentTurn == "Red" then
        currentTurn = "Blue"
        blueTurnCounter.call("increaseSelf")
    else
        currentTurn = "Red"
        redTurnCounter.call("increaseSelf")
    end

    updateGameStateHUD()

    -- QoL: the chess clock follows the turn. If it was running for the player
    -- who just finished, switch it to the new active player; paused or
    -- never-started clocks are left alone (see SyncClockToTurn in chessClock).
    local chessClock = getObjectFromGUID(Global.getVar("chessClock_GUID") or "")
    if chessClock then
        chessClock.call("SyncClockToTurn", {color = currentTurn})
    end

    printToAll(getTurnStateLabel(), "Yellow")
    broadcastToAll("It's " .. currentTurn .. " Player's turn", currentTurn)
    writeMenus()
end


function startCustomTurns()
    if first == "Red" then
        currentTurn = "Blue" -- it has to be the opposite
    else
        currentTurn = "Red"
    end
    passTurn(self, currentTurn, false)
end

function togglePlyr()
    self.clearButtons()
    if first == "Red" then
        firstPlayerBtn.label = blueFirstLbl
        firstPlayerBtn.color = {0, 0, 1}
        first = "Blue"
    else
        firstPlayerBtn.label = redFirstLbl
        firstPlayerBtn.color = {1, 0, 0}
        first = "Red"
    end
    writeMenus()
end

function hideDeploymentZonesForGameStart()
    Global.setVar("interactiveButtonDeploymentZones", 1)
    destroyDeployZones()

    local button = getObjectFromGUID("8aba11")
    if button then
        button.call("syncDeploymentZoneButtonImage")
    end
end

function showObjectivesForGameStart()
    local button = getObjectFromGUID("15d652")
    if button then
        button.call("turnObjectivesOn")
    else
        broadcastToAll("Could not turn objectives on: Show Objectives button not found.", {1, 0.25, 0.25})
    end
end

function showHideIngameDeployment()
    local state = Global.getVar("interactiveButtonDeploymentZones")
    if state == 1 then -- place
        Global.setVar("interactiveButtonDeploymentZones", 2)
        if selectedDeploymentSpawnsOverlay() then
            drawDeployZone(DeployZonesData[deploySelected])
        end
    else -- recall
        Global.setVar("interactiveButtonDeploymentZones", 1)
        if selectedDeploymentSpawnsOverlay() then
            destroyDeployZones()
        end
    end
end

-- Territory divider line (toggle + helpers)
-- The territory divider is the single centre line that splits the battlefield
-- into each player's half. Its orientation is derived from the currently
-- selected deployment zone so it always matches the chosen mission.
territoryLineColor = "Yellow"

function showHideTerritoryLine()
    local state = Global.getVar("interactiveButtonTerritoryLine")
    if state == 1 then -- place
        Global.setVar("interactiveButtonTerritoryLine", 2)
        drawTerritoryLine()
    else -- recall
        Global.setVar("interactiveButtonTerritoryLine", 1)
        destroyTerritoryLine()
    end
end

function destroyTerritoryLine()
    destroyTrackedOverlayObjects(territoryOverlayGUIDs)
    territoryOverlayGUIDs = {}
end

-- Returns the first non-circle draw spec of the selected deployment, which
-- carries the type/position the divider orientation is derived from.
function territoryReferenceEntry(zone)
    if not zone or not zone.draw then return nil end
    if zone.draw.type == "none" then return nil end
    for _, d in ipairs(zone.draw) do
        if d.type ~= "circle" and d.type ~= "circleInZone" and d.type ~= "circleDeployment" then
            return d
        end
    end
    return zone.draw[1]
end

-- Distance of a stepped DZ's boundary from the table centre, for one step.
-- `halfEdge` is the half-length of the edge the `fromSide` value is measured from.
function stepBoundaryFromCentre(step, halfEdge)
    if step.fromCenter then
        return step.fromCenter
    end
    return halfEdge - (step.fromSide or 0)
end

-- Length of a centre-crossing line at angle `thetaDeg` (0 = +X, 90 = +Z),
-- clipped to the battlefield rectangle with half-extents hx (X) and hz (Z).
function territoryChordLength(thetaDeg, hx, hz)
    local r = math.rad(thetaDeg)
    local c = math.abs(math.cos(r))
    local s = math.abs(math.sin(r))
    local tx = (c > 1e-6) and (hx / c) or math.huge
    local tz = (s > 1e-6) and (hz / s) or math.huge
    return 2 * math.min(tx, tz)
end

-- The territory divider is the line through the battlefield centre joining the
-- two perimeter points equidistant from each deployment zone. Its orientation
-- is derived from the selected DZ; the length is the chord clipped to the table.
function drawTerritoryLine()
    local mat = getObjectFromGUID(mat_GUID)
    if not mat then return end

    -- If the selected zone declares its divider explicitly, draw those specs
    -- through the same cornerPolyline path (tagged "territory") and skip the
    -- type/position derivation below. Used by the Combat Patrol zones, whose
    -- cornerPolyline shapes the derivation logic can't infer an angle from.
    local selected = selectedDeployment()
    if selected and selected.territory then
        for _, spec in ipairs(selected.territory) do
            drawCornerPolyline(spec, "territory")
        end
        for _, guid in ipairs(territoryOverlayGUIDs) do
            local found = getObjectFromGUID(guid)
            if found then alignOverlayToMat(found) end
        end
        return
    end

    local longEdge  = mat.getScale().x * sizeMulti -- along X
    local shortEdge = mat.getScale().z * sizeMulti -- along Z
    local hx = longEdge / 2
    local hz = shortEdge / 2

    local entry = territoryReferenceEntry(selectedDeployment())
    local pos = entry and entry.position or "x"
    local t   = entry and entry.type or "line"

    local theta -- rot.y in degrees: 0 = along X, 90 = along Z

    if t == "triangle" then
        -- Crucible of Battle: parallel to the DZ edges, through the centre.
        -- For 60x44 this exits the long edges 15" from centre.
        theta = math.deg(math.atan(shortEdge / (longEdge / 2)))
    elseif t == "quarter" then
        -- Search and Destroy: the main corner-to-corner diagonal.
        theta = math.deg(math.atan(shortEdge / longEdge))
    elseif t == "stepped" and entry.steps and entry.steps[2] then
        -- Sweeping Engagement / Tipping Point: join the edge midpoints between
        -- the two staggered DZ boundaries.
        -- signZ/signX carry the table's rot.y handedness so the slight tilt
        -- leans the correct way (same handedness as the Search and Destroy fix).
        if pos == "z" or pos == "-z" then
            local b1 = stepBoundaryFromCentre(entry.steps[1], hz)
            local b2 = stepBoundaryFromCentre(entry.steps[2], hz)
            local m = (b1 - b2) / 2
            local signZ = (pos == "z") and -1 or 1
            theta = math.deg(math.atan((signZ * m) / hx))
        else
            local b1 = stepBoundaryFromCentre(entry.steps[1], hx)
            local b2 = stepBoundaryFromCentre(entry.steps[2], hx)
            local m = (b1 - b2) / 2
            local signX = (pos == "x") and -1 or 1
            if math.abs(m) < 1e-6 then
                theta = 90
            else
                theta = math.deg(math.atan(hz / (signX * m)))
            end
        end
    elseif pos == "z" or pos == "-z" then
        -- Dawn of War style: divider runs along X at z = 0.
        theta = 0
    else
        -- Hammer and Anvil style (and default): divider runs along Z at x = 0.
        theta = 90
    end

    local length = territoryChordLength(theta, hx, hz)
    spawnLine({0, deployLineYPos, 0}, {0, theta, 0},
        {x = length, y = deployLineHeight, z = 0.02}, territoryLineColor, "territory")

    -- Match the lift applied to deployment overlays so it sits at table height.
    for _, guid in ipairs(territoryOverlayGUIDs) do
        local found = getObjectFromGUID(guid)
        if found then alignOverlayToMat(found) end
    end
end


-- 9" secondary deployment lines (toggle + helpers)
function destroyNineInchDeployLines()
    destroyTrackedOverlayObjects(nineInchOverlayGUIDs)
    nineInchOverlayGUIDs = {}
end

function toggleNineFromDeployment()
    -- Remove if present, else add at 9"
    if #nineInchOverlayGUIDs > 0 then
        destroyNineInchDeployLines()
        return
    end
    addNineInchDeployLines(9)
end

function addNineInchDeployLines(distance)
    for _, guid in ipairs(deploymentOverlayGUIDs) do
        local obj = getObjectFromGUID(guid)
        if obj then
            local sc = obj.getScale()
            -- Only process thin straight lines, skip circles and other shapes
            if sc.z and sc.z <= 0.05 then
                local rot = obj.getRotation()
                local pos = obj.getPosition()

                local yawRad = math.rad(rot.y)
                -- normal vector in XZ plane (perpendicular to line axis)
                local nx = math.cos(yawRad + math.rad(90))
                local nz = math.sin(yawRad + math.rad(90))
                -- point towards table center
                local cx = -pos.x
                local cz = -pos.z
                local dot = (nx * cx) + (nz * cz)
                if dot < 0 then
                    nx = -nx
                    nz = -nz
                end

                local newPos = { x = pos.x + nx * distance, y = pos.y, z = pos.z + nz * distance }
                local newRot = { x = rot.x, y = rot.y, z = rot.z }
                local newScale = { x = sc.x, y = sc.y, z = sc.z }
                spawnLine(newPos, newRot, newScale, nineInchColor, "deployZone9")
            end
        end
    end
end


function recallAll()
    destroyAllObjectives()
    destroyDeployZones()
end

function none()
end
