-- FTC-GUID: e24c01,e24c02
-- Measure & Mark (TC-024): the table tools that lived on the dice tray - measuring
-- bubbles and the custom size, clear bubbles / lines, highlight paint, save / restore
-- positions, the HUD toggle and their hotkeys - on their own 9.0 x 7.6 panel beside it.

function none()
end

function noop()
end

-- Inches in the seated player's frame (u to their right, v toward them) on a 9.0 x 7.6
-- Custom_Tile at scale (3.8, 1, 3.8). Widget units and the x mirror are the dice tray's.
PANEL_HALF = { u = 4.5, v = 3.8 }
UNITS_PER_LOCAL = 500
HEIGHT_UNITS_PER_LOCAL = 650
LINE_PER_FONT = 0.76 / 375
WIDGET_Y = 0.2

LIGHT = { 0.95, 0.92, 0.85 }
MAT = { 0.08, 0.08, 0.08 }
PANEL2 = { 0.165, 0.165, 0.165 }
INPUT_BG = { 0.06, 0.06, 0.06 }
MUTED = { 0.43, 0.42, 0.38 }

local BW, BH = 1.85, 0.85
local function bubbleU(c) return -PANEL_HALF.u + 0.45 + BW / 2 + c * (BW + 0.15) end

PANEL_BUTTONS = {
  { id = "title", label = "MEASURE & MARK", u = -PANEL_HALF.u + 0.45 + 2.0, v = -3.25, w = 4.0, h = 0.55, font = 0.34, bg = MAT },
  { id = "b1", label = '1"', u = bubbleU(0), v = -2.25, w = BW, h = BH, font = 0.36, click = "toggle1Bubble", tooltip = 'Toggle 1" bubble' },
  { id = "b2", label = '2"', u = bubbleU(1), v = -2.25, w = BW, h = BH, font = 0.36, click = "toggle2Bubble", tooltip = 'Toggle 2" bubble' },
  { id = "b3", label = '3"', u = bubbleU(2), v = -2.25, w = BW, h = BH, font = 0.36, click = "toggle3Bubble", tooltip = 'Toggle 3" bubble' },
  { id = "b6", label = '6"', u = bubbleU(3), v = -2.25, w = BW, h = BH, font = 0.36, click = "toggle6Bubble", tooltip = 'Toggle 6" bubble' },
  { id = "b8", label = '8"', u = bubbleU(0), v = -1.25, w = BW, h = BH, font = 0.36, click = "toggle8Bubble", tooltip = 'Toggle 8" bubble' },
  { id = "b9", label = '9"', u = bubbleU(1), v = -1.25, w = BW, h = BH, font = 0.36, click = "toggle9Bubble", tooltip = 'Toggle 9" bubble' },
  { id = "b12", label = '12"', u = bubbleU(2), v = -1.25, w = BW, h = BH, font = 0.36, click = "toggle12Bubble", tooltip = 'Toggle 12" bubble' },
  { id = "b15", label = '15"', u = bubbleU(3), v = -1.25, w = BW, h = BH, font = 0.36, click = "toggle15Bubble", tooltip = 'Toggle 15" bubble' },
  { id = "go", label = "Go", u = -PANEL_HALF.u + 2.8 + 0.55, v = -0.05, w = 1.1, h = BH, font = 0.34, click = "applyCustomBubble", tooltip = "LEFT CLICK: apply size from the box\nRIGHT CLICK: on-screen size entry (0/blank clears selected)" },
  { id = "clearBubbles", label = "Clear bubbles", u = -PANEL_HALF.u + 4.1 + 2.0, v = -0.05, w = 4.0, h = BH, font = 0.32, click = "clearMeasuringCircles", tooltip = "LEFT CLICK: Clear all measuring bubbles from the table\nRIGHT CLICK: Clear all measuring bubbles from highlighted objects only" },
  { id = "highlight", label = "Highlight", u = -PANEL_HALF.u + 0.45 + 1.4, v = 1.0, w = 2.8, h = BH, font = 0.32, click = "applyHighlightPaint", tooltip = "LEFT CLICK: Highlight the selected model(s) in the swatch color (permanent)\nRIGHT CLICK: Remove ALL highlights from every object on the table" },
  { id = "swatch", label = "", u = -PANEL_HALF.u + 3.825, v = 1.0, w = 0.85, h = BH, font = 0.32, bg = { 1, 1, 0 }, click = "cycleHighlightColor", tooltip = "Highlight color\nLEFT CLICK: next color\nRIGHT CLICK: previous color" },
  { id = "clearLines", label = "Clear lines", u = -PANEL_HALF.u + 4.4 + 1.85, v = 1.0, w = 3.7, h = BH, font = 0.32, click = "clearHandDrawnLines", tooltip = "Clear all hand-drawn lines, keep measuring bubbles" },
  { id = "save", label = "Save pos.", u = -PANEL_HALF.u + 0.45 + 1.35, v = 2.05, w = 2.7, h = BH, font = 0.3, click = "save", tooltip = "Save the positions of the selected models" },
  { id = "restore", label = "Restore", u = -PANEL_HALF.u + 3.3 + 1.35, v = 2.05, w = 2.7, h = BH, font = 0.3, click = "restore", tooltip = "Move the saved models back" },
  { id = "hud", label = "HUD", u = -PANEL_HALF.u + 6.15 + 1.2, v = 2.05, w = 2.4, h = BH, font = 0.3, click = "toggleHudOverlay", tooltip = "Show or hide your HUD (help, clock)" },
}
SIZE_INPUT = { label = "size", u = -PANEL_HALF.u + 0.45 + 1.1, v = -0.05, w = 2.2, h = BH, font = 0.3 }

