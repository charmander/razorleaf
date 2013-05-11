"use strict";

var includes = {
	a: "include b",
	b: "include a"
};

var test = {
	template: "include a",
	expected: function(error, output) {
		if(!error || error.message !== "Circular inclusion: ⤷ a → b ⤴") {
			return "Expected circular inclusion error";
		}
	},
	options: {
		include: function(name) {
			return includes[name];
		}
	}
};

module.exports = test;
