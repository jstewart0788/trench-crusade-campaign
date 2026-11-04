--[[ Ultimate memory bag by bercianor ]]----------------------------------------

-- Version: 1.2.2
-- URL: <https://steamcommunity.com/sharedfiles/filedetails/?id=3451167073>
-- Fork of "Utility memory bag 2.7.0" by Directsun at <https://steamcommunity.com/sharedfiles/filedetails/?id=2057376256>
-- Boxes thanks to "(Tool) - Tragic Game Boxes" by Tragic <https://steamcommunity.com/sharedfiles/filedetails/?id=1992501923>

--[[ ChangeLog:
    v1.0.0: Relative position
        - Added posibility of save Absolute position or Relative to Bag position of the objects (each object)
        - When bag rotate and the object is saved as relative position, its position rotates according to bag
        - When you rotate an object and apply that movement to rest, all objects rotates its position relative to the moved object
    v1.1.0: Reordening
        - Buttons little relocation
        - Code reorder
        - Set pan variables for the buttons
    v1.1.1: Selecction button position
        - A new better calc for the position of the selection buttons, but it needs to be improved
    v1.2.0: Now with boxes!
        - Show content when container flipped (only objects inside bag)
    v1.2.1: Final version?
        - Shows all saved abjects
    v1.2.2: Fix selection button location
]]------------------------------------------------------------------------------

--[[ Events ]]------------------------------------------------------------------
function onload(saved_data)
    GlobalMemoryGroups:onLoad(self.getGUID())
    AllMemoryBagsInScene:add(self.getGUID())

    btn_x_offset = 0
    btn_y_offset = 0.3
    btn_z_offset = 0
    text_y_offset = 0

    --Set up information for if there is no saved data
    memoryList = {}
    memoryGroupName:set(nil)
    position_type = "relative"
    if saved_data ~= "" then
        --Set up information off of loaded_data
        local loaded_data = JSON.decode(saved_data)
        memoryList = loaded_data.ml or memoryList
        memoryGroupName:set(loaded_data.groupName or nil)
        position_type = loaded_data.pos_type or position_type
    end
    moveList = {}
    moveGuid = nil

    fresh = true
    if next(memoryList) ~= nil then fresh = false end

    if self.getRotation().z == 180 then
        showContent()
    elseif fresh then
        createSetupButton()
    else
        createMemoryActionButtons()
    end

end

function updateSave()
    saved_data = JSON.encode({
        ["ml"]=memoryList,
        ["groupName"]=memoryGroupName:get(),
        ["pos_type"]=position_type
    })
    self.script_state = saved_data
end

--Shows content (grouped) on flip
function onObjectRotate(object, spin, flip, player_color, old_spin, old_flip)
    if object == self and flip ~= old_flip then
        if flip == 180 then
            object.clearButtons()
            object.clearInputs()
            showContent()
        elseif flip == 0 then
            object.UI.setXml("")
            if fresh then
                createSetupButton()
            else
                createMemoryActionButtons()
            end
        end
    end
end

function showContent()
    local bagObjList = self.getObjects()
    local content = {}
    for guid, entry in pairs(memoryList) do
        local obj = getObjectFromGUID(guid)
        if obj ~= nil then
            if content[obj.getName()] ~= nil then
                content[obj.getName()] = content[obj.getName()] + 1
            else
                content[obj.getName()] = 1
            end
        else
            for _, bagObj in ipairs(bagObjList) do
                if bagObj.guid == guid then
                    if content[bagObj.name] ~= nil then
                        content[bagObj.name] = content[bagObj.name] + 1
                    else
                        content[bagObj.name] = 1
                    end
                    break
                end
            end
        end
    end

    local sb = {}
    for name, amount in pairs(content) do
        table.insert(sb,
            string.format("- %dx %s\n", amount, name))
    end

    createBackText(table.concat(sb))
end
--[[ Events ]]------------------------------------------------------------------

--[[ UI Creations ]]------------------------------------------------------------
--Make setup button
function createSetupButton()
    self.createButton({
        label="Setup", click_function="buttonClick_setup", function_owner=self,
        position={0,btn_y_offset,2+btn_z_offset}, rotation={0,0,0}, height=350, width=800,
        font_size=250, color={0,0,0}, font_color={1,1,1}
    })
end