local function round(x) return math.floor(x + 0.5) end

function toButton(spec, s)
  local p = {
    label = spec.label or "",
    click_function = spec.click or "noop",
    function_owner = self,
    tooltip = spec.tooltip or "",
    position = { spec.u / s, WIDGET_Y, spec.v / s },
    rotation = { 0, 0, 0 },
    width = round(spec.w * UNITS_PER_LOCAL / s),
    height = round(spec.h * HEIGHT_UNITS_PER_LOCAL / s),
    font_size = round(spec.font / (s * LINE_PER_FONT)),
    color = spec.bg or PANEL2,
    font_color = spec.fg or LIGHT,
  }
  if not spec.click then
    p.hover_color = p.color
    p.press_color = p.color
  end
  return p
end

function onLoad()
  local s = self.getScale().x
  self.clearButtons()
  self.clearInputs()
  for i, spec in ipairs(PANEL_BUTTONS) do
    self.createButton(toButton(spec, s))
    if spec.id == "swatch" then highlightSwatchIndex = i - 1 end
  end
  local input = toButton(SIZE_INPUT, s)
  input.click_function = nil
  input.hover_color = nil
  input.press_color = nil
  input.input_function = "setCustomBubbleSize"
  input.alignment = 3
  input.color = INPUT_BG
  input.font_color = LIGHT
  self.createInput(input)
  refreshHighlightSwatch()

  -- TTS sorts the Options -> Game Keys list alphabetically by label (call order
  -- is ignored), so these are prefixed 1.-3. to pin them to the top in the
  -- desired order; "4. Roll All Dice" is the dice tray's.
  addHotkey("1. Save Position", savePositionClicked)
  addHotkey("2. Restore Position", restorePositionClicked)
  addHotkey("3. Custom Bubble", function(playerColor, _, _)
    if playerColor ~= "Red" and playerColor ~= "Blue" then return end
    local panel = (playerColor == "Red")
      and Global.getVar("redMeasurePanel_GUID")
      or Global.getVar("blueMeasurePanel_GUID")
    Global.call("openBubbleInput", {color = playerColor, panel = panel})
  end)
  addHotkey("Clear Bubbles", function(playerColor, _, _)
    clearMeasuringCircles(nil, playerColor, false)
  end)
  addHotkey("Clear Bubbles (Selected)", function(playerColor, _, _)
    clearMeasuringCircles(nil, playerColor, true)
  end)
  addHotkey("Clear Lines", function(playerColor, _, _)
    clearHandDrawnLines(nil, playerColor, false)
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

function getHudOverlayColorForThisPanel()
    if self.getGUID() == Global.getVar("redMeasurePanel_GUID") then
        return "Red"
    end
    if self.getGUID() == Global.getVar("blueMeasurePanel_GUID") then
        return "Blue"
    end
    return nil
end

function toggleHudOverlay(obj, player, alt)
    local color = getHudOverlayColorForThisPanel()
    if not color then
        printToColor("Could not determine overlay owner for this panel.", player, "Orange")
        return
    end
    Global.call("toggleHudOverlayForColor", {color = color})
end

function getObjectsPositionToSave(player, hoveredObject)
  if #player.getSelectedObjects() ~= 0 then
    return player.getSelectedObjects()
  elseif hoveredObject ~= nil then
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
    if obj ~= nil then
      obj.setRotation(v.rotation)
      obj.setPositionSmooth(v.position, false, true)
    end
  end
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
-- passing this panel's GUID so Global can call applyBubbleFromOverlay back here.
function requestBubbleInput(_, playerColor, _)
    Global.call("openBubbleInput", {color = playerColor, panel = self.getGUID()})
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
