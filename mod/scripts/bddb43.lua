function onLoad(save_state)
	createUserInterface()
end

function createUserInterface()
	self.createButton({
		label          = "HL", 
		click_function = "goToHL", 
		function_owner = self,
		tooltip        = "HL",
		position       = {1.7,0.1,-1.5}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 200,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "TP", 
		click_function = "goToTP", 
		function_owner = self,
		tooltip        = "TP",
		position       = {1.7,0.1,-0.9}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 200,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "IS", 
		click_function = "goToIS", 
		function_owner = self,
		tooltip        = "IS",
		position       = {1.7,0.1,-0.3}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 200,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "NA", 
		click_function = "goToNA", 
		function_owner = self,
		tooltip        = "NA",
		position       = {1.7,0.1,0.3}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 200,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "BG", 
		click_function = "goToBG", 
		function_owner = self,
		tooltip        = "BG",
		position       = {1.7,0.1,0.9}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 200,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "C7S", 
		click_function = "goToC7S", 
		function_owner = self,
		tooltip        = "C7S",
		position       = {1.7,0.1,1.5}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 200,
		font_size      = 100, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Cover", 
		click_function = "goToCover", 
		function_owner = self,
		tooltip        = "Cover",
		position       = {-0.4,0.1,-2.3}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 350,
		font_size      = 80, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
		self.createButton({
		label          = "Art", 
		click_function = "goToArt", 
		function_owner = self,
		tooltip        = "Art",
		position       = {0.5,0.1,-2.3}, 
		rotation       = {0,0,0}, 
		height         = 200, 
		width          = 300,
		font_size      = 80, 
		color          = {1,1,1}, 
		font_color     = {0,0,0}
	})
end




function goToCover(clicked_obj,player_color)
	self.Book.setPage(0) 
end

function goToArt(clicked_obj,player_color)
	self.Book.setPage(281) 
end

function goToHL(clicked_obj,player_color)
	self.Book.setPage(3) 
end

function goToTP(clicked_obj,player_color)
	self.Book.setPage(49) 
end

function goToIS(clicked_obj,player_color)
	self.Book.setPage(85) 
end

function goToNA(clicked_obj,player_color)
	self.Book.setPage(135) 
end

function goToBG(clicked_obj,player_color)
	self.Book.setPage(191) 
end

function goToC7S(clicked_obj,player_color)
	self.Book.setPage(229) 
end