--Creates Setting Up buttons
function createSetupActionButtons(move)
    self.createButton({
        label="Cancel", click_function="buttonClick_cancel", function_owner=self,
        position={0,btn_y_offset,2+btn_z_offset}, rotation={0,0,0}, height=350, width=1100,
        font_size=250, color={0,0,0}, font_color={1,1,1}
    })

    self.createButton({
        label="Submit", click_function="buttonClick_submit", function_owner=self,
        position={0,btn_y_offset,2.8+btn_z_offset}, rotation={0,0,0}, height=350, width=1100,
        font_size=250, color={0,0,0}, font_color={1,1,1}
    })

    if move == false then
        self.createButton({
            label="Add", click_function="buttonClick_add", function_owner=self,
            position={0,btn_y_offset,3.6+btn_z_offset}, rotation={0,0,0}, height=350, width=1100,
            font_size=250, color={0,0,0}, font_color={0.25,1,0.25}
        })

        self.createButton({
            label="Selection", click_function="editDragSelection", function_owner=self,
            position={0,btn_y_offset,-2-btn_z_offset}, rotation={0,0,0}, height=350, width=1100,
            font_size=250, color={0,0,0}, font_color={1,1,1}
        })

        groupNameInput:create(memoryGroupName:get())

        if fresh == false then
            self.createButton({
                label="Set New", click_function="buttonClick_setNew", function_owner=self,
                position={0,btn_y_offset,4.4+btn_z_offset}, rotation={0,0,0}, height=350, width=1100,
                font_size=250, color={0,0,0}, font_color={0.75,0.75,1}
            })
            self.createButton({
                label="Remove", click_function="buttonClick_remove", function_owner=self,
                position={0,btn_y_offset,5.2+btn_z_offset}, rotation={0,0,0}, height=350, width=1100,
                font_size=250, color={0,0,0}, font_color={1,0.25,0.25}
            })
        end
    end

    self.createButton({
        label="Reset", click_function="buttonClick_reset", function_owner=self,
        position={2+btn_x_offset,btn_y_offset,0}, rotation={0,90,0}, height=350, width=800,
        font_size=250, color={0,0,0}, font_color={1,1,1}
    })

    if position_type == "relative" then
        self.createButton({
            label="Rel. Pos.", click_function="buttonClick_posType", function_owner=self,
            position={2.8+btn_x_offset,btn_y_offset,0}, rotation={0,90,0}, height=350, width=1000,
            font_size=250, color={0,0,0}, font_color={1,1,1}
        })
    else
        self.createButton({
            label="Abs. Pos.", click_function="buttonClick_posType", function_owner=self,
            position={2.8+btn_x_offset,btn_y_offset,0}, rotation={0,90,0}, height=350, width=1000,
            font_size=250, color={0,0,0}, font_color={1,1,1}
        })
    end
end

--Creates selection buttons on objects
function createButtonsOnAllObjects(move)
    buttonIndexMap = {}
    local howManyButtons = 0

    local objsToHaveButtons = {}
    if move == true then
        for guid in pairs(memoryListBackup) do
            table.insert(objsToHaveButtons, getObjectFromGUID(guid))
        end
    else
        objsToHaveButtons = getAllObjects()
    end

    for _, obj in ipairs(objsToHaveButtons) do
        if obj ~= self then
            --On a normal bag, the button positions aren't the same size as the bag.
            --TODO: Needs a better calc for the globalScaleFactor
            local globalScaleFactor = 1.25/(1+math.log(self.getScale().x,6))
            local deltaPos = findOffsetDistance(self.getPosition(), obj.getPosition(), obj)
            deltaPos = Vector(deltaPos.x,deltaPos.y,deltaPos.z):rotateOver('y', 180-self.getRotation().y)
            local objPos = {}
            objPos.x = deltaPos.x * globalScaleFactor
            objPos.y = deltaPos.y * globalScaleFactor
            objPos.z = -deltaPos.z * globalScaleFactor
            --Workaround for custom PDFs
            if obj.Book then
                objPos.y = objPos.y + 0.5
            end
            --Offset rotation of bag
            local rot = self.getRotation()
            rot.y = 180-rot.y
            --Create function
            local funcName = "selectButton_" .. howManyButtons
            local func = function() buttonClick_selection(obj, move) end
            local color = {0.75,0.25,0.25,0.6}
            local colorMove = {0,0,1,0.6}
            if move == true then
                color = colorMove
            end
            self.setVar(funcName, func)
            self.createButton({
                click_function=funcName, function_owner=self,
                position=objPos, rotation=rot, height=1000, width=1000,
                color=color,
            })
            buttonIndexMap[obj.getGUID()] = howManyButtons
            howManyButtons = howManyButtons + 1
        end
    end
