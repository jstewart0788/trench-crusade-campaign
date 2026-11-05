--"LuaScript":\s*"(?:\\.|[^\\"])*"

--[[ Lua code. See documentation: https://api.tabletopsimulator.com/ --]]

-- Having all these GUIDs centrally managed helps to ensure that any changes to
-- them only need to be made in one place, and hard-to-find stuff isn't inadvertently
-- broken.
--
-- If you're looking at this and thinking "surely this should be a table" - why,
-- yes it should. Unfortunately, I saw the documentation for Object.getVar said
-- "Cannot return a table", and missed that Object.getTable existed, and now I'm
-- too lazy to change it all again.
centerCircle_GUID = "51ee2f"
quarterCircle_GUID = "51ee3f"
startMenu_GUID = "738804"
redDiceMat_GUID = "acae21" -- diceTable
blueDiceMat_GUID = "839fcc" -- diceTable
chessClock_GUID = "f4ee71"

RedSelectionHighlighter = "27de4f"
BlueSelectionHighlighter = "84c3a4"

HUD_PANEL_PREFIXES = {"RedHud_", "BlueHud_", "GreyHud_"}

function setHudAttribute(params)
    if not params or not params.id or not params.attr then return end
    for _, prefix in ipairs(HUD_PANEL_PREFIXES) do
        pcall(function()
            Global.UI.setAttribute(prefix .. params.id, params.attr, params.value)
        end)
    end
end

function setHudValue(params)
    if not params or not params.id then return end
    for _, prefix in ipairs(HUD_PANEL_PREFIXES) do
        pcall(function()
            local uiId = prefix .. params.id
            Global.UI.setValue(uiId, params.value)
            Global.UI.setAttribute(uiId, "text", params.value)
        end)
    end
end

playerHudSettings = {
    Red = {helpOverlayOpen = false, clockHidden = false, hudVisible = true, scale = "Medium"},
    Blue = {helpOverlayOpen = false, clockHidden = false, hudVisible = true, scale = "Medium"},
    Grey = {helpOverlayOpen = false, clockHidden = false, hudVisible = true, scale = "Medium"},
}

function getDefaultHudSettings()
    return {helpOverlayOpen = false, clockHidden = false, hudVisible = true, scale = "Medium"}
end

function ensureHudSettings(color)
    if color ~= "Red" and color ~= "Blue" and color ~= "Grey" then
        color = "Blue"
    end
    if not playerHudSettings then
        playerHudSettings = {}
    end
    if not playerHudSettings[color] then
        playerHudSettings[color] = getDefaultHudSettings()
    end
    local defaults = getDefaultHudSettings()
    for key, value in pairs(defaults) do
        if playerHudSettings[color][key] == nil then
            playerHudSettings[color][key] = value
        end
    end
    return playerHudSettings[color]
end

function getHudColorFromCallback(player, id)
    if id then
        local fromId = string.match(id, "^(Red)Hud_") or string.match(id, "^(Blue)Hud_") or string.match(id, "^(Grey)Hud_")
        if fromId then
            return fromId
        end
    end
    if type(player) == "table" and player.color then
        if player.color == "Red" or player.color == "Blue" or player.color == "Grey" then
            return player.color
        end
    elseif player == "Red" or player == "Blue" or player == "Grey" then
        return player
    end
    return "Blue"
end

function setHudAttributeForColor(color, params)
    if not params or not params.id or not params.attr then return end
    local prefix = color .. "Hud_"
    pcall(function()
        Global.UI.setAttribute(prefix .. params.id, params.attr, params.value)
    end)
end

-- ===== Minimalist HUD (per player, toggled by the "-" control button) =====
-- Minimalist mode hides both per-turn phase-icon strips, then resizes the panel +
-- control column to fit. Red and Blue are independent (separate panels); Grey has
-- no "-" button so it is never minimal.
hudMinimalist = hudMinimalist or {}   -- player color -> bool

-- Per-mode geometry. Minimalist drops the panel width by the phase-strip width and
-- shrinks the 3-button control column (and its font) so the glyphs still fit. width/height are visual estimates — tune in-game.
local HUD_FULL = { width = "1200", height = "155", mainWidth = "1144", mainHeight = "155", controlsH = "143", btnFont = "28", shown = "true"  }
local HUD_MIN  = { width = "804",  height = "155", mainWidth = "804",  mainHeight = "155", controlsH = "143", btnFont = "24", shown = "false" }

-- The clock readout + its steppers and play/pause buttons (same id set the
-- clock-hide toggle uses).
local HUD_CLOCK_IDS = {"ClockSubPanel1", "ClockSubPanel2", "ChsStpPlus1", "ChsStpMinus1", "ChsStpPlus2", "ChsStpMinus2", "ChsStpPlay1", "ChsStpPause1", "ChsStpPlay2", "ChsStpPause2"}

function applyMinimalistForColor(color)
    if color ~= "Red" and color ~= "Blue" then return end
    local minimal = hudMinimalist[color]
    local d = minimal and HUD_MIN or HUD_FULL
    local p = color .. "Hud_"
    -- Minimalist always hides the clock; full mode hands it back to the player's
    -- own clock toggle so we don't override a manually hidden clock.
    local clockShown = (not minimal) and (not ensureHudSettings(color).clockHidden)
    pcall(function()
        Global.UI.setAttribute(p .. "PhaseRow1", "active", d.shown)
        Global.UI.setAttribute(p .. "PhaseRow2", "active", d.shown)
        Global.UI.setAttribute(p .. "RightControls", "active", d.shown)
        for _, id in ipairs(HUD_CLOCK_IDS) do
            Global.UI.setAttribute(p .. id, "active", clockShown and "true" or "false")
        end
        Global.UI.setAttribute(p .. "VPScores",  "width",  d.width)
        Global.UI.setAttribute(p .. "VPScores",  "height", d.height)
        Global.UI.setAttribute(p .. "MainPanel", "preferredWidth",  d.mainWidth)
        Global.UI.setAttribute(p .. "MainPanel", "minWidth",        d.mainWidth)
        Global.UI.setAttribute(p .. "MainPanel", "preferredHeight", d.mainHeight)
        Global.UI.setAttribute(p .. "MainPanel", "minHeight",       d.mainHeight)
        Global.UI.setAttribute(color .. "HudControls", "preferredHeight", d.controlsH)
        for _, b in ipairs({"HelpBtn", "ClockBtn", "MinusBtn"}) do
            Global.UI.setAttribute(p .. b, "fontSize", d.btnFont)
        end
    end)
end

function hudToggleMinimalist(player, value, id)
    local color = getHudColorFromCallback(player, id)
    if color ~= "Red" and color ~= "Blue" then return end
    hudMinimalist[color] = not hudMinimalist[color]
    applyMinimalistForColor(color)
end

function applyHudPreferencesForColor(color)
    local settings = ensureHudSettings(color)
    local helpOverlayActive = settings.helpOverlayOpen and "true" or "false"
    local overlayActive = settings.hudVisible and "true" or "false"
    local clockActive = not settings.clockHidden

    setHudAttributeForColor(color, {id = "HelpOverlay", attr = "active", value = helpOverlayActive})
    setHudAttributeForColor(color, {id = "VPScores", attr = "active", value = overlayActive})
    setHudAttributeForColor(color, {id = "ClockBtn", attr = "color", value = "#FFFFFF"})

    for _, id in ipairs({"ClockSubPanel1", "ClockSubPanel2", "ChsStpPlus1", "ChsStpMinus1", "ChsStpPlus2", "ChsStpMinus2", "ChsStpPlay1", "ChsStpPause1", "ChsStpPlay2", "ChsStpPause2"}) do
        setHudAttributeForColor(color, {id = id, attr = "active", value = clockActive and "true" or "false"})
    end
end

function applyHudPreferences()
    applyHudPreferencesForColor("Red")
    applyHudPreferencesForColor("Blue")
    applyHudPreferencesForColor("Grey")
end

function hudToggleHelp(player, value, id)
    local color = getHudColorFromCallback(player, id)
    local settings = ensureHudSettings(color)
    settings.helpOverlayOpen = not settings.helpOverlayOpen
    applyHudPreferencesForColor(color)
end

function hudCloseHelp(player, value, id)
    local color = getHudColorFromCallback(player, id)
    local settings = ensureHudSettings(color)
    settings.helpOverlayOpen = false
    applyHudPreferencesForColor(color)
end

function isYellowscribeGlobalCard(element)
    if type(element) ~= "table" or type(element.attributes) ~= "table" then return false end
    local id = element.attributes.id
    return type(id) == "string" and string.match(id, "^ymc%-") ~= nil
end

function xmlElementHasCallbackGuid(element, guid)
    if type(element) ~= "table" or not guid then return false end
    if type(element.attributes) == "table" then
        for _, value in pairs(element.attributes) do
            if type(value) == "string" and string.find(value, guid .. "/", 1, true) then
                return true
            end
        end
    end
    if type(element.children) == "table" then
        for _, child in ipairs(element.children) do
            if xmlElementHasCallbackGuid(child, guid) then return true end
        end
    end
    return false
end

function removeYellowscribeGlobalCards(targetGuid)
    local ok, ui = pcall(function() return Global.UI.getXmlTable() end)
    if not ok or type(ui) ~= "table" then return end

    local filtered = {}
    local changed = false
    for _, element in ipairs(ui) do
        local remove = isYellowscribeGlobalCard(element)
        if targetGuid then
            remove = remove and xmlElementHasCallbackGuid(element, targetGuid)
        end
        if remove then
            changed = true
        else
            filtered[#filtered + 1] = element
        end
    end

    if changed then
        pcall(function() Global.UI.setXmlTable(filtered) end)
    end
end

function hudToggleClock(player, value, id)
    local color = getHudColorFromCallback(player, id)
    local settings = ensureHudSettings(color)
    settings.clockHidden = not settings.clockHidden
    applyHudPreferencesForColor(color)
end

function toggleHudOverlayForColor(params)
    local color = params and params.color or "Blue"
    if color ~= "Red" and color ~= "Blue" and color ~= "Grey" then
        color = "Blue"
    end
    local settings = ensureHudSettings(color)
    settings.hudVisible = not settings.hudVisible
    if not settings.hudVisible then
        settings.helpOverlayOpen = false
    end
    applyHudPreferencesForColor(color)
end

function hudHideOverlay(player, value, id)
    local color = getHudColorFromCallback(player, id)
    if color ~= "Red" and color ~= "Blue" and color ~= "Grey" then return end
    local settings = ensureHudSettings(color)
    settings.hudVisible = false
    settings.helpOverlayOpen = false
    applyHudPreferencesForColor(color)
end

-- ===== Custom bubble input overlay (screen space, 1-60) =====
-- Each player has their OWN panel (bubbleOverlay_Red / bubbleOverlay_Blue) with
-- fixed visibility in ftc_base_ui.xml, so one player's overlay is never shown to
-- the other and both can be open at once. Opened by the dice-mat "123" button or
-- the "Custom Bubble Size" game key; the result is applied on that player's mat.
bubbleOverlayPending = {}   -- player color -> typed string (live, from onValueChanged)
bubbleOverlayMat = {}       -- player color -> dice mat GUID to apply on
bubbleOverlayLock = {}      -- player color -> debounce flag

function diceMatForColor(color)
    if color == "Red" then return redCustomDiceMat_GUID end
    if color == "Blue" then return blueCustomDiceMat_GUID end
    return nil
end

function openBubbleInput(params)
    local color = params.color
    if color ~= "Red" and color ~= "Blue" then return end
    bubbleOverlayMat[color] = params.mat or diceMatForColor(color)
    bubbleOverlayPending[color] = nil
    Global.UI.setAttribute("bubbleInputField_" .. color, "text", "")
    Global.UI.setAttribute("bubbleOverlay_" .. color, "active", "true")
end

function cacheBubbleInput(player, value, id)
    if player then bubbleOverlayPending[player.color] = value end
end

function closeBubbleInput(color)
    Global.UI.setAttribute("bubbleOverlay_" .. color, "active", "false")
    Global.UI.setAttribute("bubbleInputField_" .. color, "text", "")
    bubbleOverlayPending[color] = nil
end

-- UI callback for the overlay's red "X" close button.
function closeBubbleOverlay(player, value, id)
    local color = player and player.color
    if color == "Red" or color == "Blue" then
        closeBubbleInput(color)
    end
end

-- Called by both Enter (InputField onEndEdit) and the OK button (onClick).
-- Pressing OK also blurs the field, so both can fire; debounce to apply once.
function submitBubbleInput(player, value, id)
    local color = player and player.color
    if color ~= "Red" and color ~= "Blue" then return end
    if bubbleOverlayLock[color] then return end
    bubbleOverlayLock[color] = true
    Wait.time(function() bubbleOverlayLock[color] = false end, 0.4)

    local matGuid = bubbleOverlayMat[color] or diceMatForColor(color)
    local mat = matGuid and getObjectFromGUID(matGuid)
    local n = tonumber(bubbleOverlayPending[color])

    -- 0 or a blank value clears the bubbles on the player's selected models.
    if not n or n <= 0 then
        if mat then mat.call("clearBubblesFromOverlay", {color = color}) end
        closeBubbleInput(color)
        return
    end

    if n > 60 then n = 60 end
    if mat then
        mat.call("applyBubbleFromOverlay", {radius = n, color = color})
    end
    closeBubbleInput(color)
end

redCustomDiceMat_GUID = "acae21" -- diceTable
blueCustomDiceMat_GUID = "839fcc" -- diceTable

redCustomDiceRoller_GUID = "17ca2b" -- kustom40kDiceRoller
blueCustomDiceRoller_GUID = "927ca1" -- kustom40kDiceRoller

redLethalHits_GUID = "7ac8ba"
blueLethalHits_GUID = "71ab21"

RedVortexGUID = "be2cdb"
BlueVortexGUID = "4b1a7b"
RedTokenCounterGUID = "42c161"
BlueTokenCounterGUID = "42c164"

redTurnCounter_GUID = "055302"
blueTurnCounter_GUID = "7e4111"
gameTurnCounter_GUID = "ee92cf"
-- Master activation/wound tracker tokens cloned by the Spawn buttons on the
-- "Spawn game tools" object (a76485).
activation_GUID = "229946"
wounds_GUID = "ad63ba"

table_GUID = "948ce5"
felt_GUID = "28865a"
mat_GUID = "4ee1f2"
matURLDisplay_GUID = "c5e288"
flexControl_GUID = "bd69bd"
tableLeg1_GUID = "afc863"
tableLeg2_GUID = "c8edca"
tableLeg3_GUID = "393bf7"
tableLeg4_GUID = "12c65e"
tableSideBottom_GUID = "f938a2"
tableSideTop_GUID = "35b95f"
tableSideLeft_GUID = "9f95fd"
tableSideRight_GUID = "5af8f2"
extractTerrain_GUID = "70b9f6"

redHandZone_GUID = "f7d85a"
blueHandZone_GUID = "731345"
redHiddenZone_GUID = "28419e"
blueHiddenZone_GUID = "e1e91a"


interactiveButtonTableQuarters_State = 1
interactiveButtonAreaDenial = 1
interactiveButtonStratReserves = 1
interactiveButtonDeploymentZones = 1
interactiveButtonTerritoryLine = 1
interactiveButtonShowObjectives = 1
interactiveButtonShowObjectivesNextClickAt = 0


teamModels = { Red = {}, Blue = {} }
Global.setTable("teamModels", teamModels)

-- Player-facing version + patch notes. The compiler rewrites these three lines
-- on every build from CHANGELOG.md; the `@@LCT_...@@` markers must stay intact.
-- Left as-is, an uncompiled / dev build simply shows "DEV".
--   GAME_VERSION : build stamp ("test" or the release version) - chat + save name
--   GAME_PATCH   : latest CHANGELOG version - shown on the splash overlay
--   GAME_CHANGELOG: latest CHANGELOG bullets - shown on the splash overlay
GAME_VERSION = "dev"   -- @@LCT_VERSION@@
GAME_PATCH = "v1.12.1"   -- @@LCT_PATCH@@
GAME_CHANGELOG = {"Forked from LCT v1.12.1 with the Warhammer 40k systems removed (missions, secondaries, CP, scoring, map caches).", "See mod/STRIP-LOG.md and mod/TESTING.md in the trenchcrusade repo."}   -- @@LCT_CHANGELOG@@
-- Build-wide debug switch. The compiler stamps this true for `--test` builds and
-- false for `--release`. Other object scripts read it with Global.getVar("DEBUG").
DEBUG = false   -- @@LCT_DEBUG@@
-- Reset during script registration; onLoad sets this true only after Global has
-- restored all state and references used by object scripts.
FTC_Global_Ready = false
turnOrder = {}
nonPlaying = {"White", "Brown","Orange","Yellow","Green","Teal","Purple","Pink"}
allowMenu = true
allowAutoSeat = true
redPlayerID = ""
bluePlayerID = ""
redDiceSpawnTime = "fast"
blueDiceSpawnTime = "fast"

-- storage for the latest edits
feedbackName    = ""
feedbackEmail   = ""
feedbackType    = ""
feedbackLike    = "Yes"
feedbackMessage = ""

-- callback for the Name field
function onNameChanged(player, newText)
    feedbackName = newText
end

-- callback for the Email field
function onEmailChanged(player, newText)
    feedbackEmail = newText
end

-- callback for the Type dropdown
function onTypeChanged(player, newValue)
    feedbackType = newValue
end

-- callback for the Like dropdown
function onLikeChanged(player, newValue)
    feedbackLike = newValue
end

-- callback for the Message field
function onMessageChanged(player, newText)
    feedbackMessage = newText
end

local monitoredID = "5c328f"  -- Original injection detector
local monitoredID2 = "899f22" -- Malicious script detected object
local warningInterval
local pollInterval
local detectedMissing = false

-- Function to check if the objects exist in the game
function checkForMonitoredID()
    local obj = getObjectFromGUID(monitoredID)
    local obj2 = getObjectFromGUID(monitoredID2)

    if obj2 ~= nil then
        -- If monitoredID2 is found, it means a malicious script was detected
        if not detectedMissing then
            detectedMissing = true
            broadcastToAll("Reminder!!! A infected object has been loaded.... please leave the game and clean all objects.", "Red")

            -- Stop further polling
            stopPolling()
        end
    elseif obj == nil then
        -- If monitoredID is missing, it means the detector was deleted, possible cheating
        if not detectedMissing then
            detectedMissing = true
            broadcastToAll("Warning: Somebody is cheating!", "Red")

            -- Start issuing warnings every 10 seconds
            warningInterval = Wait.time(function()
                broadcastToAll("Warning: Somebody is cheating!", "Red")
            end, 10, -1)

            -- Stop further polling
            stopPolling()
        end
    end
end

-- Start polling every 30 seconds
function startPolling()
    checkForMonitoredID()  -- Initial check immediately
    pollInterval = Wait.time(checkForMonitoredID, 30, -1)
end

-- Stop polling when needed
function stopPolling()
    if pollInterval ~= nil then
        Wait.stop(pollInterval)
        pollInterval = nil
    end

    if warningInterval ~= nil then
        Wait.stop(warningInterval)
        warningInterval = nil
    end
end

function onSave()
    saved_data = JSON.encode({
        svredPlayerID = redPlayerID,
        svbluePlayerID = bluePlayerID,
        svPlayerHudSettings = playerHudSettings,
        svVersion = GAME_VERSION
    })
    --saved_data = ""
    return saved_data
end

-- Bare patch number (no leading "v") for display, e.g. "v1.0.0" -> "1.0.0".
function patchNumber()
    return (tostring(GAME_PATCH):gsub("^v", ""))
end

-- Short chat banner on load. A test build announces itself; a release build
-- just states its patch. Patch notes live on the splash overlay, not chat.
function announceVersion()
    if GAME_VERSION == "test" then
        printToAll("Trench Crusade Table - TEST BUILD (LCT base " .. patchNumber() .. ")", "Yellow")
    else
        printToAll("Trench Crusade Table (dev) - LCT base " .. patchNumber(), "Yellow")
    end
end

-- Push the latest patch number + notes (injected from CHANGELOG.md) into the
-- splash intro overlay. Runs on every load so the menu always reflects the
-- build's CHANGELOG, regardless of test/release.
function updateSplashOverlay()
    Global.UI.setAttribute("SplashPatch", "text", "Patch " .. patchNumber())
    if GAME_CHANGELOG and #GAME_CHANGELOG > 0 then
        local lines = {}
        for _, note in ipairs(GAME_CHANGELOG) do
            lines[#lines + 1] = "* " .. note
        end
        Global.UI.setValue("SplashChangelogText", table.concat(lines, "\n"))
    end
end

function updateTeamModel(obj, team)
    local teamModels = Global.getTable("teamModels") or { Red = {}, Blue = {} }
    -- Remove the object's GUID from any team it might already be in.
    for _, t in ipairs({"Red", "Blue"}) do
        for i = #teamModels[t], 1, -1 do
            if teamModels[t][i] == obj.getGUID() then
                table.remove(teamModels[t], i)
            end
        end
    end
    -- Add the object to the proper team.
    table.insert(teamModels[team], obj.getGUID())
    Global.setTable("teamModels", teamModels)
end

function tagSelectedAsRed(playerColor, target)
    local objs = Player[playerColor].getSelectedObjects()
    for _, obj in ipairs(objs) do
      obj.setGMNotes("Red")
      updateTeamModel(obj, "Red")
    end
    printToColor("Tagged selected objects as Red", playerColor, "Red")
  end

  function tagSelectedAsBlue(playerColor, target)
    local objs = Player[playerColor].getSelectedObjects()
    for _, obj in ipairs(objs) do
      obj.setGMNotes("Blue")
      updateTeamModel(obj, "Blue")
    end
    printToColor("Tagged selected objects as Blue", playerColor, "Blue")
  end

function destroyObjectByGUID(guid)
    local obj = getObjectFromGUID(guid)
    if obj then
        destroyObject(obj)
    end
end

function onObjectDestroy(obj)
    if not obj or not obj.getGUID then return end
    -- Dice can never carry a yellowscribe (ymc-) card, so skip the sweep: it
    -- starts with a full Global.UI.getXmlTable() marshal, and mass dice
    -- destruction (vortex, Clear Mat, bag entry) would pay it once per die.
    if obj.tag == "Dice" then return end
    removeYellowscribeGlobalCards(obj.getGUID())
end

function onLoad(saved_data)
    --addHotkey("Tag Selected as Red", tagSelectedAsRed)
    --addHotkey("Tag Selected as Blue", tagSelectedAsBlue)
    removeYellowscribeGlobalCards()
    Turns.enable=false
    --- load vars from saved
    if saved_data ~= "" then
         local loaded_data = JSON.decode(saved_data)
         redPlayerID = loaded_data.svredPlayerID
        bluePlayerID = loaded_data.svbluePlayerID
        playerHudSettings = loaded_data.svPlayerHudSettings or playerHudSettings
        ensureHudSettings("Red")
        ensureHudSettings("Blue")
    else
        redPlayerID = ""
        bluePlayerID = ""
        ensureHudSettings("Red")
        ensureHudSettings("Blue")
    end
    ---- end loading
    -- Refresh the splash overlay from this build's CHANGELOG, and drop a short
    -- version banner in chat.
    Wait.frames(updateSplashOverlay, 1)
    Wait.time(announceVersion, 3)
    if allowMenu then
        if allowAutoSeat and redPlayerID ~= "" and bluePlayerID ~= "" then --  if the game is not started dont autoseat
                autoSeatAll()
        else
            Global.UI.setAttribute("main", "active", "true")
            local presentPersons= Player.getPlayers()
            for i, person in ipairs(presentPersons) do
                person.team="Diamonds"
            end
            presentPersons= Player.getSpectators()
            for i, person in ipairs(presentPersons) do
                person.team="Diamonds"
            end
            showHideRedBlueBtn()
        end
    else
        Global.UI.setAttribute("main", "active", "false")
    end
    applyHudPreferences()
    --startPolling()
    Wait.time(function()
        -- Vortex: raise to Y=0.6
        local redVortex = getObjectFromGUID(RedVortexGUID)
        if redVortex then
            local pos = redVortex.getPosition()
            redVortex.setPosition({pos.x, 0.6, pos.z})
        end
        local blueVortex = getObjectFromGUID(BlueVortexGUID)
        if blueVortex then
            local pos = blueVortex.getPosition()
            blueVortex.setPosition({pos.x, 0.6, pos.z})
        end

        -- Token counters: keep them tucked just inside each side's vortex.
        local redCounter = getObjectFromGUID(RedTokenCounterGUID)
        if redCounter and redVortex then
            local pos = redVortex.getPosition()
            redCounter.setPosition({pos.x - 4.52, 1.12, pos.z})
        end
        local blueCounter = getObjectFromGUID(BlueTokenCounterGUID)
	        if blueCounter and blueVortex then
	            local pos = blueVortex.getPosition()
	            blueCounter.setPosition({pos.x + 4.52, 1.12, pos.z})
	        end
	    end, 2)

    -- Shared debug panel: the DebugTools XML panel ships hidden in every build;
    -- reveal it only on --test (DEBUG) builds.
    if DEBUG == true then Global.UI.setAttribute("DebugTools", "active", "true") end

    -- Object scripts can load before Global (TTS gives no ordering guarantee, and
    -- a guest joining mid-load widens the window), so their load-time
    -- Global.getVar reads can see nil. They gate those reads on this flag via a
    -- local whenGlobalReady helper (ported from upstream comp-ftc PR #62).
    FTC_Global_Ready = true
end

-- ── SHARED DEBUG PANEL (--test builds only) ──────────────────────────────────
-- Every debug tool lives on the DebugTools screen-space XML panel (ftc_base_ui.xml),
-- hidden by default and revealed from onLoad only on DEBUG builds. The panel routes
-- its onClick/onValueChanged handlers to the functions below (Global owns the UI, so
-- no per-object script is needed). XML callbacks pass (player, value, id), so the
-- handlers take the Player object and read its .color.
-- Where the "Dump selected GUIDs" tile lands, and its name so stale dumps can be
-- cleared before spawning a fresh one (see debugDumpSelectedGuids).
GUID_DUMP_POS  = {68.0, 1.1, -78}
GUID_DUMP_NAME = "Selected GUIDs"

-- "Set mat from URL" row: cache keystrokes, apply the cached URL on demand. The
-- swap itself is owned by startMenu (it holds the map mat + reload/flag logic and
-- re-checks DEBUG). onDebugMatApply fires from both the button (onClick) and Enter
-- (onEndEdit); startMenu's setMatTextureFromUrl no-ops if the URL is unchanged.
debugMatUrlPending = ""
function cacheDebugMatUrl(player, value, id)
    debugMatUrlPending = value or ""
end
function onDebugMatApply(player, value, id)
    local menu = getObjectFromGUID(startMenu_GUID)
    if menu then menu.call("setMatTextureFromUrl", debugMatUrlPending) end
end
-- Corner button on the DebugTools panel. Instead of fully hiding the panel (which
-- can't be reopened until the next reload, since onLoad is the only place it's shown),
-- this collapses it to its title bar: the DebugToolsBody layout is deactivated and the
-- panel shrinks to header height. Clicking again restores it. Glyph/tooltip toggle too.
debugToolsMinimized = false
function minimizeDebugTools(player, value, id)
    debugToolsMinimized = not debugToolsMinimized
    if debugToolsMinimized then
        Global.UI.setAttribute("DebugToolsBody", "active", "false")
        Global.UI.setAttribute("DebugTools", "height", "84")
        Global.UI.setAttribute("DebugToolsMinBtn", "text", "+")
        Global.UI.setAttribute("DebugToolsMinBtn", "tooltip", "Restore")
    else
        Global.UI.setAttribute("DebugToolsBody", "active", "true")
        Global.UI.setAttribute("DebugTools", "height", "740")
        Global.UI.setAttribute("DebugToolsMinBtn", "text", "—")
        Global.UI.setAttribute("DebugToolsMinBtn", "tooltip", "Minimize")
    end
end

function debugPerfScanRed(player)
    local playerColor = player and player.color
    local mat = getObjectFromGUID(redCustomDiceMat_GUID)
    if not mat then printToColor("[DEBUG] Red dice mat not found.", playerColor, {1, 0.3, 0.3}); return end
    mat.call("runDiceScanBenchmark", {color = playerColor})
end

function debugPerfScanBlue(player)
    local playerColor = player and player.color
    local mat = getObjectFromGUID(blueCustomDiceMat_GUID)
    if not mat then printToColor("[DEBUG] Blue dice mat not found.", playerColor, {1, 0.3, 0.3}); return end
    mat.call("runDiceScanBenchmark", {color = playerColor})
end

function debugRngTest(player)
    local playerColor = player and player.color
    local roller = getObjectFromGUID(redCustomDiceRoller_GUID)
    if not roller then printToColor("[DEBUG] Red dice roller not found.", playerColor, {1, 0.3, 0.3}); return end
    roller.call("debugRngCheck")
end

-- Collect the GUIDs of whatever the clicking player has selected and bake them,
-- one per line, into a spawned tile's description. Chat_copy is unreliable on
-- Linux, so this gives a copyable text field instead. A previous dump is cleared
-- first so the tiles don't accumulate across clicks.
function debugDumpSelectedGuids(player)
    local playerColor = player and player.color
    local selected = player and player.getSelectedObjects() or {}
    if #selected == 0 then
        printToColor("[DEBUG] No objects selected. Select objects first, then click.", playerColor, {1, 0.3, 0.3})
        return
    end

    local guids = {}
    for _, obj in ipairs(selected) do
        guids[#guids + 1] = obj.getGUID()
    end
    local text = table.concat(guids, "\n")

    for _, o in ipairs(getAllObjects()) do
        if o.getName() == GUID_DUMP_NAME then o.destroy() end
    end

    spawnObject({
        type     = "BlockSquare",
        position = GUID_DUMP_POS,
        rotation = {0, 0, 0},
        scale    = {1.6, 0.2, 1.6},
        sound    = false,
        callback_function = function(tile)
            tile.setName(GUID_DUMP_NAME)
            tile.setDescription(text)
            tile.setColorTint({0.10, 0.18, 0.10})
            tile.setLock(true)
        end,
    })
    printToColor(string.format("[DEBUG] Dumped %d GUID(s) into the '%s' tile description.",
        #guids, GUID_DUMP_NAME), playerColor, {0.4, 1, 0.4})
end

function autoSeatPerson(_person)
    if _person.steam_id == redPlayerID then
        if Player.Red.seated then
            Player.Red.changeColor("Grey")
        end
        _person.changeColor("Red")
        _person.team="None"
        return
    end
    if _person.steam_id == bluePlayerID then
        if Player.Blue.seated then
            Player.Blue.changeColor("Grey")
        end
        _person.changeColor("Blue")
        _person.team="None"
        return
    end
    --_person.changeColor("Grey")
    _person.team="None"
end

function autoSeatGroup(persons)
    for i, person in ipairs(persons) do
        autoSeatPerson(person)
    end
end

function autoSeatAll()
    if redPlayerID=="" or bluePlayerID=="" then --  if the game is not started dont autoseat
        return
    end
    local presents = Player.getPlayers()
    autoSeatGroup(presents)
    presents = Player.getSpectators()
    autoSeatGroup(presents)
end

function recordPlayers()
    redPlayerID = Player.Red.steam_id
    bluePlayerID = Player.Blue.steam_id
end

function onPlayerChangeColor(player_color)
    promotePlayers()
    --demotePlayers()  -- RIC
    showHideRedBlueBtn()

end

function onPlayerConnect(player_id)
    if allowMenu then
        if allowAutoSeat and redPlayerID ~= "" and bluePlayerID ~= "" then --  if the game is not started dont autoseat
                autoSeatPerson(player_id)
        else
        player_id.team="Diamonds"
        end
    end
end

function promotePlayers()
    local colors={"Red", "Blue", "Orange", "Yellow", "Purple", "Teal"}
    for i, color in ipairs(colors) do
        if Player[color].seated and  Player[color].host == false and not Player[color].promoted then
            Player[color].promote()
        end
    end
end

function demotePlayers()
    for i, color in ipairs(nonPlaying) do
        if Player[color].seated  and Player[color].host == false then
            Player[color].promote(false)
        end
    end
    local spectators=Player.getSpectators()
    for i, person in ipairs(spectators) do
        if person.host == false then
            person.promote(false)
        end
    end
end

function showHideRedBlueBtn()
    if allowMenu then
        if Player.Red.seated == true then
            Global.UI.setAttribute("redBtn", "active", "false")
        else
            Global.UI.setAttribute("redBtn", "active", "true")
        end
        if Player.Blue.seated == true then
            Global.UI.setAttribute("blueBtn", "active", "false")
        else
            Global.UI.setAttribute("blueBtn", "active", "true")
        end
    end
end

function setViewForPlayer(player, color)
    if color=="Grey" then return end
    local pos= {0,0,0}
    if color == "Red" then
        pos = getObjectFromGUID(redDiceMat_GUID).getPosition()
    end
    if color == "Blue" then
        pos = getObjectFromGUID(blueDiceMat_GUID).getPosition()
    end
    player.lookAt({
        position = pos,
        pitch    = 25,
        yaw      = 180,
        distance = 20,
        })
end

function onScriptingButtonDown(index, playerColor)
    if index == 1 then
        -- If '=' is bound to scripting button 1
        local diceMat = getObjectFromGUID(redCustomDiceMat_GUID)
        diceMat.call("changeSustainedHitsThreshold", { 1 })
    elseif index == 2 then
        -- If '-' is bound to scripting button 2
        local diceMat = getObjectFromGUID(redCustomDiceMat_GUID)
        diceMat.call("changeSustainedHitsThreshold", { -1 })
    end
end

function placeToColor(player, color)
    player.changeColor(color)
    player.team="None"
    --setViewForPlayer(player, color) --bugged
end

function placeToRed(player, value, id)
    placeToColor(player, "Red")
    --player.changeColor("Red")
    --player.team="None"
end

function placeToBlue(player, value, id)
    placeToColor(player, "Blue")
    --player.changeColor("Blue")
    --player.team="None"
end
function placeToSpectator(player, value, id)
    placeToColor(player, "Grey")
end

function closeMenu(player, value, id)
    player.team="None"
end

backPosition={{0,0,0},{0,0,0},{0,0,0},{0,0,0}}
