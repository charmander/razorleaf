"use strict";

var includes = {
	b: "block example\n\t\"Incorrect\""
};

var test = {
	template: "extends b\nreplace example\n\t\"Correct\"",
	expected: function(error, output) {
		if(output !== "Correct") {
			return "Expected child block to replace parent block";
		}
	},
	options: {
		include: function(name) {
			return includes[name];
		}
	}
};

module.exports = test;