end

--Creates recall and place buttons
function createMemoryActionButtons()
    self.createButton({
        label="Place", click_function="buttonClick_place", function_owner=self,
        position={0,btn_y_offset,2+btn_z_offset}, rotation={0,0,0}, height=350, width=800,
        font_size=250, color={0,0,0}, font_color={1,1,1}
    })
    self.createButton({
        label="Recall", click_function="buttonClick_recall", function_owner=self,
        position={0,btn_y_offset,2.8+btn_z_offset}, rotation={0,0,0}, height=350, width=800,
        font_size=250, color={0,0,0}, font_color={1,1,1}
    })
end

function createBackText(text)
    self.UI.setXmlTable({
        {
            tag="Panel",
            attributes={
                height          = (self.getBoundsNormalized().size.z*67.5/self.getScale().z),
                width           = (self.getBoundsNormalized().size.x*67.5/self.getScale().x),
                position        = "0 0 "..text_y_offset*100,
                rotation        = "180 0 0",
                rectAlignment   = "MiddleCenter"
            },
            children={
                tag = "Text",
                attributes = {
                    text                = text,
                    id                  = "content",
                    color               = "#000000FF",
                    fontStyle           = "Bold",
                    alignment           ="UpperLeft",
                    resizeTextForBestFit= true,
                    resizeTextMinSize   = 10,
                    resizeTextMaxSize   = 40,
                    horizontalOverflow  = "Wrap", -- Wrap or Overflow?
                    verticalOverflow    = "Truncate" -- Truncate or Overflow?
                }
            }
        }
    })
end
--[[ UI Creations ]]------------------------------------------------------------

--[[ Button Triggers ]]---------------------------------------------------------
--Triggered by Transpose button
function buttonClick_transpose()
    moveGuid = nil
    broadcastToAll("Select one object and move it- all objects will move relative to the new location", {0.75, 0.75, 1})
    memoryListBackup = duplicateTable(memoryList)
    memoryList = {}
    moveList = {}
    self.clearButtons()
    self.clearInputs()
    createButtonsOnAllObjects(true)
    createSetupActionButtons(true)
end

--Triggered by setup button,
function buttonClick_setup()
    memoryListBackup = duplicateTable(memoryList)
    memoryList = {}
    self.clearButtons()
    self.clearInputs()
    createButtonsOnAllObjects(false)
    createSetupActionButtons(false)
end

--Checks or unchecks buttons
function buttonClick_selection(obj, move)
    local index = buttonIndexMap[obj.getGUID()]
    local colorMove = {0,0,1,0.6}
    local color = {0,1,0,0.6}

    previousGuid = selectedGuid
    selectedGuid = obj.getGUID()

    theList = memoryList
    if move == true then
        theList = moveList
        if previousGuid ~= nil and previousGuid ~= selectedGuid then
            local prevObj = getObjectFromGUID(previousGuid)
            prevObj.highlightOff()
            self.editButton({index=previousIndex, color=colorMove})
            theList[previousGuid] = nil
        end
        previousIndex = index
    end

    if theList[selectedGuid] == nil then
        self.editButton({index=index, color=color})
        --Adding pos/rot to memory table
        local pos = {}
        local rot = {}
        if position_type == "relative" then
            pos = findOffsetDistance(self.getPosition(), obj.getPosition())
            rot =  findOffsetDistance(self.getRotation(), obj.getRotation())
        else
            pos = obj.getPosition()
            rot =  obj.getRotation()
        end
        --I need to add it like this or it won't save due to indexing issue
        theList[obj.getGUID()] = {
            bag_rotation=self.getRotation(),
            pos_type=position_type,
            pos={x=round(pos.x,4), y=round(pos.y,4), z=round(pos.z,4)},
            rot={x=round(rot.x,4), y=round(rot.y,4), z=round(rot.z,4)},
            lock=obj.getLock(),
            tint=obj.getColorTint()
        }
        obj.highlightOn({0,1,0})
    else
        color = {0.75,0.25,0.25,0.6}
        if move == true then
            color = colorMove
        end
        self.editButton({index=index, color=color})
        theList[obj.getGUID()] = nil
        obj.highlightOff()
    end
end

