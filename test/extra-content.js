"use strict";

var test = {
	template: "extends a\nfail",
	expected: function(error, output) {
		if(!error || error.message !== "An element here is not valid at line 2, character 1.") {
			return "Expected content outside block error";
		}
	},
	options: {
		include: function(name) {
			return "";
		}
	}
};

module.exports = test;
