--This is the basic distance from the tool a die is spawned
--This number scales with the scale of the tool
distanceFromTool = 3
--This is the option to collect the dice into ascending order
organizeDice = false

--Enables or disables auto-cleanup
-- -1 is off, 0 is no delay, and 1+ is a delay of that many seconds
autoCleanDelay = -1


--End of variables to edit unless you know how to script

function onSave()
    local data_to_save = {['hmd']=howManyDice, ['pr']=printResults}
    saved_data = JSON.encode(data_to_save)
    --saved_data = ""
    return saved_data
end

function onload(saved_data)
    if saved_data ~= "" then
        local loaded_data = JSON.decode(saved_data)
        --Set up information off of loaded_data
        howManyDice = loaded_data.hmd
        printResults = loaded_data.pr
    else
        --Set up information for if there is no saved saved data
        howManyDice = 0
        printResults = false
    end

    math.randomseed(os.time())
    diceBeingRolled = {}
    clearLock = false
    rollLock = false

    createDisplayAndFunctionButtons()
end


--Rolling


--Activates rolling process
function buttonClick_roll(_, rollerColor)
    local dieOnPad = findDieOnPad()
    if dieOnPad ~= nil then
        if rollLock == false then
            --Destroys old dice
            buttonClick_clear(_, rollerColor)
            --Spawns and rolls new nice
            rollThisDieType(dieOnPad, rollerColor)
        else
            broadcastToColor("Please wait until the dice come to a complete stop before rolling again.", rollerColor, {1,1,1})
        end
    else
        broadcastToColor("Place the die type you want to roll onto the pad and try again.", rollerColor, {1,1,1})
    end
end

function rollThisDieType(dieOnPad, rollerColor)
    function coroutine_rolling()
		savedDice = howManyDice
		if howManyDice > 0 then howManyDice = 2 + howManyDice end
		if howManyDice < 0 then howManyDice = 2 - howManyDice end
		if howManyDice == 0 then howManyDice = 2 end
        diceBeingRolled = {}
        clearLock = true
        rollLock = true
        local angle = 360/howManyDice
		diceToRoll = 2
        for i=1, howManyDice do
            local pos = findGlobalPosWithLocalDirection(self, distanceFromTool*self.getScale().x, angle*(i-1))
            --Makes a duplicate of the die on the pad
            local die = dieOnPad.clone({position=pos})
            table.insert(diceBeingRolled, die)
            --Gives it a random rotation and waits 1 frame for it to happen
            die.setRotation(randomRotation())
            coroutine.yield(0) coroutine.yield(0) coroutine.yield(0)

            --Apply some rotational force in a random direction
            --die.addTorque(randomRotation,2())
            die.roll()

            wait(0.05)
        end
        watchForDiceToStop(rollerColor)
        return 1
    end
    startLuaCoroutine(self, "coroutine_rolling")
	howManyDice = savedDice
end