function editDragSelection(bagObj, player, remove)
    local selectedObjs = Player[player].getSelectedObjects()
    if not remove then
        for _, obj in ipairs(selectedObjs) do
            local index = buttonIndexMap[obj.getGUID()]
            --Ignore if already in the memory list, or does not have a button
            if index and not memoryList[obj.getGUID()] then
                self.editButton({index=index, color={0,1,0,0.6}})
                --Adding pos/rot to memory table
                local pos = {}
                local rot =  {}
                if position_type == "relative" then
                    pos = findOffsetDistance(self.getPosition(), obj.getPosition())
                    rot =  findOffsetDistance(self.getRotation(), obj.getRotation())
                else
                    pos = obj.getPosition()
                    rot =  obj.getRotation()
                end
                --I need to add it like this or it won't save due to indexing issue
                memoryList[obj.getGUID()] = {
                    bag_rotation=self.getRotation(),
                    pos_type=position_type,
                    pos={x=round(pos.x,4), y=round(pos.y,4), z=round(pos.z,4)},
                    rot={x=round(rot.x,4), y=round(rot.y,4), z=round(rot.z,4)},
                    lock=obj.getLock(),
                    tint=obj.getColorTint()
                }
                obj.highlightOn({0,1,0})
            end
        end
    else
        for _, obj in ipairs(selectedObjs) do
            local index = buttonIndexMap[obj.getGUID()]
            if index and memoryList[obj.getGUID()] then
                color = {0.75,0.25,0.25,0.6}
                self.editButton({index=index, color=color})
                memoryList[obj.getGUID()] = nil
                obj.highlightOff()
            end
        end
    end
end

function updateMemoryWithMoves()
    memoryList = memoryListBackup
    --get the first transposed object's coordinates
    local obj = getObjectFromGUID(moveGuid)

    local refObjPos = {}
    local refObjRot = {}
    if  memoryList[moveGuid].pos_type == "relative" then
        refObjPos.x = self.getPosition().x + memoryList[moveGuid].pos.x
        refObjPos.y = self.getPosition().y + memoryList[moveGuid].pos.y
        refObjPos.z = self.getPosition().z + memoryList[moveGuid].pos.z
        refObjRot.x = self.getRotation().x + memoryList[moveGuid].rot.x
        refObjRot.y = self.getRotation().y + memoryList[moveGuid].rot.y
        refObjRot.z = self.getRotation().z + memoryList[moveGuid].rot.z
    else
        refObjPos.x = memoryList[moveGuid].pos.x
        refObjPos.y = memoryList[moveGuid].pos.y
        refObjPos.z = memoryList[moveGuid].pos.z
        refObjRot.x = memoryList[moveGuid].rot.x
        refObjRot.y = memoryList[moveGuid].rot.y
        refObjRot.z = memoryList[moveGuid].rot.z
    end
    local deltaPos = findOffsetDistance(obj.getPosition(), refObjPos)
    local deltaRot = findOffsetDistance(obj.getRotation(), refObjRot)

    for guid, entry in pairs(memoryList) do
        local pos = {}
        local rot = {}
        pos.x = entry.pos.x - deltaPos.x
        pos.y = entry.pos.y - deltaPos.y
        pos.z = entry.pos.z - deltaPos.z
        rot.x = entry.rot.x - deltaRot.x
        rot.y = entry.rot.y - deltaRot.y
        rot.z = entry.rot.z - deltaRot.z

        if entry.pos_type == "relative" then
            pos = obj.positionToWorld(obj.positionToLocal(Vector(self.getPosition().x + pos.x, self.getPosition().y + pos.y, self.getPosition().z + pos.z)):rotateOver('y', -deltaRot.y))
            pos = findOffsetDistance(self.getPosition(), pos)
        else
            pos = obj.positionToWorld(obj.positionToLocal(Vector(pos.x,pos.y,pos.z)):rotateOver('y', -deltaRot.y))
        end

        memoryList[guid].pos.x = pos.x
        memoryList[guid].pos.y = pos.y
        memoryList[guid].pos.z = pos.z

        memoryList[guid].rot.x = rot.x
        memoryList[guid].rot.y = rot.y
        memoryList[guid].rot.z = rot.z
    end

    moveList = {}
end

--Cancels selection process
function buttonClick_cancel()
    memoryList = memoryListBackup
    moveList = {}
    self.clearButtons()
    self.clearInputs()
    if next(memoryList) == nil then
        createSetupButton()
    else
        createMemoryActionButtons()
    end
    removeAllHighlights()
    broadcastToAll("Selection Canceled", {1,1,1})
    moveGuid = nil
