"use strict";

var includes = {
	a: "include b",
	b: "extends a"
};

var test = {
	template: "extends a",
	expected: function(error, output) {
		if(!error || error.message !== "Circular extension: ⤷ a → b ⤴") {
			return "Expected circular extension error";
		}
	},
	options: {
		include: function(name) {
			return includes[name];
		}
	}
};

module.exports = test;
