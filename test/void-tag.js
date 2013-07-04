"use strict";

var test = {
	template: "meta charset: \"utf-8\"\n\tinvalid",
	expected: function(error, output) {
		if(!error || error.message !== "An element here is not valid at line 2, character 2.") {
			return "Expected content inside void element error";
		}
	},
	options: {
		include: function(name) {
			return includes[name];
		}
	}
};

module.exports = test;