end

--Saves selections
function buttonClick_submit()
    fresh = false
    if next(moveList) ~= nil then
        for guid in pairs(moveList) do
            moveGuid = guid
        end
        if memoryListBackup[moveGuid] == nil then
            broadcastToAll("Item selected for moving is not already in memory", {1, 0.25, 0.25})
        else
            broadcastToAll("Moving all items in memory relative to new objects position!", {0.75, 0.75, 1})
            self.clearButtons()
            self.clearInputs()
            createMemoryActionButtons()
            local count = 0
            for guid in pairs(moveList) do
                moveGuid = guid
                count = count + 1
                local obj = getObjectFromGUID(guid)
                if obj ~= nil then obj.highlightOff() end
            end
            updateMemoryWithMoves()
            updateSave()
            buttonClick_place()
        end
    elseif next(memoryList) == nil and moveGuid == nil then
        memoryList = memoryListBackup
        broadcastToAll("No selections made.", {0.75, 0.25, 0.25})
    end
    combineMemoryFromBagsWithin()
    groupNameInput:setGroupNameToInputField()
    self.clearButtons()
    self.clearInputs()
    createMemoryActionButtons()
    local count = 0
    for guid in pairs(memoryList) do
        count = count + 1
        local obj = getObjectFromGUID(guid)
        if obj ~= nil then obj.highlightOff() end
    end
    broadcastToAll(count.." Objects Saved", {1,1,1})
    updateSave()
    moveGuid = nil
end

function buttonClick_add()
    fresh = false
    combineTables(memoryList, memoryListBackup)
    broadcastToAll("Adding internal bags and selections to existing memory", {0.25, 0.75, 0.25})
    combineMemoryFromBagsWithin()
    self.clearButtons()
    self.clearInputs()
    createMemoryActionButtons()
    local count = 0
    for guid in pairs(memoryList) do
        count = count + 1
        local obj = getObjectFromGUID(guid)
        if obj ~= nil then obj.highlightOff() end
    end
    broadcastToAll(count.." Objects Saved", {1,1,1})
    updateSave()
end

function buttonClick_remove()
    broadcastToAll("Removing Selected Entries From Memory", {1.0, 0.25, 0.25})
    self.clearButtons()
    self.clearInputs()
    createMemoryActionButtons()
    local count = 0
    for guid in pairs(memoryList) do
        count = count + 1
        memoryListBackup[guid] = nil
        local obj = getObjectFromGUID(guid)
        if obj ~= nil then obj.highlightOff() end
    end
    broadcastToAll(count.." Objects Removed", {1,1,1})
    memoryList = memoryListBackup
    updateSave()
end

function buttonClick_setNew()
    broadcastToAll("Setting new position relative to items in memory", {0.75, 0.75, 1})
    self.clearButtons()
    self.clearInputs()
    createMemoryActionButtons()
    local count = 0
    for _, obj in ipairs(getAllObjects()) do
        guid = obj.guid
        if memoryListBackup[guid] ~= nil then
            count = count + 1
            memoryListBackup[guid].bag_rotation = self.getRotation()
            memoryListBackup[guid].pos_type = position_type
            if position_type == "relative" then
                memoryListBackup[guid].pos = findOffsetDistance(self.getPosition(), obj.getPosition())
                memoryListBackup[guid].rot = findOffsetDistance(self.getRotation(), obj.getRotation())
            else
                memoryListBackup[guid].pos = obj.getPosition()
                memoryListBackup[guid].rot = obj.getRotation()
            end
            memoryListBackup[guid].lock = obj.getLock()
            memoryListBackup[guid].tint = obj.getColorTint()
        end
    end
    broadcastToAll(count.." Objects Saved", {1,1,1})
    memoryList = memoryListBackup
    updateSave()
end

--Resets bag to starting status
function buttonClick_reset()
    fresh = true
    memoryList = {}
    memoryGroupName:set(nil)
    self.clearButtons()
    self.clearInputs()
    createSetupButton()
    removeAllHighlights()
    broadcastToAll("Tool Reset", {1,1,1})
    updateSave()
end