function watchForDiceToStop(rollerColor)
    function coroutine_placing()
        dieValueTable, rollString, totalRollValue = {}, "", 0
		dieTable = {}
        local angle = 360/howManyDice
        --Wait for dice to stop moving after their roll
        for _, die in ipairs(diceBeingRolled) do
            while die.resting == false do
                coroutine.yield(0)
            end
            local rollValue = die.getValue()
            totalRollValue = totalRollValue + rollValue
            table.insert(dieValueTable, {die=die, val=rollValue})
			table.insert(dieTable, rollValue)
        end
        --Sort the dice by their .getValue() in ascending order
        local sort_func = function(a,b) return a.val < b.val end
        table.sort(dieValueTable, sort_func)
        --Move the dice into order and/or prints
        for i, entry in ipairs(dieValueTable) do
            --Organizes dice
            if organizeDice == true then
                local pos = findGlobalPosWithLocalDirection(self, distanceFromTool*self.getScale().x, angle*(i-1))
                pos.y = pos.y + 0.5
                entry.die.setPositionSmooth(pos)
            end
            --Assembles print values
            if i ~= 1 then rollString = rollString .. ", " end
            rollString = rollString .. entry.val
        end
		lowRoll = 0
		highRoll = 0
		table.sort(dieTable)
		lowRoll = dieTable[1] + dieTable[2]
		highRoll = dieTable[#dieTable] + dieTable[#dieTable -1]
        rollString = rollString .. "   TOTAL: " .. totalRollValue
		if howManyDice >= 0 then rollString = "   HIGH : " .. highRoll end
		if howManyDice < 0 then rollString = "   LOW : " .. lowRoll end
        if printResults == true then
            broadcastToAll(Player[rollerColor].steam_name .. " rolled: " .. rollString, stringColorToRGB(rollerColor))
        end

        clearLock = false
        rollLock = false

        if autoCleanDelay ~= -1 then
            Timer.create({
                identifier="uniqueDelayName"..self.getGUID(),
                delay=autoCleanDelay, function_owner=self, function_name="autoClearTimerFunction"
            })
        end

        return 1
    end
    startLuaCoroutine(self, "coroutine_placing")
end


--Printing


--Enables/disables printing of results
function buttonClick_print()
    if printResults == false then printResults = true
    else printResults = false
    end
    local printStatus = "ON"
    if printResults == false then printStatus = "OFF" end
    self.editButton({index=2, label=printStatus})
end


--Clearing


--Clears rolled dice when called
function buttonClick_clear(_, rollerColor)
    --This line kills and delayed auto-cleanup that might be pending
    Timer.destroy("uniqueDelayName"..self.getGUID())

    if clearLock == false then
        for _, die in ipairs(diceBeingRolled) do
            if die ~= nil then
                destroyObject(die)
            end
        end
    else
        broadcastToColor("Please do not hit clear until dice come to a complete stop.", rollerColor, {1,1,1})
    end
end

--Timer function which triggers clear when acitvated
function autoClearTimerFunction()
    buttonClick_clear()
end


--Plus and Minus buttons


--Adds to counter (how many to roll)
function buttonClick_plus()
    howManyDice = howManyDice + 1
    if howManyDice > 0 then
 self.editButton({index=0, label="+" .. howManyDice}) end
    if howManyDice < 0 then
 self.editButton({index=0, label=howManyDice}) end
    if howManyDice == 0 then
 self.editButton({index=0, label="0"})
 end
end

--Subtracts from counter (how many to roll)
function buttonClick_minus()
    howManyDice = howManyDice - 1
    if howManyDice > 0 then
 self.editButton({index=0, label="+" .. howManyDice}) end
    if howManyDice < 0 then
 self.editButton({index=0, label=howManyDice}) end
    if howManyDice == 0 then
 self.editButton({index=0, label="0"})
 end
end


--Info finding utility


--Cast to check for object on pad.
function findDieOnPad()
    local pos = self.getPosition()
    local objectsInArea = Physics.cast({
        origin=pos, type=2, size={0.2,0.1,0.2},
        direction={0,1,0}, max_distance=3
    })
    for _, entry in ipairs(objectsInArea) do
        if entry.hit_object.tag == "Dice" then
            return entry.hit_object
        end
    end
    return nil
end

--Finds linear distance on the x/z axis between object and position
function findProximity(targetPos, object)
    local objectPos = object.getPosition()
    local xDistance = math.abs(targetPos.x - objectPos.x)
    local zDistance = math.abs(targetPos.z - objectPos.z)
    local distance = xDistance^2 + zDistance^2
    return math.sqrt(distance)
end

--Finds a position, rotated around the Y axis, using distance you want + angle
--oPos is object pos, oRot=object rotation, distance = how far, angle = angle in degrees
function findGlobalPosWithLocalDirection(object, distance, angle)
    local oPos, oRot = object.getPosition(), object.getRotation()
	local posX = oPos.x + math.sin( math.rad(angle+oRot.y) ) * distance
	local posY = oPos.y
	local posZ = oPos.z + math.cos( math.rad(angle+oRot.y) ) * distance
	return {x=posX, y=posY, z=posZ}
end

--Gets a random rotation vector
function randomRotation()
    --Credit for this function goes to Revinor (forums)
    --Get 3 random numbers
    local u1 = math.random();
    local u2 = math.random();
    local u3 = math.random();
    --Convert them into quats to avoid gimbal lock
    local u1sqrt = math.sqrt(u1);
    local u1m1sqrt = math.sqrt(1-u1);
    local qx = u1m1sqrt *math.sin(2*math.pi*u2);
    local qy = u1m1sqrt *math.cos(2*math.pi*u2);
    local qz = u1sqrt *math.sin(2*math.pi*u3);
    local qw = u1sqrt *math.cos(2*math.pi*u3);
    --Apply rotation
    local ysqr = qy * qy;
    local t0 = -2.0 * (ysqr + qz * qz) + 1.0;
    local t1 = 2.0 * (qx * qy - qw * qz);
    local t2 = -2.0 * (qx * qz + qw * qy);
    local t3 = 2.0 * (qy * qz - qw * qx);
    local t4 = -2.0 * (qx * qx + ysqr) + 1.0;
    --Correct
    if t2 > 1.0 then t2 = 1.0 end
    if t2 < -1.0 then ts = -1.0 end
    --Convert back to X/Y/Z
    local xr = math.asin(t2);
    local yr = math.atan2(t3, t4);
    local zr = math.atan2(t1, t0);
    --Return result
    return {math.deg(xr+1),math.deg(yr+1),math.deg(zr+1)}
end

--Wait, used with corotuine
function wait(time)
    local start = os.time()
    repeat coroutine.yield(0) until os.time() > start + time
end



--Button creation


--For print/roll, used 2 buttons, 1 display and 1 hidden for functionality
--
function createDisplayAndFunctionButtons()
    --Number display
    local params = {
        label=howManyDice, click_function="buttonClick_roll",
        function_owner=self, position={0,0.1,1.25}, height=0, width=0,
        font_size=320, font_color=Color.White
    }
    self.createButton(params)--display
    params.label, params.height, params.width, params.color = "", 350, 350, {0,0,0,0}
    self.createButton(params)--function

    --Clear
    params = {
        click_function="buttonClick_clear", function_owner=self,
        position={0,0.1,-1.25}, height=350, width=350, color={1,1,1,0}
    }
    self.createButton(params)

    --Plus and Minus buttons
    params={function_owner=self, height=350, width=350, color={0,0,0,0}}
    params.click_function, params.position = "buttonClick_minus", {-1.25,0.1,0}
    self.createButton(params)--function
    params.click_function, params.position = "buttonClick_plus", {1.25,0.1,0}
    self.createButton(params)--function
end