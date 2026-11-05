-- FTC-GUID: acae21,839fcc
function none()
end
Yoffset=0.1

toolButtonBorderThickness = 70

-- TTS world buttons have no outline property, so use a larger backing button.
function createToolButtonWithBorder(params, borderColor)
    local border = {}
    for k, v in pairs(params) do border[k] = v end
    border.label = ""
    border.font_size = 1
    border.height = (params.height or 0) + toolButtonBorderThickness
    border.width = (params.width or 0) + toolButtonBorderThickness
    local resolvedBorderColor = borderColor or {0.1, 0.1, 0.1, 1}
    border.color = resolvedBorderColor
    border.hover_color = resolvedBorderColor
    border.press_color = resolvedBorderColor
    self.createButton(border)

    local top = {}
    for k, v in pairs(params) do top[k] = v end
    top.position = {params.position[1], params.position[2] + 0.01, params.position[3]}
    self.createButton(top)
end

local currentMat
if self.getPosition().z < 0 then
    currentMat="Blue"
else
    currentMat="Red"
end

local MM_TO_INCH = 0.0393701
-- Trench Crusade rolls are 2 dice plus one per +/-DICE (rulebook p15), and a
-- model carries at most 6 BLOOD MARKERS (p19), each worth -1 DICE: 2 + 6 + 2 more
-- modifiers covers every roll in the book with room to spare.
MAX_TRAY_DICE = 10
-- The dice-area margins below were measured on LCT's 3.75-scale mat; scale them
-- with the tray so a resized tray keeps the same proportions.
local function trayMarginScale()
    return self.getScale().x / 3.75
end
-- Dice are 0.7" whatever the mat's scale, so spawn spacing is kept in world
-- inches: offsets in mat units grow as the mat shrinks.
local function diceSlot(grid, col, row)
    local k = 3.75 / self.getScale().x
    return self.positionToWorld({4 - (grid*1.5 + col*0.25)*k, 0.5, -0.3 + row*0.25*k})
end
local MEASURING_RING_Y_OFFSET = 0.17
local VALID_BASE_SIZES_IN_MM = {
    {x = 25, z = 25},
    {x = 28, z = 28},
    {x = 30, z = 30},
    {x = 32, z = 32},
    {x = 40, z = 40},
    {x = 50, z = 50},
    {x = 55, z = 55},
    {x = 60, z = 60},
    {x = 65, z = 65},
    {x = 80, z = 80},
    {x = 90, z = 90},
    {x = 100, z = 100},
    {x = 130, z = 130},
    {x = 160, z = 160},
    {x = 25, z = 75},
    {x = 75, z = 25},
    {x = 35.5, z = 60},
    {x = 60, z = 35.5},
    {x = 40, z = 95},
    {x = 95, z = 40},
    {x = 52, z = 90},
    {x = 90, z = 52},
    {x = 70, z = 105},
    {x = 105, z = 70},
    {x = 92, z = 120},
    {x = 120, z = 92},
    {x = 95, z = 150},
    {x = 150, z = 95},
    {x = 109, z = 170},
    {x = 170, z = 109}
}

clearAllDiceBtn={
    label="Clear mat\n(right click)", click_function="clearDiceAll", function_owner=self,
    position={-4.6, Yoffset ,-0.87}, rotation={0,0,0}, height=50, width=400,
    font_size=60, color={0,0,0}, font_color={1,1,1}
}

rollAllBtn={
    label="Roll all dice", tooltip="Roll all dice on the mat.", click_function="RollAllDice", function_owner=self,
    position={-3.5, Yoffset ,-0.87}, rotation={0,0,0}, height=50, width=520,
    font_size=60, color={1,1,1}, font_color={0,0,0}
}

add1d6Btn={
    label="+ 1d6", click_function="spawnDice1", function_owner=self,
    tooltip="Left click: Spawns 1d6\nRight click: Quick-roll 1d6 (instant)",
    position={-0.5, Yoffset ,-0.87}, rotation={0,0,0}, height=50, width=250,
    font_size=60, color={0.7,0.7,0.7}, font_color={0,0,0}
}
add2d6Btn={
    label="+ 2d6", click_function="spawnDice2", function_owner=self,
    tooltip="Left click: Spawns 2d6\nRight click: Quick-roll 2d6 (instant)",
    position={-0.03, Yoffset ,-0.87}, rotation={0,0,0}, height=50, width=250,
    font_size=60, color={0.7,0.7,0.7}, font_color={0,0,0}
}
add3d6Btn={
    label="+ 3d6", click_function="spawnDice3", function_owner=self,
    tooltip="Left click: Spawns 3d6\nRight click: Quick-roll 3d6 (instant)",
    position={0.44, Yoffset ,-0.87}, rotation={0,0,0}, height=50, width=250,
    font_size=60, color={0.7,0.7,0.7}, font_color={0,0,0}
}
add4d6Btn={
    label="+ 4d6", click_function="spawnDice4", function_owner=self,
    tooltip="Left click: Spawns 4d6\nRight click: Quick-roll 4d6 (instant)",
    position={0.91, Yoffset ,-0.87}, rotation={0,0,0}, height=50, width=250,
    font_size=60, color={0.7,0.7,0.7}, font_color={0,0,0}
}
add1d3Btn={
    label="+ 1d3", click_function="spawnDice1d3", function_owner=self,
    tooltip="Left click: Spawns 1d3\nRight click: Quick-roll 1d3 (instant)",
    position={2.79, Yoffset ,-0.87}, rotation={0,0,0}, height=50, width=250,
    font_size=60, color={1,1,1}, font_color={0,0,0}
}