--Changes between Relative Position and Absolute Position
function buttonClick_posType()
    if position_type == "relative" then
        for _, obj in ipairs(self.getButtons()) do
            if obj["label"] == "Rel. Pos." then
                self.editButton({index=obj.index, label="Abs. Pos."})
                break
            end
        end
        position_type="absolute"
    else
        for _, obj in ipairs(self.getButtons()) do
            if obj.label == "Abs. Pos." then
                self.editButton({index=obj.index, label="Rel. Pos."})
                break
            end
        end
        position_type="relative"
    end
end

--Sends objects from bag/table to their saved position/rotation
function buttonClick_place()
    if anyOtherBagsInMyGroupArePlaced() then
        recallOtherBagsInMyGroup()
        Wait.frames(_placeObjects, CONFIG.MEMORY_GROUP.FRAME_DELAY_BEFORE_PLACING_OBJECTS)
    else
        _placeObjects()
    end
end

function _placeObjects()
    local bagObjList = self.getObjects()
    for guid, entry in pairs(memoryList) do
        local obj = getObjectFromGUID(guid)
        local pos = {}
        local rot = {}
        if entry.pos_type == "relative" then
            local rotated_pos = Vector(entry.pos.x,entry.pos.y,entry.pos.z):rotateOver('y', findOffsetDistance(entry.bag_rotation, self.getRotation()).y)
            pos.x = self.getPosition().x + rotated_pos.x
            pos.y = self.getPosition().y + rotated_pos.y
            pos.z = self.getPosition().z + rotated_pos.z
            rot.x = self.getRotation().x + entry.rot.x
            rot.y = self.getRotation().y + entry.rot.y
            rot.z = self.getRotation().z + entry.rot.z
        else
            pos.x = entry.pos.x
            pos.y = entry.pos.y
            pos.z = entry.pos.z
            rot.x = entry.rot.x
            rot.y = entry.rot.y
            rot.z = entry.rot.z
        end
        if obj ~= nil then
            --If obj is out on the table, move it to the saved pos/rot
            obj.setPositionSmooth(pos)
            obj.setRotationSmooth(rot)
            obj.setLock(entry.lock)
            obj.setColorTint(entry.tint)
        else
            --If obj is inside of the bag
            for _, bagObj in ipairs(bagObjList) do
                if bagObj.guid == guid then
                    local item = self.takeObject({
                        guid=guid, position=pos, rotation=rot, smooth=false
                    })
                    item.setLock(entry.lock)
                    item.setColorTint(entry.tint)
                    break
                end
            end
        end
    end
    broadcastToAll("Objects Placed", {1,1,1})
end

--Recalls objects to bag from table
function buttonClick_recall()
    for guid, entry in pairs(memoryList) do
        local obj = getObjectFromGUID(guid)
        if obj ~= nil then self.putObject(obj) end
    end
    broadcastToAll("Objects Recalled", {1,1,1})
end
--[[ Button Triggers ]]---------------------------------------------------------

--[[
This object provides access to a variable stored on the "Global script".
The variable holds the GUIDs for every Ultimate Memory Bag in the scene.
Example:
{'805ebd', '35cc21', 'fc8886', 'f50264', '5f5f63'}
--]]
AllMemoryBagsInScene = {
    NAME_OF_GLOBAL_VARIABLE = "_UltimateMemoryBag_AllMemoryBagsInScene"
}

function AllMemoryBagsInScene:add(guid)
    local guids = Global.getTable(self.NAME_OF_GLOBAL_VARIABLE) or {}
    table.insert(guids, guid)
    Global.setTable(self.NAME_OF_GLOBAL_VARIABLE, guids)
end

function AllMemoryBagsInScene:getGuidList()
    return Global.getTable(self.NAME_OF_GLOBAL_VARIABLE) or {}
end

--[[ Memory Bag Groups ]]-------------------------------------------------------
--[[
Ultimate Memory Bags may be added to a named group, called a "memory group".
You can add a bag to a group through the bag's UI: "Setup" > "Group Name".
Only one bag from a group may have it's contents placed on the table at a time.
When "Place" is clicked on a bag, the other bags in it's memory group are recalled.
By default a memory bag is not in any group. It's memory group is "nil".
--]]

CONFIG = {
    MEMORY_GROUP = {
        -- This determines how many frames to wait before actually placing objects onto the table when the "Place" button is clicked.
        -- This gives the other bags time to recall their objects.
        -- The delay ONLY occurs if other bags have objects out.
        FRAME_DELAY_BEFORE_PLACING_OBJECTS = 30,
    },
}

memoryGroupName = {memoryBag=self}
function memoryGroupName:get()
    return self._name
