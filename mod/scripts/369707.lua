-- FTC-GUID: 369707
-- Table Theme overlay.
--
-- Anchored on a hidden BlockSquare left of the mat. It shows one swatch per
-- table theme; clicking a swatch forwards to startMenu's setMatTexture<i>,
-- which owns the texture list and the swap.

-- Lifts the panel off the block's face (the THIRD number of the UI `position`,
-- i.e. perpendicular to a face-up tile). Higher = panel further above the table.
-- The block itself is parked under the table (negative posY in the save); this
-- lift is what brings the panel back up to a readable height.
UI_VERTICAL_LIFT = -150

function onLoad()
    -- Small delay so startMenu has registered its functions regardless of
    -- onLoad ordering.
    Wait.time(buildFilterUI, 1)
end

-- Uniform scale applied to the whole panel (1.0 = native size).
FILTER_SCALE = 2.0

-- Panel width, kept at the width the old two-column creator grid used so the
-- theme swatches keep their proven geometry.
FILTER_COLUMNS = 2
FILTER_CELL_W = 375
FILTER_SPACING = 8

START_MENU_GUID = "738804"

function startMenuObj() return getObjectFromGUID(START_MENU_GUID) end

-- Panel geometry.
MAT_RANDO_TITLE_H = 63   -- "Table Theme" heading
MAT_RANDO_RULE_H = 4     -- thin rule under the heading
MAT_RANDO_PAD = 14
MAT_RANDO_SPACING = 7

-- Table Theme swatches. These mirror startMenu's `matTextures` table (same order):
-- the button labels are the texture names and the button colors approximate each
-- texture's RGB so the swatch reads as that theme. `colorOn` is a brightened version
-- used to highlight the active swatch. Clicking one forwards to startMenu's
-- setMatTexture<i>, which owns the swap (it holds matTextures + the selected index).
-- The list order here MUST stay in sync with matTextures over there.
TABLE_THEMES = {
    {label = "Green",      color = "#004F08", colorOn = "#22C235"},
    {label = "Blue",       color = "#004F70", colorOn = "#27A3D6"},
    {label = "Grey",       color = "#616657", colorOn = "#AEB4A0"},
    {label = "Purple",     color = "#5C4269", colorOn = "#A077B8"},
    {label = "Twilight",   color = "#3A2433", colorOn = "#86577A"},
    {label = "Carbon",     color = "#262626", colorOn = "#707070"},
    {label = "Space",      color = "#1A1F3A", colorOn = "#4A5699"},
    {label = "Wood",       color = "#693B1F", colorOn = "#C2703A"},
    {label = "Space 2",    color = "#161C2A", colorOn = "#4C6482"},
    {label = "Green 2",    color = "#2A5A1A", colorOn = "#5AC23A"},
    {label = "Stripes",    color = "#4A4A52", colorOn = "#9A9AA8"},
    {label = "Yellow",     color = "#7A6810", colorOn = "#E0C32A"},
}
-- How many swatches per row in the theme grid. With many themes a single row makes
-- the labels unreadable, so they wrap across rows.
TABLE_THEME_COLUMNS = 4
TABLE_THEME_CELL_H = 70
THEME_GRID_SPACING = 10

-- Currently-selected theme index, read from startMenu so the panel can mark the
-- active swatch. 0 if the menu isn't ready (nothing marked).
function currentTableThemeIndex()
    local sm = startMenuObj()
    if sm then
        local ok, idx = pcall(function() return sm.call("matTextureSelectedIndex") end)
        if ok and type(idx) == "number" then return idx end
    end
    return 0
end

-- Required content height: heading, rule and the wrapped swatch grid. A smaller
-- box would make VerticalLayout squeeze the bare <Text> heading toward zero.
function themePanelMinHeight()
    local themeRows = math.ceil(#TABLE_THEMES / TABLE_THEME_COLUMNS)
    local themeGridH = themeRows * (TABLE_THEME_CELL_H + THEME_GRID_SPACING)
    local children = {MAT_RANDO_TITLE_H, MAT_RANDO_RULE_H, themeGridH}
    local total = 2 * MAT_RANDO_PAD + MAT_RANDO_SPACING * (#children - 1)
    for _, h in ipairs(children) do total = total + h end
    return total
end

function buildFilterUI()
    local width = FILTER_COLUMNS * FILTER_CELL_W
        + (FILTER_COLUMNS - 1) * FILTER_SPACING + 28
    local height = themePanelMinHeight()

    -- Table Theme swatches: one button per theme, wrapped into a fixed-column grid so
    -- the labels stay readable as the list grows (a single row squeezes them too thin).
    -- The active theme is painted in its brighter `colorOn` so you can see the selection.
    local selectedTheme = currentTableThemeIndex()
    local themeCells = {}
    for i, theme in ipairs(TABLE_THEMES) do
        local color = (i == selectedTheme) and theme.colorOn or theme.color
        themeCells[#themeCells + 1] = string.format(
            '<Button id="theme%d" onClick="onTableThemeSwatch" color="%s" textColor="#FFFFFF" '
            .. 'fontSize="30">%s</Button>',
            i, color, theme.label)
    end
    -- Cell width = the inner content width (panel width minus the L/R padding) split
    -- across the columns, with the inter-cell spacing removed. Height reserved is the
    -- number of wrapped rows times (cell + spacing).
    local themeSpacing = THEME_GRID_SPACING
    local themeInnerW = width - 2 * MAT_RANDO_PAD
    local themeCellW = math.floor(
        (themeInnerW - (TABLE_THEME_COLUMNS - 1) * themeSpacing) / TABLE_THEME_COLUMNS)
    local themeRows = math.ceil(#TABLE_THEMES / TABLE_THEME_COLUMNS)
    local themeGridH = themeRows * (TABLE_THEME_CELL_H + themeSpacing)
    local themeRow = string.format(
        '<GridLayout cellSize="%d %d" spacing="%d %d" constraint="FixedColumnCount" '
        .. 'constraintCount="%d" preferredHeight="%d" flexibleHeight="0">\n%s\n</GridLayout>',
        themeCellW, TABLE_THEME_CELL_H, themeSpacing, themeSpacing,
        TABLE_THEME_COLUMNS, themeGridH, table.concat(themeCells, "\n"))
    local xml = string.format(
        '<VerticalLayout position="0 0 %d" rotation="0 0 0" scale="%s %s 1" width="%d" height="%d" '
        .. 'padding="%d %d %d %d" spacing="%d" color="#101015E6" childForceExpandHeight="false">\n'
        .. '<Text fontSize="44" color="#FFFFFF" preferredHeight="%d" flexibleHeight="0">Table Theme</Text>\n'
        .. '<Panel preferredHeight="%d" color="#FFFFFF40" flexibleHeight="0" />\n'
        .. '%s\n'
        .. '</VerticalLayout>',
        UI_VERTICAL_LIFT, FILTER_SCALE, FILTER_SCALE, width, height,
        MAT_RANDO_PAD, MAT_RANDO_PAD, MAT_RANDO_PAD, MAT_RANDO_PAD, MAT_RANDO_SPACING,
        MAT_RANDO_TITLE_H, MAT_RANDO_RULE_H, themeRow)
    self.UI.setXml(xml)
end

-- Table Theme swatch: button id is "theme<i>", forwarding to startMenu's
-- setMatTexture<i> (which owns the swatch list + swap). Rebuild afterwards so the
-- highlight moves to the newly selected swatch.
function onTableThemeSwatch(player, value, id)
    local sm = startMenuObj()
    if not sm then return end
    sm.call("setMatTexture" .. string.match(id, "%d+"))
    buildFilterUI()
end