colorBtnDimension=150
colorBtnOffset=3.2
color1Btn={
    label="", click_function="modifyMenu1", function_owner=self,
    position={colorBtnOffset, Yoffset ,-0.87}, rotation={0,0,0}, height=colorBtnDimension, width=colorBtnDimension,
    font_size=60, color="Red", font_color={0,0,0}
}
color2Btn={
    label="", click_function="modifyMenu2", function_owner=self,
    position={colorBtnOffset+0.35, Yoffset ,-0.87}, rotation={0,0,0}, height=colorBtnDimension, width=colorBtnDimension,
    font_size=60, color="Blue", font_color={0,0,0}
}
color3Btn={
    label="", click_function="modifyMenu3", function_owner=self,
    position={colorBtnOffset+0.35*2, Yoffset ,-0.87}, rotation={0,0,0}, height=colorBtnDimension, width=colorBtnDimension,
    font_size=60, color="Black", font_color={0,0,0}
}
color4Btn={
    label="", click_function="modifyMenu4", function_owner=self,
    position={colorBtnOffset+0.35*3, Yoffset ,-0.87}, rotation={0,0,0}, height=colorBtnDimension, width=colorBtnDimension,
    font_size=60, color="Green", font_color={0,0,0}
}
-- Pip-colour toggle, right of the Green swatch. Click flips every
-- spawned die between white pips (Die_6_Rounded) and black pips (Die_6) through
-- setDiceType(); revertRoll() also reads pipColorBtn.color. Its .index is assigned
-- at runtime in onload (it's created last) so swapPipColor's editButton targets it.
pipColorBtn=
{
  label="White", click_function="swapPipColor", function_owner=self,
  position={colorBtnOffset + 0.35 * 4 + 0.1, Yoffset, -0.87}, rotation={0, 0, 0}, height=50, width=250,
  font_size=60, color="White", font_color="Black"
}

customDiceBtn={
    label="Custom Dice", click_function="customDice", function_owner=self,
    position={colorBtnOffset+0.35*9, Yoffset ,-0.85}, rotation={0,0,0}, height=50, width=420,
    font_size=60, color={1,1,1}, font_color={0,0,0}
}

savePositionLabel = "Save"
saveBtn={
    label=savePositionLabel, tooltip=savePositionTip, click_function="save", function_owner=self,
    position={-7.5, Yoffset ,-0.84}, rotation={0,0,0},
    width = 1300, height = 300, font_size = 150,
    color = {0.13, 0.13, 0.13, 1}, -- Black button (not pure black for smoother look)
    font_color = {1, 1, 1}, -- White text for high contrast
    hover_color = {0.2, 0.2, 0.2, 1}, -- Dark gray when hovered
    press_color = {0.27, 0.27, 0.27, 1}, -- Slightly lighter gray when pressed
    scale = {0.5, 0.5, 0.5}
}
restorePositionLabel = "Restore Position"
restoreBtn={
    label=restorePositionLabel, click_function="restore", function_owner=self,
    position={-7.5, Yoffset ,-0.50}, rotation={0,0,0},
    width = 1300, height = 300, font_size = 150,
    color = {0.13, 0.13, 0.13, 1}, -- Black button (not pure black for smoother look)
    font_color = {1, 1, 1}, -- White text for high contrast
    hover_color = {0.2, 0.2, 0.2, 1}, -- Dark gray when hovered
    press_color = {0.27, 0.27, 0.27, 1}, -- Slightly lighter gray when pressed
    scale = {0.5, 0.5, 0.5}
}

clearMeasureAllBtn={
    label='Clear Bubbles', tooltip='LEFT CLICK: Clear all measuring bubbles from the table\nRIGHT CLICK: Clear all measuring bubbles from highlighted objects only', click_function='clearMeasuringCircles', function_owner=self,
    position={-7.93, Yoffset ,-1.65}, rotation={0,0,0}, height=1000, width=4200, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

clearLinesBtn={
    label='Clear Lines', tooltip='Clear all hand-drawn lines, keep measuring bubbles', click_function='clearHandDrawnLines', function_owner=self,
    position={-7.03, Yoffset ,-1.65}, rotation={0,0,0}, height=1000, width=4200, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}


highlightBtn={
    label='Highlight', tooltip='LEFT CLICK: Highlight the selected model(s) in the swatch color (permanent)\nRIGHT CLICK: Remove ALL highlights from every object on the table', click_function='applyHighlightPaint', function_owner=self,
    position={-6.50, Yoffset ,-1.15}, rotation={0,0,0}, height=1000, width=3100, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

-- Colour swatch for the Highlight button. Its face IS the currently chosen
-- colour; clicking cycles the palette (recoloured live via refreshHighlightSwatch).
highlightSwatchBtn={
    label='', tooltip='Highlight color\nLEFT CLICK: next color\nRIGHT CLICK: previous color', click_function='cycleHighlightColor', function_owner=self,
    position={-6.02, Yoffset ,-1.15}, rotation={0,0,0}, height=1000, width=1000, scale={0.1,0.1,0.1},
    font_size=700, color={1,1,0}, font_color={0,0,0}
}

measure1Btn={
    label='1"', tooltip='Toggle 1" bubble', click_function='toggle1Bubble', function_owner=self,
    position={-8.23, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1400, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

measure2Btn={
    label='2"', tooltip='Toggle 2" bubble', click_function='toggle2Bubble', function_owner=self,
    position={-7.93, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1400, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

measure3Btn={
    label='3"', tooltip='Toggle 3" bubble', click_function='toggle3Bubble', function_owner=self,
    position={-7.63, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1400, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

measure6Btn={
    label='6"', tooltip='Toggle 6" bubble', click_function='toggle6Bubble', function_owner=self,
    position={-7.33, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1400, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

measure8Btn={
    label='8"', tooltip='Toggle 8" bubble', click_function='toggle8Bubble', function_owner=self,
    position={-7.03, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1400, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

measure9Btn={
    label='9"', tooltip='Toggle 9" bubble', click_function='toggle9Bubble', function_owner=self,
    position={-6.73, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1400, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

measure12Btn={
    label='12"', tooltip='Toggle 12" bubble', click_function='toggle12Bubble', function_owner=self,
    position={-6.41, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1600, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

measure15Btn={
    label='15"', tooltip='Toggle 15" bubble', click_function='toggle15Bubble', function_owner=self,
    position={-6.07, Yoffset ,-1.40}, rotation={0,0,0}, height=1000, width=1600, scale={0.1,0.1,0.1},
    font_size=700, color='White', font_color={0,0,0}
}

-- Custom Bubble Input BG
customBubbleInputBG = {
    label = "", click_function = "none", function_owner = self,
    position = {-5.78, Yoffset, -1.40}, rotation = {0, 0, 0},
    width = 1100, height = 1000, font_size = 100,
    color = {0.95, 0.95, 0.95, 1},
    scale = {0.1, 0.1, 0.1}
}

-- Custom Bubble Input Field
customBubbleInput = {
    label = "Size", input_function = "setCustomBubbleSize", function_owner = self,
    position = {-5.78, Yoffset, -1.40}, rotation = {0, 0, 0},
    width = 900, height = 800, font_size = 500, alignment = 3, scale = {0.1, 0.1, 0.1},
    color = {1, 1, 1, 1}, font_color = {0.2, 0.2, 0.2}
}

-- Custom Bubble Button
-- LEFT CLICK applies the size typed in the on-mat input box.
-- RIGHT CLICK (alt) opens the on-screen size overlay; 0 or a blank value there
-- clears the bubbles on the selected models.
customBubbleBtn = {
    label = "Go", tooltip = "LEFT CLICK: apply size from the box\nRIGHT CLICK: on-screen size entry (0/blank clears selected)", click_function = "applyCustomBubble", function_owner = self,
    position = {-5.58, Yoffset, -1.40}, rotation = {0, 0, 0},
    width = 800, height = 1000, font_size = 500,
    color = {0.13, 0.13, 0.13, 1}, font_color = {1, 1, 1},
    hover_color = {0.2, 0.2, 0.2, 1},
    scale = {0.1, 0.1, 0.1}
}

function save(obj, player_color, alt)
    local selected = Player[player_color].getSelectedObjects()
    if not selected or #selected == 0 then
        printToColor("Please first select a model to save its position", player_color)
        return
    end

    -- Reset and capture all selected objects in one go
    savedPositions = {}
    for _, o in ipairs(selected) do
        table.insert(savedPositions, {
            guid     = o.getGUID(),
            position = o.getPosition(),
            rotation = o.getRotation()
        })
    end

    -- Announce on screen (centre) and in chat for everyone, tinted by the saving
    -- player's seat colour (Blue for blue, Red for red, Yellow, Grey, ...).
    broadcastToAll(#savedPositions .. " objects saved", player_color)
end

function restore(playerColor)
  if not savedPositions or #savedPositions == 0 then
    broadcastToColor("No saved positions to restore.", playerColor, {1, 0.5, 0})
    return
  end

  for i, v in ipairs(savedPositions) do
    local obj = getObjectFromGUID(v.guid)
    if obj ~= nil then
      obj.setRotation(v.rotation)
      obj.setPositionSmooth(v.position, false, true)
    end
  end
end

local auto2D6 = {
    label          = "Show/Hide UI",
    tooltip="Show or hide your HUD (help, clock)",
    click_function = "toggleHudOverlay",
    function_owner = self,
    position       = {-7.5, Yoffset, 0.52},
    rotation       = { 0, 0, 0 },
    width = 1300, height = 300, font_size = 150,
    color = {0.13, 0.13, 0.13, 1}, -- Black button (not pure black for smoother look)
    font_color = {1, 1, 1}, -- White text for high contrast
    hover_color = {0.2, 0.2, 0.2, 1}, -- Dark gray when hovered
    press_color = {0.27, 0.27, 0.27, 1}, -- Slightly lighter gray when pressed
    scale = {0.5, 0.5, 0.5}
}


local revertRollBtn = {
    label          = "Revert Roll",
    tooltip="It takes 1 second after rolling to 'lock in'",
    click_function = "revertRoll",
    function_owner = self,
    position       = {-7.5, Yoffset, 0.18},
    rotation       = { 0, 0, 0 },
    width = 1300, height = 300, font_size = 150,
    color = {0.13, 0.13, 0.13, 1}, -- Black button (not pure black for smoother look)
    font_color = {1, 1, 1}, -- White text for high contrast
    hover_color = {0.2, 0.2, 0.2, 1}, -- Dark gray when hovered
    press_color = {0.27, 0.27, 0.27, 1}, -- Slightly lighter gray when pressed
    scale = {0.5, 0.5, 0.5}
}

-- Modern Black "Last 5 Rolls" Button
local customDiceSpawnButton = {
    label = "Last 5 Rolls", click_function = "callLast5Rolls", function_owner = self,
    position = {-7.5, Yoffset, -0.16}, rotation = {0, 0, 0},
    width = 1300, height = 300, font_size = 150,
    color = {0.13, 0.13, 0.13, 1},
    font_color = {1, 1, 1},
    hover_color = {0.2, 0.2, 0.2, 1},
    press_color = {0.27, 0.27, 0.27, 1},
    scale = {0.5, 0.5, 0.5}
}


selectedColor = "White"
diceType = "Die_6_Rounded"
customDiceImage = nil
scaleBtn = 0.1
previousRollData = {}
previousRollStack = {}
previousRollIndex = 0
maxPreviousRolls = 10
-- Resolved by initRoller once Global is ready (this script can load before
-- Global's onLoad has set the *_GUID variables).
rollerGUID = nil
roller = nil

-- Defer a callback until Global's onLoad has run (it sets FTC_Global_Ready
-- last). After 10s run it anyway rather than hang a broken load forever.
function whenGlobalReady(callback)
    Wait.condition(callback, function()
        return Global.getVar("FTC_Global_Ready") == true
    end, 10, callback)
end

function initRoller()
    rollerGUID = Global.getVar("redCustomDiceRoller_GUID")
    if self.guid == Global.getVar("blueCustomDiceMat_GUID") then
        rollerGUID = Global.getVar("blueCustomDiceRoller_GUID")
    end
    -- rollerGUID is nil when a click races Global's onLoad (resolveRoller calls
    -- this lazily); getObjectFromGUID(nil) would error out of the click handler.
    roller = rollerGUID and getObjectFromGUID(rollerGUID) or nil
end

function resolveRoller()
    if not roller then
        initRoller()
    end
    return roller
end

lastClickTimestamp = 0

local function nowSeconds()
    if Time and Time.time then
        return Time.time
    end
    return os.clock()
end

-- Ignore Roll All presses for 0.2 seconds after an accepted press, then coalesce
-- the accepted press for 0.1 seconds before scanning resting dice.
rollAllPending = { scheduled = false, player = nil }
local rollAllDelay = 0.1
local rollAllCooldown = 0.2
local lastRollAllTimestamp = -math.huge

local function scheduleRollAll(player)
    local currentTime = nowSeconds()
    if currentTime - lastRollAllTimestamp < rollAllCooldown then
        return
    end
    lastRollAllTimestamp = currentTime
    rollAllPending.player = player
    if rollAllPending.scheduled then
        return
    end
    rollAllPending.scheduled = true
    Wait.time(function()
        local queuedPlayer = rollAllPending.player
        rollAllPending.scheduled = false
        rollAllPending.player = nil
        if queuedPlayer then
            Player[queuedPlayer].clearSelectedObjects()
        end
        local dice = getDice()
        if #dice > 0 then
            moveDiceToRoller(queuedPlayer or player, dice)
        end
    end, rollAllDelay)
end

function storeCurrentDiceAsPreviousRoll()
    -- Build a snapshot of the current dice on the mat (positions, values, tints)
    local snapshot = {}
    for _, die in ipairs(getDice()) do
        local c = die.getCustomObject()
        local d = {
            pos  = die.getPosition(),
            rot  = die.getRotation(),
            val  = die.getValue(),
            tint = die.getColorTint(),
            customImage = nil
        }
        if c then d.customImage = c.image end
        table.insert(snapshot, d)
    end

    -- If we've undone some rolls and then store a new roll, drop any future redo history
    if previousRollIndex < #previousRollStack then
        for i = #previousRollStack, previousRollIndex + 1, -1 do
            table.remove(previousRollStack, i)
        end
    end

    table.insert(previousRollStack, snapshot)
    -- Trim stack to maximum size
    while #previousRollStack > maxPreviousRolls do
        table.remove(previousRollStack, 1)
    end
    previousRollIndex = #previousRollStack
    previousRollData = previousRollStack[previousRollIndex] or {}
end

function revertRoll(obj, player, alt)
    -- Undo one step in the previousRollStack. Use previousRollIndex to track position.
    if previousRollIndex == 0 or not previousRollStack or #previousRollStack == 0 then
        printToColor("No previous roll found.", player, "Red")
        return
    end

    local snapshot = previousRollStack[previousRollIndex]
    if not snapshot or #snapshot == 0 then
        printToColor("No previous roll data available.", player, "Red")
        return
    end

    -- Destroy current dice and spawn snapshot dice
    for _, die in ipairs(getDice()) do die.destroy() end
    for _, data in ipairs(snapshot) do
        local diceTypeToSpawn = "Die_6_Rounded"
        if data.customImage then
            diceTypeToSpawn = "Custom_Dice"
        elseif pipColorBtn.color == "Black" then
            diceTypeToSpawn = "Die_6"
        end
        local spawned = spawnObject({ type = diceTypeToSpawn, position = data.pos, rotation = data.rot })
        if data.customImage then spawned.setCustomObject({ image = data.customImage, type = 1 }) end
        spawned.setColorTint(data.tint)
        spawned.setValue(data.val)
    end

    printToColor("Reverted to roll #" .. tostring(previousRollIndex) .. " of " .. tostring(#previousRollStack), player, "Green")
    -- Move pointer back so another click reverts another step
    previousRollIndex = math.max(0, previousRollIndex - 1)
    previousRollData = previousRollStack[previousRollIndex] or {}
end

function moveDiceToRoller(color, dice)
    if #dice == 0 then return false end
    local activeRoller = resolveRoller()
    if not activeRoller then
        printToColor("Dice roller is still loading. Try again in a moment.", color, "Yellow")
        return false
    end
    activeRoller.call("setPlayerColor", { color = color })
    local rollId = activeRoller.call("beginRollBatch", {
        color = color,
        count = #dice,
    })
    if not rollId then
        printToAll("Dice roller busy: roll was not started. No dice were moved.", {1, 0.5, 0})
        return false
    end
    for _, die in ipairs(dice) do
        activeRoller.call("setLastHolder", { obj = die, color = color, rollId = rollId })
        activeRoller.putObject(die)
    end

    storeCurrentDiceAsPreviousRoll()
    return true
end

-- Evaluate a simple arithmetic expression safely (digits, + - * / and parentheses)
-- Returns number on success, or nil + error message on failure



-- Reset the last spawn position and dice count when the dice area is cleared
function callLast5Rolls(obj, player, alt)
    local r = resolveRoller()
    if r then
        r.call("printLast5Innovative")
    end
end

-- Dice on this mat: settled (resting) and not held.
function getDice()
    local dice = {}
    local b = self.getBounds()
    local left  = b.center.x - b.size.x/2
    local right = b.center.x + b.size.x/2
    local back  = b.center.z - b.size.z/2
    local front = b.center.z + b.size.z/2
    local ybot  = b.center.y - b.size.y/2
    local ytop  = b.center.y + b.size.y/2 + 3

    local k = trayMarginScale()
    if currentMat == "Red" then
        right = right - 5 * k
        back  = back  + 2.9 * k
        front = front - 0.5 * k
    else
        left  = left  + 5 * k
        back  = back  + 0.5 * k
        front = front - 2.9 * k
    end

    for _, o in ipairs(getAllObjects()) do
        if o.tag == "Dice" and o.resting and o.held_by_color == nil then
            local p = o.getPosition()
            if p.x > left and p.x < right
            and p.z > back and p.z < front
            and p.y > ybot and p.y < ytop
            then
                table.insert(dice, o)
            end
        end
    end

    return dice
end



function customDice(obj, player, alt)
    found = false
    newImage = nil
    newTint = nil

    dice = getDice()
    for _, die in ipairs(dice) do
        local image = die.getCustomObject()["image"]
        if image ~= nil then
            found = true
            newTint = die.getColorTint()
            newImage = image
            printToColor("You have set a custom die!", player, "Yellow")
            break
        else
            found = true
            newTint = die.getColorTint()
            printToColor("You have set a custom colour!", player, "Yellow")
        end
    end

    if found then
        customDiceImage = newImage
        selectedColor = newTint
        setDiceType()
    end
end

function hotkeyRollAllDice(params)
    RollAllDice(nil, params.playerColor, false)
end

-- Reached via obj.call from the "Clear Mat" hotkey. alt=true bypasses the
-- "Use right click!" guard in clearDiceAll so a single keypress clears.
function hotkeyClearMat(params)
    clearDiceAll(nil, params.playerColor, true)
end

function RollAllDice(obj, player, alt)
    scheduleRollAll(player)
end

function clearDiceAll(obj, color, alt)
    if not alt then
        printToColor("Use right click!", color, "Orange")
        return
    end
    clearDiceX(6, true, color)
end

function clearDiceX(n, deleteLower, color)
    local counter={0,0,0,0,0,0}
    local numberName={"ones", "twos", "threes", "fours", "fives", "sixes"}
    local text = Player[color].steam_name .. " deleted "
    local somethingToPrint=false
        for i, die in ipairs(getDice()) do
        if die.getValue() == n or (deleteLower and die.getValue()< n) then
            die.destroy()
            counter[die.getValue()]=counter[die.getValue()]+1
        end
    end
    for i, val in ipairs(counter) do
        if val > 0 then
            text=text.." \u{00B7} "..counter[i].." "..numberName[i]
            somethingToPrint=true
        end
    end
    if somethingToPrint then printToAll(text , "Yellow") end
end

function spawnDice1(obj, player, alt)
    spawnDice(1,player,alt)
end
function getHudOverlayColorForThisMat()
    if self.getGUID() == Global.getVar("redCustomDiceMat_GUID") then
        return "Red"
    end
    if self.getGUID() == Global.getVar("blueCustomDiceMat_GUID") then
        return "Blue"
    end
    return nil
end

function toggleHudOverlay(obj, player, alt)
    local color = getHudOverlayColorForThisMat()
    if not color then
        printToColor("Could not determine overlay owner for this dice tray.", player, "Orange")
        return
    end
    Global.call("toggleHudOverlayForColor", {color = color})
end

function spawnDice2(obj, player, alt)
    spawnDice(2,player,alt)
end
function spawnDice3(obj, player, alt)
    spawnDice(3,player,alt)
end
function spawnDice4(obj, player, alt)
    spawnDice(4,player,alt)
end
function spawnDice1d3(obj, player, alt)
    spawnD3(1, player, alt)
end

function spawnD3(n, player, alt)
    local playerDiceSpeed = player == "Red" and Global.getVar("redDiceSpawnTime") or Global.getVar("blueDiceSpawnTime")
    local currentTime = nowSeconds()
    local disableTime = (playerDiceSpeed == "slow") and 0.6 or 0.2
    if currentTime - lastClickTimestamp < disableTime then
        printToColor("Wait a bit!", player, "Yellow")
        return
    end
    lastClickTimestamp = currentTime
    local offset = #getDice()
    if offset + n > MAX_TRAY_DICE then printToColor("The tray holds " .. MAX_TRAY_DICE .. " dice.", player, "Orange") end
    local grid, row, col = 0, 0, 0
    for i = 1, offset do
        col = col + 1
        if col > 4 then col = 0; row = row + 1
            if row > 4 then row = 0; grid = grid + 1 end
        end
    end
    if offset + n > MAX_TRAY_DICE then n = MAX_TRAY_DICE - offset end
    local d3Bag = getObjectFromGUID("2d9705")
    if not d3Bag then
        printToColor("D3 bag not found!", player, "Red")
        return
    end
    local spawnedDice = {}
    for i = 1, n do
        local pos = diceSlot(grid, col, row)
        d3Bag.takeObject({
            position          = pos,
            rotation          = self.getRotation() + Vector(0.0, 180.0, 0.0),
            smooth            = false,
            callback_function = function(obj)
                if selectedColor ~= nil then obj.setColorTint(selectedColor) end
                table.insert(spawnedDice, obj)
                -- Right-click (alt) quick-rolls just like the +Nd6 buttons: set values
                -- from the roller's xoshiro stream (faces=3) without ever entering the
                -- bag. Dice arrive via async takeObject callbacks, so fire once the last
                -- one lands. Left-click stays spawn-only (press Roll All to roll).
                if alt and #spawnedDice == n then
                    quickRollSpawnedDice(player, spawnedDice, 3, "d3")
                end
            end
        })
        col = col + 1
        if col > 4 then col = 0; row = row + 1
            if row > 4 then row = 0; grid = grid + 1 end
        end
    end
end

function spawnDice(n,player,alt)
    local playerDiceSpeed = player == "Red" and Global.getVar("redDiceSpawnTime") or Global.getVar("blueDiceSpawnTime")
    local currentTime = nowSeconds()
    local disableTime = (playerDiceSpeed == "slow") and 0.6 or 0.2
    if currentTime-lastClickTimestamp<disableTime then
        printToColor("Wait a bit!", player, "Yellow")
        return
    end
    lastClickTimestamp=currentTime
    local offset=#getDice()
    if offset+n>MAX_TRAY_DICE then printToColor("The tray holds " .. MAX_TRAY_DICE .. " dice.", player, "Orange")  end
    local grid=0
    local row=0
    local col=0
    for i=1, offset do
        col=col+1
        if col>4 then
            col=0
            row= row+1
            if row > 4 then
                row=0
                grid=grid+1
            end
        end
    end

    if offset+n>MAX_TRAY_DICE then n=MAX_TRAY_DICE-offset end
    local spawnedDice = {}
    for i=1, n do
    local die=spawnObject({
        type              = diceType,
        position          = diceSlot(grid, col, row),
        rotation          = self.getRotation() + Vector(0.0, 180.0, 0.0),
        })
        col=col+1
        if col>4 then
            col=0
            row= row+1
            if row > 4 then
                row=0
                grid=grid+1
            end
        end

        if customDiceImage ~= nil then
            die.setCustomObject({
                image = customDiceImage,
                type = 1
            })
        end

        if selectedColor ~= nil then
            die.setColorTint(selectedColor)
        end
        table.insert(spawnedDice, die)
    end
    -- Left-click spawns only (press Roll All to roll through the bag). Right-click
    -- (alt) on the SMALL spawners (1d6-5d6) "quick rolls": the dice are spawned
    -- already showing values from the roller's xoshiro RNG and never enter the bag
    -- (the legacy quick-roll trick) -- instant, and immune to the bag's
    -- loop/strand/nil-faces failure modes. Gated to n<=5; +10/+25/+1d3 stay
    -- spawn-only.
    if alt and n >= 1 and n <= 5 and #spawnedDice > 0 then
        quickRollSpawnedDice(player, spawnedDice)
    end
end

-- Fixed palette for quick-roll dice: one colour is picked per quick-roll and
-- shared by every die in that roll, so consecutive quick-rolls are easy to tell
-- apart. Cosmetic only, so plain math.random is fine here (dice VALUES still use
-- the roller's xoshiro).
-- Red and blue are intentionally excluded: those are the players' main dice
-- colours, so quick-roll dice stay visually distinct from them.
-- Darker/deeper hues so the white pips on the dice contrast clearly.
local quickRollPalette = {
    {0.72, 0.38, 0.08}, -- burnt orange
    {0.68, 0.52, 0.08}, -- dark gold
    {0.16, 0.46, 0.22}, -- dark green
    {0.10, 0.42, 0.48}, -- dark teal
    {0.40, 0.20, 0.58}, -- dark purple
    {0.68, 0.18, 0.42}, -- dark magenta/pink
}
local lastQuickRollColorIndex = 0

-- Use TTS's native dice-value animation for quick rolls. On dice, setValue()
-- behaves like setRotationValue(): TTS lifts the die, smoothly rotates it to the
-- requested face, then releases it. Do not follow this with setRotation(), which
-- would cancel that animation and snap the die directly to its final face.
local function animateQuickRollDie(die, finalValue)
    if not die or die.isDestroyed() then return end
    die.setValue(finalValue)
end

-- Set already-spawned dice to values from the roller's xoshiro stream so they
-- appear instantly rolled, without ever entering the bag. Falls back to
-- math.random only if the roller object can't be reached. All dice in the roll
-- share one random palette colour.
function quickRollSpawnedDice(player, dice, faces, dieLabel)
    faces = faces or 6
    dieLabel = dieLabel or "d6"
    local vals
    if roller then
        vals = roller.call("rollFacesForQuick", { n = #dice, faces = faces })
    end
    -- Pick one palette colour for the whole roll, never repeating the previous
    -- roll's colour so batches stay visually distinct.
    local idx = math.random(#quickRollPalette)
    if #quickRollPalette > 1 and idx == lastQuickRollColorIndex then
        idx = (idx % #quickRollPalette) + 1
    end
    lastQuickRollColorIndex = idx
    local tint = quickRollPalette[idx]
    local total = 0
    for i, die in ipairs(dice) do
        local v = (vals and tonumber(vals[i])) or math.random(faces)
        die.setColorTint(tint)
        -- Custom dice are spawned with setCustomObject, which reloads the object
        -- asynchronously. Setting the value synchronously here races that reload
        -- and the value is lost when the die snaps back to its spawn orientation,
        -- so every die shows the same default face. Defer until the reload has
        -- settled, then let TTS animate the die to v natively.
        -- Plain dice don't reload, but the short defer is harmless for them.
        Wait.frames(function()
            animateQuickRollDie(die, v)
        end, 2)
        total = total + v
    end
    printToAll(Player[player].steam_name .. " quick-rolled " .. tostring(total) .. " on " .. #dice .. dieLabel, "White")
end

function getObjectsPositionToSave(player, hoveredObject)
  if #player.getSelectedObjects() != 0 then
    return player.getSelectedObjects()
  elseif hoveredObject != nil then
    return {hoveredObject}
  end
  return nil
end

function savePosition(obj)
  table.insert(savedPositions, {
    guid = obj.getGUID(),
    position = obj.getPosition(),
    rotation = obj.getRotation()
  })
end

function savePositionClicked(playerColor, hoveredObject)
    savedPositions = {}
    local objects = getObjectsPositionToSave(Player[playerColor], hoveredObject)
    if objects then
        for _, v in ipairs(objects) do
            savePosition(v)
        end
        -- Announce on screen (centre) and in chat for everyone, tinted by the
        -- saving player's seat colour (Blue for blue, Red for red, Yellow, ...).
        broadcastToAll(#objects .. " objects saved", playerColor)
    end
end

function restorePositionClicked(playerColor)
  for i,v in ipairs(savedPositions) do
    local obj = getObjectFromGUID(v.guid)
    if obj != nil then
      obj.setRotation(v.rotation)
      obj.setPositionSmooth(v.position, false, true)
    end
  end
end

function onload()
    -- addHotkey("Toggle Floating Icon", toggleFloatingIcon)

    whenGlobalReady(initRoller)

    -- TTS sorts the Options -> Game Keys list alphabetically by label (call order
    -- is ignored), so these four are prefixed 1.-4. to pin them to the top in the
    -- desired order. The numeric prefixes change the labels, which orphans any
    -- prior player bindings -- hence the "RESET ALL YOUR TTS HOTKEYS" broadcast.
    addHotkey("1. Save Position", savePositionClicked)
    addHotkey("2. Restore Position", restorePositionClicked)
    addHotkey("3. Custom Bubble", function(playerColor, _, _)
        if playerColor ~= "Red" and playerColor ~= "Blue" then return end
        local matGUID = (playerColor == "Red")
            and Global.getVar("redCustomDiceMat_GUID")
            or  Global.getVar("blueCustomDiceMat_GUID")
        Global.call("openBubbleInput", {color = playerColor, mat = matGUID})
    end)
    addHotkey("4. Roll All Dice", function(playerColor, _, _)
        local matGUID = (playerColor == "Red")
            and Global.getVar("redCustomDiceMat_GUID")
            or  Global.getVar("blueCustomDiceMat_GUID")
        local mat = getObjectFromGUID(matGUID)
        if mat then mat.call("hotkeyRollAllDice", { playerColor = playerColor }) end
    end)

    -- Remaining hotkeys; these sort alphabetically below the numbered group.
    addHotkey("Clear Bubbles", function(playerColor, _, _)
        clearMeasuringCircles(nil, playerColor, false)
    end)
    addHotkey("Clear Bubbles (Selected)", function(playerColor, _, _)
        clearMeasuringCircles(nil, playerColor, true)
    end)
    addHotkey("Clear Lines", function(playerColor, _, _)
        clearHandDrawnLines(nil, playerColor, false)
    end)
    addHotkey("Clear Mat", function(playerColor, _, _)
        if playerColor ~= "Red" and playerColor ~= "Blue" then return end
        local matGUID = (playerColor == "Red")
            and Global.getVar("redCustomDiceMat_GUID")
            or  Global.getVar("blueCustomDiceMat_GUID")
        local mat = getObjectFromGUID(matGUID)
        if mat then mat.call("hotkeyClearMat", { playerColor = playerColor }) end
    end)
    addHotkey("Show/Hide UI", function(playerColor, _, _)
        if playerColor ~= "Red" and playerColor ~= "Blue" and playerColor ~= "Grey" then return end
        Global.call("toggleHudOverlayForColor", { color = playerColor })
    end)
    addHotkey("Toggle 1 Inch Measurment Circle", function(playerColor, target)
        changeMeasurementCircle(1, target, nil, playerColor)
    end)
    addHotkey("Toggle 12 Inch Measurment Circle", function(playerColor, target)
        changeMeasurementCircle(12.01, target, nil, playerColor)
    end)
    addHotkey("Toggle 2 Inch Measurment Circle", function(playerColor, target)
        changeMeasurementCircle(2, target, nil, playerColor)
    end)
    addHotkey("Toggle 3 Inch Measurment Circle", function(playerColor, target)
        changeMeasurementCircle(3, target, nil, playerColor)
    end)
    addHotkey("Toggle 6 Inch Measurment Circle", function(playerColor, target)
        changeMeasurementCircle(6, target, nil, playerColor)
    end)
    addHotkey("Toggle 8 Inch Measurment Circle", function(playerColor, target)
        changeMeasurementCircle(8, target, nil, playerColor)
    end)
    addHotkey("Toggle 9 Inch Measurment Circle", function(playerColor, target)
        changeMeasurementCircle(9, target, nil, playerColor)
    end)
    lastClickTimestamp=nowSeconds()
    defaultFontSize=400
    fontSize=defaultFontSize
    lineCount=0
    defaultDivisionLabel="|\n|"
    self.createButton({
        label="---", click_function="none", function_owner=Global,
        -- Right of the tool column and below the dice frame, so the tallest readout stays on the mat.
        position={-4.9,0.11,0.2}, rotation={0,0,0}, height=0, width=0, font_size=fontSize,
        font_color={1, 1, 1},
        scale={0.25, 0.25, 0.25},
		alignment=2
    })
    self.createButton({
        label="", click_function="none", function_owner=Global,
        position={0.75,0.11,0.01}, rotation={0,0,0}, height=0, width=0, font_size=500,
        font_color={1, 1, 1},
        scale={0.25,2,1},
		alignment=2
    })

	if self.getDescription() == '' then
		setDefaultState()
	end

    emptyText = ' '
	data2 = JSON.decode(self.getDescription())
	Wait.time(checkDice, data2.Update_Frequency*1,-1)

    self.createButton(clearAllDiceBtn)
    self.createButton(rollAllBtn)
    self.createButton(add1d3Btn)
    self.createButton(add1d6Btn)
    self.createButton(add2d6Btn)
    self.createButton(color1Btn)
    self.createButton(color2Btn)
    self.createButton(color3Btn)
    self.createButton(color4Btn)
    self.createButton(customDiceBtn)
    self.createButton(add3d6Btn)
    self.createButton(add4d6Btn)
    self.createButton(auto2D6)
    self.createButton(revertRollBtn)  -- Add this near the end of the button creations
    self.createButton(saveBtn)
    self.createButton(restoreBtn)
    createToolButtonWithBorder(measure1Btn)
    createToolButtonWithBorder(measure2Btn)
    createToolButtonWithBorder(measure3Btn)
    createToolButtonWithBorder(measure6Btn)
    createToolButtonWithBorder(measure8Btn)
    createToolButtonWithBorder(measure9Btn)
    createToolButtonWithBorder(measure12Btn)
    createToolButtonWithBorder(measure15Btn)
    self.createButton(customBubbleInputBG)
    self.createInput(customBubbleInput)
    self.createButton(customBubbleBtn)
    createToolButtonWithBorder(clearMeasureAllBtn)
    createToolButtonWithBorder(clearLinesBtn)
    createToolButtonWithBorder(highlightBtn)
    createToolButtonWithBorder(highlightSwatchBtn)
    -- The swatch is recoloured at runtime. Its border shares the click_function,
    -- so grab the TOP button: the one created later, i.e. the higher index.
    for _, b in ipairs(self.getButtons() or {}) do
        if b.click_function == "cycleHighlightColor" then
            if highlightSwatchIndex == nil or b.index > highlightSwatchIndex then
                highlightSwatchIndex = b.index
            end
        end
    end
    refreshHighlightSwatch()
    self.createButton(customDiceSpawnButton)
    -- Created last so it doesn't shift the fixed indices modifyMenu() relies on;
    -- capture its real index so swapPipColor's editButton flips the right button.
    self.createButton(pipColorBtn)
    for _, b in ipairs(self.getButtons() or {}) do
        if b.click_function == "swapPipColor" then pipColorBtn.index = b.index break end
    end
    if self.getPosition().z < 0 then selectedColor="Blue" else selectedColor="Red" end modifyMenu(selectedColor)

end

function modifyMenu1()
    modifyMenu("Red")
end
function modifyMenu2()
    modifyMenu("Blue")
end
function modifyMenu3()
    modifyMenu("Black")
end
function modifyMenu4()
    modifyMenu("Green")
end
DICE_SPAWN_FUNCTIONS = {
    spawnDice1 = true, spawnDice2 = true, spawnDice3 = true, spawnDice4 = true, spawnDice1d3 = true,
}

function modifyMenu(color)
    customDiceImage = nil
    selectedColor = color
    setDiceType()
    for _, b in ipairs(self.getButtons() or {}) do
        if DICE_SPAWN_FUNCTIONS[b.click_function] then
            self.editButton({index = b.index, color = color})
        end
    end
end

function setDiceType()
    if customDiceImage ~= nil then
        diceType = "Custom_Dice"
    elseif pipColorBtn.color == "White" then
        diceType = "Die_6_Rounded"
    else
        diceType = "Die_6"
    end
end

function setDefaultState()
	self.setDescription(JSON.encode_pretty({
		Update_Frequency = '0.2'
	}))
end

-- Success and Injury Rolls keep the two highest dice (+DICE) or the two lowest
-- (-DICE), rulebook p15 / p18.
function describeHighLow(values)
    local v = {}
    for i, x in ipairs(values) do v[i] = x end
    table.sort(v)
    return "High 2: " .. (v[#v] + v[#v - 1]) .. "  Low 2: " .. (v[1] + v[2])
end

function checkDice()
    local data = JSON.decode(self.getDescription())
    if not data then
        setDefaultState()
        data = JSON.decode(self.getDescription())
        printToAll('Warning - invalid description. Restored default configuration.', {0.8,0.5,0})
    end
    if not self.resting then return end

    local b = self.getBounds()
    local leftBound  = b.center.x - b.size.x/2
    local rightBound = b.center.x + b.size.x/2
    local lowerBound = b.center.z - b.size.z/2
    local upperBound = b.center.z + b.size.z/2
    local k = trayMarginScale()
    if currentMat == "Red" then
        rightBound = rightBound - 5 * k
        lowerBound = lowerBound + 2.9 * k
        upperBound = upperBound - 0.5 * k
    else
        leftBound  = leftBound  + 5 * k
        lowerBound = lowerBound + 0.5 * k
        upperBound = upperBound - 2.9 * k
    end
    local ylowerBound = b.center.y - b.size.y/2

    local valueToCounter, valuesToSort, totaldice, diceSum, rolled = {}, {}, 0, 0, {}
    for _, obj in pairs(getAllObjects()) do
        if obj.tag == 'Dice' and obj.resting then
            local p = obj.getPosition()
            if p.x > leftBound and p.x < rightBound
            and p.z > lowerBound and p.z < upperBound
            and p.y > ylowerBound then
                local v = obj.getValue()
                if v then
                    if not valueToCounter[v] then
                        valueToCounter[v] = 0
                        table.insert(valuesToSort, v)
                    end
                    valueToCounter[v] = valueToCounter[v] + 1
                    diceSum    = diceSum + v
                    rolled[#rolled + 1] = v
                    totaldice  = totaldice + 1
                end
            end
        end
    end

    local textLines, lineCount = {}, 0
    table.sort(valuesToSort)
    for _, v in ipairs(valuesToSort) do
        table.insert(textLines, "#" .. v .. ": " .. valueToCounter[v])
        lineCount = lineCount + 1
    end
    for i = lineCount+1, 6 do
        table.insert(textLines, " ")
    end

    local text = table.concat(textLines, "\n")
    if text == "" then text = emptyText end
    local totaltext = (totaldice == 0) and " " or ("\n" .. totaldice .. " ∑ " .. diceSum)
    if totaldice >= 2 then
        totaltext = totaltext .. "\n" .. describeHighLow(rolled)
    end

    if lineCount > 6 then
        fontSize      = defaultFontSize - ((lineCount-6)*37)
        divisionLabel = defaultDivisionLabel
    else
        fontSize      = defaultFontSize
        divisionLabel = ""
    end

    self.editButton({ index = 0, label = text .. totaltext, font_size = fontSize })
    self.editButton({ index = 1, label = divisionLabel })
end

-- ── DEBUG-ONLY PERF DIAGNOSTIC ───────────────────────────────────────────────
-- Invoked from the shared debug panel (Global, --test builds only) via
-- mat.call("runDiceScanBenchmark", {color=<clicker>}). Benchmarks the always-on
-- getAllObjects() scan that checkDice() runs at 5Hz, and compares it against an
-- area-limited Physics.cast box over this mat's bounds, so the cost of the
-- whole-scene scan is visible and the box-cast win is provable in-game.
-- Timed with os.clock() (real wall time) NOT Time.time (frame time, which is
-- constant inside a single callback and would read zero).
function runDiceScanBenchmark(params)
    local playerColor = params and params.color
    local ITER = 200   -- bump if the scene is small and timings read ~0

    -- scene population is the real independent variable for getAllObjects()
    local sceneCount = #getAllObjects()

    -- mat box (same bounds checkDice uses to filter dice)
    local b = self.getBounds()
    local origin = { x = b.center.x, y = b.center.y, z = b.center.z }
    local size   = { x = b.size.x,   y = b.size.y + 6, z = b.size.z }
    local orient = { x = 0, y = self.getRotation().y, z = 0 }

    -- NOTE: TTS's Lua (MoonSharp) returns nil for collectgarbage("count"), so
    -- per-call heap allocation can't be measured here. Timing is the metric;
    -- collectgarbage("collect") still works and we use it to settle GC first.

    -- getAllObjects(): avg time per call
    collectgarbage("collect")
    local gaoT0 = os.clock()
    for _ = 1, ITER do getAllObjects() end
    local gaoMs = (os.clock() - gaoT0) / ITER * 1000

    -- Physics.cast box over the mat: avg time per call
    collectgarbage("collect")
    local castT0   = os.clock()
    local lastHits = 0
    for _ = 1, ITER do
        local hits = Physics.cast({
            origin = origin, direction = { x = 0, y = 1, z = 0 },
            type = 3, size = size, orientation = orient, max_distance = 0,
        })
        lastHits = #hits
    end
    local castMs = (os.clock() - castT0) / ITER * 1000
    collectgarbage("collect")

    -- always-on extrapolation: 2 mats * 5Hz = 10 scans/sec across the session
    local CALLS_PER_SEC = 10
    local speedup = (castMs > 0) and (gaoMs / castMs) or 0

    local out = string.format(
        "── checkDice scan benchmark (%d iters) ──\n" ..
        "scene objects: %d   box hits: %d\n" ..
        "getAllObjects: %.4f ms/call\n" ..
        "Physics.cast : %.4f ms/call\n" ..
        "speedup: %.1fx\n" ..
        "always-on (10 scans/s): %.3f ms/s  vs  %.3f ms/s",
        ITER, sceneCount, lastHits,
        gaoMs, castMs,
        speedup,
        gaoMs * CALLS_PER_SEC, castMs * CALLS_PER_SEC)

    if playerColor then
        printToColor(out, playerColor, { 0.4, 0.9, 1 })
    else
        printToAll(out, { 0.4, 0.9, 1 })
    end
    print(out)   -- also to the host's System Console / log
end

function swapPipColor()
    customDiceImage = nil
    if pipColorBtn.color == "Black" then
        pipColorBtn.label = "White"
        pipColorBtn.color = "White"
        pipColorBtn.font_color = "Black"
    else
        pipColorBtn.label = "Black"
        pipColorBtn.color = "Black"
        pipColorBtn.font_color = "White"
    end

    setDiceType()

    self.editButton(pipColorBtn)
end

function determineBaseInInches(model)
    local savedBase = model.getTable("chosenBase")

    if savedBase ~= nil then
        return savedBase.base
    else
        local chosenBase =  VALID_BASE_SIZES_IN_MM[1]
        local modelSize = model.getBoundsNormalized().size
        local modelSizeX = modelSize.x
        local modelSizeZ = modelSize.z
        local closestSum = 10000000000
        local chosenBaseIdx = 1

        for k, base in pairs(VALID_BASE_SIZES_IN_MM) do
            local baseInchX = (MM_TO_INCH - 0.001) * base.x
            local baseInchZ = (MM_TO_INCH - 0.001) * base.z
            if modelSizeX > baseInchX and modelSizeZ > baseInchZ then
                local distSum = (modelSizeX - baseInchX) + (modelSizeZ - baseInchZ)
                if distSum < closestSum then
                    closestSum = distSum
                    chosenBase = base
                    chosenBaseIdx = k
                end
            end
        end

        if chosenBase == nil then
            chosenBase = { x=modelSizeX/2, z=modelSizeZ/2}
        else
            chosenBase = {
                x = (chosenBase.x * MM_TO_INCH)/2,
                z = (chosenBase.z * MM_TO_INCH)/2
            }
        end

        model.setTable("chosenBase", { baseIdx=chosenBaseIdx, base=chosenBase })

        return chosenBase
    end
end

function getCircleVectorPoints(radius, baseX, baseZ, obj)
    local result = {}
    local scaleFactor = 1/obj.getScale().x
    local steps = 64
    local degrees,sin,cos,toRads = 360/steps, math.sin, math.cos, math.rad

    for i = 0,steps do
        table.insert(result,{
            x = cos(toRads(degrees*i))*((radius+baseX)*scaleFactor),
            z = MEASURING_RING_Y_OFFSET,
            y = sin(toRads(degrees*i))*((radius+baseZ)*scaleFactor)
        })
    end

    return result
end

function getRectangleVectorPoints(radius, sizeX, sizeZ, obj)
    local result = {}
    local scaleFactor = 1/obj.getScale().x

    sizeX = sizeX*scaleFactor
    sizeZ = sizeZ*scaleFactor
    radius = radius*scaleFactor

    local steps = 65
    local degrees,sin,cos,toRads = 360/(steps-1), math.sin, math.cos, math.rad
    local xOffset,zOffset = sizeX,sizeZ
    table.insert(result,{
        x = (cos(toRads(degrees*0))*radius)+sizeX-0.001,
        y = (sin(toRads(degrees*0))*radius)+sizeZ,
        z = MEASURING_RING_Y_OFFSET
    })

    for i = 1,steps-1 do
        if i == 16 then
            table.insert(result,{ x= sizeX, y=(radius+sizeZ), z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=-sizeX, y=(radius+sizeZ), z=MEASURING_RING_Y_OFFSET })
            xOffset = -sizeX
        elseif i == 33 then
            table.insert(result,{ x=-radius-sizeX,       y= sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=-radius-sizeX-0.001, y=-sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=-radius-sizeX,       y=-sizeZ, z=MEASURING_RING_Y_OFFSET })
            zOffset = -sizeZ
        elseif i == 49 then
            table.insert(result,{ x=-sizeX, y=-radius-sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x= sizeX, y=-radius-sizeZ, z=MEASURING_RING_Y_OFFSET })
            xOffset = sizeX
        elseif i == 65 then
            table.insert(result,{ x=radius+sizeX,       y=-sizeZ, z=MEASURING_RING_Y_OFFSET })
            table.insert(result,{ x=radius+sizeX-0.001, y= sizeZ, z=MEASURING_RING_Y_OFFSET })
        else
            table.insert(result,{
                x = (cos(toRads(degrees*i))*radius)+xOffset,
                y = (sin(toRads(degrees*i))*radius)+zOffset,
                z = MEASURING_RING_Y_OFFSET
            })
        end
    end
    table.insert(result,{
        x = (cos(toRads(degrees*0))*radius)+sizeX-0.001,
        y = (sin(toRads(degrees*0))*radius)+sizeZ,
        z = MEASURING_RING_Y_OFFSET
    })

    return result
end

function toggleMeasurementCircleForSelection(radius, playerColor)
    local playerObj = Player[playerColor]
    if not playerObj then return end
    local objs = playerObj.getSelectedObjects()
    for _, obj in ipairs(objs) do
        changeMeasurementCircle(radius, obj, nil, playerColor)
    end
end

function toggle1Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(1, playerColor)
end

function toggle2Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(2, playerColor)
end

function toggle3Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(3, playerColor)
end

function toggle6Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(6, playerColor)
end

function toggle8Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(8, playerColor)
end

function toggle9Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(9, playerColor)
end

function toggle12Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(12.01, playerColor)
end

function toggle15Bubble(obj, playerColor, alt)
    toggleMeasurementCircleForSelection(15, playerColor)
end

local customBubbleSize = 0
function setCustomBubbleSize(_, _, value, _)
    customBubbleSize = tonumber(value) or 0
end

function applyCustomBubble(_, playerColor, alt)
    if alt then
        -- Right-click opens the on-screen typed-size overlay instead.
        requestBubbleInput(_, playerColor, alt)
        return
    end
    if customBubbleSize > 0 then
        toggleMeasurementCircleForSelection(customBubbleSize, playerColor)
    else
        printToColor("Please enter a valid bubble size", playerColor, "Red")
    end
end

-- ===== Screen-space custom bubble input overlay (1-60) =====
-- The overlay panel + its input/submit callbacks live on the Global canvas
-- (global.ttslua / ftc_base_ui.xml). This button just asks Global to open it,
-- passing this mat's GUID so Global can call applyBubbleFromOverlay back here.
function requestBubbleInput(_, playerColor, _)
    Global.call("openBubbleInput", {color = playerColor, mat = self.getGUID()})
end

-- Invoked by Global once the player confirms a size in the overlay.
function applyBubbleFromOverlay(params)
    toggleMeasurementCircleForSelection(params.radius, params.color)
end

-- Invoked by Global when the overlay value is 0 / blank: clear bubbles on the
-- player's selected models (same as the "Clear Bubbles (Selected)" action).
function clearBubblesFromOverlay(params)
    clearMeasuringCircles(nil, params.color, true)
end

function changeMeasurementCircle(newRequestedRadius, target, presetBase, ownerColor)
    if target == nil then return end

    local measuringRings = target.getTable("ym-measuring-circles")
    local currentColor = "Teal"
    local currentColorRadius

    if measuringRings == nil then
        measuringRings = {}
        currentColorRadius = 0
    else
        for idx = #measuringRings, 1, -1 do
            if (measuringRings[idx].name == currentColor) or
               (measuringRings[idx].name == nil and currentColor == nil) then
                currentColorRadius = measuringRings[idx].radius
                table.remove(measuringRings, idx)
            elseif measuringRings[idx].name == "base" then
                table.remove(measuringRings, idx)
            end
        end

        if currentColorRadius == nil then currentColorRadius = 0 end
    end

    local newRadius
    if currentColorRadius == newRequestedRadius then
        newRadius = 0
    else
        newRadius = newRequestedRadius
    end

    if newRadius ~= 0 then
        local isRectangular = target.hasTag("rectangularMeasuring")
        local measuring = {
            name = currentColor,
            color = Color.fromString(currentColor),
            radius = newRadius,
            thickness = 0.5,
            rotation = {270, 0, 0},
            owner = ownerColor -- track who created this measuring circle
        }
        local base = {
            name = "base",
            color = Color.fromString(currentColor),
            thickness = 0.2,
            rotation = {270, 0, 0},
            owner = ownerColor
        }

        local measuringPoints, basePoints
        if isRectangular then
            local modelBounds = target.getBoundsNormalized()
            measuringPoints = getRectangleVectorPoints(newRadius, modelBounds.size.x / 2, modelBounds.size.z / 2, target)
            basePoints = getRectangleVectorPoints(0, modelBounds.size.x / 2, modelBounds.size.z / 2, target)
        else
            local baseRadiuses = (presetBase == nil) and determineBaseInInches(target) or presetBase
            measuringPoints = getCircleVectorPoints(newRadius, baseRadiuses.x, baseRadiuses.z, target)
            basePoints = getCircleVectorPoints(0, baseRadiuses.x, baseRadiuses.z, target)
        end

        measuring.points = measuringPoints
        base.points = basePoints

        table.insert(measuringRings, measuring)
        table.insert(measuringRings, base)
    end

    target.setVectorLines(measuringRings)
    target.setTable("ym-measuring-circles", measuringRings)
end

-- Clear measuring circles helper.
-- LMB (alt=false): clear bubbles on every object on the table.
-- RMB (alt=true):  clear bubbles only on the player's currently selected objects.
function clearMeasuringCircles(obj, playerColor, alt)
    local targets
    if alt then
        local playerObj = Player[playerColor]
        if not playerObj then return end
        targets = playerObj.getSelectedObjects()
        if #targets == 0 then
            printToColor("No objects selected. Right-click clears bubbles on selected objects only.", playerColor, "Yellow")
            return
        end
    else
        targets = getAllObjects()
    end

    local cleared = 0
    for _, o in ipairs(targets) do
        local bubbles = o.getTable("ym-measuring-circles")
        if bubbles ~= nil then
            o.setVectorLines({})
            o.setTable("ym-measuring-circles", nil)
            cleared = cleared + 1
        end
    end

    if alt then
        printToColor("Cleared measuring bubbles on "..cleared.." selected object(s).", playerColor, {1,1,1})
    else
        printToAll("Cleared measuring bubbles on "..cleared.." objects.", {1,1,1})
    end
end

function clearHandDrawnLines(obj, playerColor, alt)
    local clearedAll = 0
    Global.setVectorLines({})
    for _, o in ipairs(getAllObjects()) do
        if o.getTable("ym-measuring-circles") == nil then
            local lines = o.getVectorLines()
            if lines and #lines > 0 then
                o.setVectorLines({})
                clearedAll = clearedAll + 1
            end
        end
    end
    printToAll("Cleared hand-drawn lines on "..clearedAll.." objects.", {1,1,1})
end

local SELECTION_HIGHLIGHTER_GUID = "27de4f"

-- ====================================================================
-- Highlight painter
-- LEFT-clicking Highlight paints the player's selected models with the colour
-- currently shown on the swatch next to it; the swatch cycles its palette on
-- click (right-click cycles backwards) and its face IS the chosen colour.
-- Paint is permanent for the session: a paint applied while a model is selected
-- is also written into SelectionHighlighter's restore-on-deselect snapshot
-- (setPersistentHighlight), so deselecting restores the paint instead of wiping
-- it. RIGHT-clicking Highlight removes highlights from every object on the
-- table.
-- ====================================================================
local HIGHLIGHT_PALETTE = {
    {name = "Yellow", rgb = {1, 1, 0}},
    {name = "Orange", rgb = {1, 0.5, 0}},
    {name = "Red",    rgb = {1, 0, 0}},
    {name = "Pink",   rgb = {1, 0.4, 0.7}},
    {name = "Purple", rgb = {0.7, 0.2, 1}},
    {name = "Blue",   rgb = {0.2, 0.4, 1}},
    {name = "Teal",   rgb = {0, 0.9, 0.9}},
    {name = "Green",  rgb = {0, 1, 0}},
    {name = "White",  rgb = {1, 1, 1}},
}
highlightColorIndex = 1
highlightSwatchIndex = nil -- resolved in onload after the swatch is created

-- Repaint the swatch's top button to the chosen colour (hover/press too, so it
-- reads as a solid colour chip) and name the colour in its tooltip.
function refreshHighlightSwatch()
    if highlightSwatchIndex == nil then return end
    local c = HIGHLIGHT_PALETTE[highlightColorIndex]
    self.editButton({
        index = highlightSwatchIndex,
        color = c.rgb, hover_color = c.rgb, press_color = c.rgb,
        tooltip = "Highlight color: " .. c.name .. "\nLEFT CLICK: next color\nRIGHT CLICK: previous color",
    })
end

function cycleHighlightColor(_, _, alt)
    local step = alt and -1 or 1
    highlightColorIndex = ((highlightColorIndex - 1 + step) % #HIGHLIGHT_PALETTE) + 1
    refreshHighlightSwatch()
end

-- Remove highlights from every object on the table (both players' paint, and
-- any stray glow), then reset SelectionHighlighter's tracking so currently
-- selected models fall back to the plain player-colour selection glow on its
-- next tick. Models glowed by a live monitor (held in SelectionHighlighter's
-- externalHolds) are left alone -- the monitor owns their highlight lifecycle.
function clearAllHighlightPaint(playerColor)
    local sh = getObjectFromGUID(SELECTION_HIGHLIGHTER_GUID)
    local holds = {}
    if sh ~= nil then
        holds = sh.call("getExternalHolds") or {}
        sh.call("clearPersistentHighlights")
    end
    local n = 0
    for _, o in ipairs(getAllObjects()) do
        if holds[o.getGUID()] == nil then
            if o.getHighlightColor() ~= nil then n = n + 1 end
            o.highlightOff()
        end
    end
    if playerColor then
        printToColor(string.format("Removed highlights from %d object(s).", n), playerColor, {1, 1, 1})
    end
end

-- LEFT click: paint the selection in the swatch colour. RIGHT click: clear all.
function applyHighlightPaint(a, b, c)
    -- Support button (a=object, b=color, c=altClick) and hotkey (a=color)
    -- invocation.
    local playerColor, alt
    if type(a) == "string" then
        playerColor = a
        alt = false
    else
        playerColor = b
        alt = c and true or false
    end

    if alt then
        clearAllHighlightPaint(playerColor)
        return
    end

    local playerObj = Player[playerColor]
    if not playerObj then
        print("Player object not found for color: " .. tostring(playerColor))
        return
    end

    local sel = playerObj.getSelectedObjects()
    if #sel == 0 then
        printToColor("Select at least one model to highlight.", playerColor, {1, 0.5, 0})
        return
    end

    local col = HIGHLIGHT_PALETTE[highlightColorIndex]
    local sh = getObjectFromGUID(SELECTION_HIGHLIGHTER_GUID)
    local n = 0
    for _, o in ipairs(sel) do
        if not o.isDestroyed() then
            o.highlightOn(col.rgb)
            -- The model is selected, so SelectionHighlighter has snapshotted (or
            -- is about to snapshot) an "original" colour to restore on deselect;
            -- point that snapshot at our paint so deselecting keeps it.
            if sh ~= nil then
                sh.call("setPersistentHighlight", {guid = o.getGUID(), color = col.rgb})
            end
            n = n + 1
        end
    end
    printToColor(string.format("Highlighted %d model(s) in %s. RIGHT-CLICK Highlight to remove all highlights.", n, col.name), playerColor, col.rgb)
end