end
function memoryGroupName:set(newName)
    GlobalMemoryGroups:unregisterBagInGroup(self:get(), self.memoryBag.getGUID())
    GlobalMemoryGroups:registerBagInGroup(newName, self.memoryBag.getGUID())

    if newName == "" then
        self._name = nil
    else
        self._name = newName
    end
end

-- Click the "Recall" button on all other bags in my memory group.
function recallOtherBagsInMyGroup()
    for _,bag in ipairs(getOtherBagsInMyGroup()) do
        bag.call('buttonClick_recall')
    end
end

-- Return "true" if another bag in my memory group has any objects out on the table.
function anyOtherBagsInMyGroupArePlaced()
    for _,bag in ipairs(getOtherBagsInMyGroup()) do
        local state = bag.call('areAnyOfMyObjectsPlaced')
        if state then return true end
    end

    return false
end

-- Return "true" if at least one object from this memory bag is out on the table.
function areAnyOfMyObjectsPlaced()
    for guid,_ in pairs(memoryList) do
        local obj = getObjectFromGUID(guid)
        if obj ~= nil then
            return true
        end
    end
    return false
end

function getOtherBagsInMyGroup()
    local bags = {}
    for bagGuid,_ in pairs(GlobalMemoryGroups:getGroup(memoryGroupName:get())) do
        if bagGuid ~= self.getGUID() then
            bag = getObjectFromGUID(bagGuid)
            -- "bag" is nill if it has been deleted since the last time onLoad() was called.
            if bag ~= nil then
                table.insert(bags, bag)
            end
        end
    end
    return bags
end


--[[
This object provides access to a variable stored on the "Global script".
The variable holds the names & guids of all memory bag groups.
The global variable is a table and holds data like this:
{
    'My First Group Name' = {
        '805ebd' = {},
        '35cc21' = {},
        'fc8886' = {},
    },
    'My Second Group Name' = {
        'f50264' = {},
        '5f5f63' = {},
    },
}
--]]
GlobalMemoryGroups = {
    NAME_OF_GLOBAL_VARIABLE = '_GlobalUltimateMemoryBagGroups',
}

-- Call me inside this script's "onLoad()" method!
function GlobalMemoryGroups:onLoad(myGuid)
    -- Create and initialize the global variable if it doesn't already exist:
    if self:_getGroups() == nil then
        self:_setGroups({})
    end
end

-- Return the GUIDs of all bags in the "groupName". The return value is a dictionary that maps [GUID -> empty table].
function GlobalMemoryGroups:getGroup(groupName)
    guids = self:_getGroups()[groupName] or {}
    return guids
end

-- Registers a bag in a memory group. Creates a new group if one doesn't exist.
function GlobalMemoryGroups:registerBagInGroup(groupName, bagGuid)
    if groupName == nil or groupName == "" then
        return
    end

    self:_tryCreateNewGroup(groupName)
    local groups = self:_getGroups()
    groups[groupName][bagGuid] = {}
    self:_setGroups(groups)
end

-- Removes this bag from the memory group.
function GlobalMemoryGroups:unregisterBagInGroup(groupName, bagGuid)
    local groups = self:_getGroups()
    local group = groups[groupName]
    if group ~= nil then
        group[bagGuid] = nil
        self:_setGroups(groups)
    end
end

-- Return the global variable, which is a table holding all memory group names & guids.
function GlobalMemoryGroups:_getGroups()
    return Global.getTable(self.NAME_OF_GLOBAL_VARIABLE)
end

-- Override the global variable (i.e. the entire table).
function GlobalMemoryGroups:_setGroups(newTable)
    Global.setTable(self.NAME_OF_GLOBAL_VARIABLE, newTable)
end

-- Add a new memory group named "groupName" to the global variable, if one doesn't already exist.
function GlobalMemoryGroups:_tryCreateNewGroup(groupName)
    local groups = self:_getGroups()
    if groups[groupName] == nil then
        groups[groupName] = {}
        self:_setGroups(groups)
    end
end


-- This object controls the "Group Name" input text field that is part of the bag's ingame UI.
groupNameInput = {
    greyedOutText = "Group Name",
    widthPerCharacter = 100,
    padding = 4,
    memoryBag=self,
}
function groupNameInput:create(optionalStartingValue)
    local effectiveText = optionalStartingValue or self.greyedOutText
    local width = self:computeWidth(effectiveText)

    self.memoryBag.createInput({
        label=self.greyedOutText,
        value=optionalStartingValue or nil,
        alignment=3, -- Center aligned
        input_function="groupNameInput_onCharacterTyped", function_owner=self.memoryBag,
        position={-2.1-btn_x_offset,btn_y_offset,0}, rotation={0,270,0}, width=width, height=350,
        font_size=250, color={0,0,0}, font_color={1,1,1},
    })
