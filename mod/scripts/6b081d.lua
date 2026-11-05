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
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
	self.createButton({
		label          = "Core Rules", 
		click_function = "goToCore", 
		function_owner = self,
		tooltip        = "Core Rules",
		position       = {-2.5,0.1,-1.5875}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Comprehensive Rules", 
		click_function = "goToComp", 
		function_owner = self,
		tooltip        = "Comprehensive Rules",
		position       = {-2.5,0.1,-1.3}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Movement", 
		click_function = "goToMove", 
		function_owner = self,
		tooltip        = "Movement",
		position       = {-2.5,0.1,-1.0125}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Combat", 
		click_function = "goToCombat", 
		function_owner = self,
		tooltip        = "Combat",
		position       = {-2.5,0.1,-0.725}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Injury Table", 
		click_function = "goToInjury", 
		function_owner = self,
		tooltip        = "Injury Table",
		position       = {-2.5,0.1,-0.4375}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Keywords", 
		click_function = "goToKW", 
		function_owner = self,
		tooltip        = "Keywords",
		position       = {-2.5,0.1,-0.15}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Battlekit", 
		click_function = "goToKit", 
		function_owner = self,
		tooltip        = "Battlekit",
		position       = {-2.5,0.1,0.1375}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Campaign Phase", 
		click_function = "goToCamp", 
		function_owner = self,
		tooltip        = "Campaign Phase",
		position       = {-2.5,0.1,0.425}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
	self.createButton({
		label          = "Trauma Table", 
		click_function = "goToTrauma", 
		function_owner = self,
		tooltip        = "Trauma Table",
		position       = {-2.5,0.1,0.7125}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Skills Tables", 
		click_function = "goToSkills", 
		function_owner = self,
		tooltip        = "Skills Tables",
		position       = {-2.5,0.1,1}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Exploration Tables", 
		click_function = "goToExplore", 
		function_owner = self,
		tooltip        = "Exploration Tables",
		position       = {-2.5,0.1,1.2875}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Glory Items", 
		click_function = "goToGlory", 
		function_owner = self,
		tooltip        = "Glory Items",
		position       = {-2.5,0.1,1.575}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Scenarios", 
		click_function = "goToScen", 
		function_owner = self,
		tooltip        = "Scenarios",
		position       = {-2.5,0.1,1.86250}, 
		rotation       = {0,0,0}, 
		height         = 100, 
		width          = 1000,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
end

function goToToC(clicked_obj,player_color)
	self.Book.setPage(3) 
end

function goToCore(clicked_obj,player_color)
	self.Book.setPage(13) 
end

function goToInjury(clicked_obj,player_color)
	self.Book.setPage(47) 
end

function goToComp(clicked_obj,player_color)
	self.Book.setPage(21) 
end

function goToMove(clicked_obj,player_color)
	self.Book.setPage(34) 
end

function goToCombat(clicked_obj,player_color)
	self.Book.setPage(41) 
end

function goToKW(clicked_obj,player_color)
	self.Book.setPage(51) 
end

function goToKit(clicked_obj,player_color)
	self.Book.setPage(66) 
end

function goToCamp(clicked_obj,player_color)
	self.Book.setPage(98) 
end

function goToTrauma(clicked_obj,player_color)
	self.Book.setPage(100) 
end

function goToSkills(clicked_obj,player_color)
	self.Book.setPage(105) 
end

function goToExplore(clicked_obj,player_color)
	self.Book.setPage(114) 
end

function goToGlory(clicked_obj,player_color)
	self.Book.setPage(123) 
end

function goToScen(clicked_obj,player_color)
	self.Book.setPage(142) 
end