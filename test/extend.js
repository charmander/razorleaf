"use strict";

var includes = {
	b: "block example\n\t\"Incorrect\""
};

var test = {
	template: "extends b\nblock example\n\t\"Correct\"\n\"Error\"",
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