end
function groupNameInput:computeWidth(text)
    return (string.len(text) + self.padding) * self.widthPerCharacter
end
function groupNameInput:updatedWidth(text)
    self.memoryBag.editInput({
        index=0,
        width=self:computeWidth(text)
    })
end
function groupNameInput:onCharacterTyped(text, stillEditing)
    if stillEditing then
        self:updatedWidth(text)
    else
        if text == "" then
            self:updatedWidth(self.greyedOutText)
        end
    end
end
function groupNameInput_onCharacterTyped(memoryBag, playerColor, text, stillEditing)
    groupNameInput:onCharacterTyped(text, stillEditing)
end
function groupNameInput:setGroupNameToInputField()
    local inputFields = self.memoryBag.getInputs()
    if inputFields ~= nil then
        -- Get input field 0, which corresponds to the groupNameInput.
        -- Unfortunately "self.getInputs()" doesn't return the inputs in a guaranteed order.
        local nameField = nil
        for _,field in ipairs(inputFields) do
            if field.index == 0 then
                nameField = field
            end
        end

        memoryGroupName:set(nameField.value)
    end
end
--[[ Memory Bag Groups ]]-------------------------------------------------------

--[[ Utility functions ]]-------------------------------------------------------
function combineTables(first_table, second_table)
    for k,v in pairs(second_table) do first_table[k] = v end
end

function combineMemoryFromBagsWithin()
    local bagObjList = self.getObjects()
    for _, bagObj in ipairs(bagObjList) do
        local data = bagObj.lua_script_state
        if data ~= nil then
            local j = JSON.decode(data)
            if j ~= nil and j.ml ~= nil then
                for guid, entry in pairs(j.ml) do
                    memoryList[guid] = entry
                end
            end
        end
    end
end

--Find delta (difference) between 2 x/y/z coordinates
function findOffsetDistance(p1, p2, obj)
    local xOffset = 0
    local yOffset = 0
    local zOffset = 0
    if obj ~= nil then
        local bounds = obj.getBounds()
        yOffset = (bounds.size.y - bounds.offset.y)
    end
    local deltaPos = {}
    deltaPos.x = (p2.x-p1.x)
    deltaPos.y = (p2.y-p1.y) + yOffset
    deltaPos.z = (p2.z-p1.z)
    return deltaPos
end

--Coroutine delay, in seconds
function wait(time)
    local start = os.time()
    repeat coroutine.yield(0) until os.time() > start + time
end

--Duplicates a table (needed to prevent it making reference to the same objects)
function duplicateTable(oldTable)
    local newTable = {}
    for k, v in pairs(oldTable) do
        newTable[k] = v
    end
    return newTable
end

--Moves scripted highlight from all objects
function removeAllHighlights()
    for _, obj in ipairs(getAllObjects()) do
        obj.highlightOff()
    end
end

--Round number (num) to the Nth decimal (dec)
function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

--Converts to string any object
function table_print(tt, indent, done)
    done = done or {}
    indent = indent or 0
    if type(tt) == 'table' then
        local sb = {}
        for key, value in pairs (tt) do
            table.insert(sb, string.rep (" ", indent)) -- indent it
            if type (value) == "table" and not done [value] then
                done [value] = true
                table.insert(sb, key .. " = {\n");
                table.insert(sb, table_print(value, indent + 2, done))
                table.insert(sb, string.rep (" ", indent)) -- indent it
                table.insert(sb, "}\n");
            elseif "number" == type(key) then
                table.insert(sb, string.format("\"%s\"\n", tostring(value)))
            else
                table.insert(sb, string.format("%s = \"%s\"\n", tostring (key), tostring(value)))
            end
        end
        return table.concat(sb)
    else
        return tt .. "\n"
    end
end
function toStr(o)
    if "nil" == type(o) then
        return tostring(nil)
    elseif "table" == type(o) then
        return table_print(o,2)
    elseif "string" == type(o) then
        return o
    else
        return tostring(o)
    end
end
--[[ Utility functions ]]-------------------------------------------------------
