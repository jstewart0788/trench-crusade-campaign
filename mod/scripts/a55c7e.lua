function onLoad(save_state)
	createUserInterface()
end

function createUserInterface()
	self.createButton({
		label          = "Table of Contents", 
		click_function = "goToToC", 
		function_owner = self,
		tooltip        = "Table of Contents",
		position       = {-2.5,0.1,-1.87500}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
	self.createButton({
		label          = "Keywords", 
		click_function = "goToKW", 
		function_owner = self,
		tooltip        = "Keywords",
		position       = {-2.5,0.1,-1.5875}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "New Antioch", 
		click_function = "goToNA", 
		function_owner = self,
		tooltip        = "New Antioch", 
		position       = {-2.5,0.1,-1.3}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "NA Variants", 
		click_function = "goToNAv", 
		function_owner = self,
		tooltip        = "NA Variants",
		position       = {-2.5,0.1,-1.0125}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "Trench Pilgrims", 
		click_function = "goToTP", 
		function_owner = self,
		tooltip        = "Trench Pilgrims",
		position       = {-2.5,0.1,-0.725}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "TP Variants", 
		click_function = "goToTPv", 
		function_owner = self,
		tooltip        = "Injury Table",
		position       = {-2.5,0.1,-0.4375}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "Iron Sultanate", 
		click_function = "goToIS", 
		function_owner = self,
		tooltip        = "Keywords",
		position       = {-2.5,0.1,-0.15}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "IS Variants", 
		click_function = "goToISv", 
		function_owner = self,
		tooltip        = "IS Variants",
		position       = {-2.5,0.1,0.1375}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "Heretic Legion", 
		click_function = "goToHL", 
		function_owner = self,
		tooltip        = "Heretic Legion",
		position       = {-2.5,0.1,0.425}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
	self.createButton({
		label          = "HL Variants", 
		click_function = "goToHLv", 
		function_owner = self,
		tooltip        = "HL Variants",
		position       = {-2.5,0.1,0.7125}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "Black Grail", 
		click_function = "goToBG", 
		function_owner = self,
		tooltip        = "Black Grail",
		position       = {-2.5,0.1,1}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "BG Variant", 
		click_function = "goToBGv", 
		function_owner = self,
		tooltip        = "BG Variants",
		position       = {-2.5,0.1,1.2875}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "The Court", 
		click_function = "goToC7S", 
		function_owner = self,
		tooltip        = "The Court",
		position       = {-2.5,0.1,1.575}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
		self.createButton({
		label          = "Mercenaries", 
		click_function = "goToMercs", 
		function_owner = self,
		tooltip        = "Mercenaries",
		position       = {-2.5,0.1,1.8625}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {0,0,0}, 
		font_color     = {1,1,1}
	})
end

function goToToC(clicked_obj,player_color)
	self.Book.setPage(3) 
end

function goToKW(clicked_obj,player_color)
	self.Book.setPage(14) 
end

function goToNA(clicked_obj,player_color)
	self.Book.setPage(19) 
end

function goToNAv(clicked_obj,player_color)
	self.Book.setPage(33) 
end

function goToTP(clicked_obj,player_color)
	self.Book.setPage(45) 
end

function goToTPv(clicked_obj,player_color)
	self.Book.setPage(59) 
end

function goToIS(clicked_obj,player_color)
	self.Book.setPage(69) 
end

function goToISv(clicked_obj,player_color)
	self.Book.setPage(87) 
end

function goToHL(clicked_obj,player_color)
	self.Book.setPage(101) 
end

function goToHLv(clicked_obj,player_color)
	self.Book.setPage(116) 
end

function goToBG(clicked_obj,player_color)
	self.Book.setPage(123) 
end

function goToBGv(clicked_obj,player_color)
	self.Book.setPage(139) 
end

function goToC7S(clicked_obj,player_color)
	self.Book.setPage(142) 
end

function goToMercs(clicked_obj,player_color)
	self.Book.setPage(170) 
end