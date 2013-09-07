"use strict";

var test = {
	template: "block a\n\tfail\nblock a",
	expected: function(error, output) {
		if(!error || error.message !== "A block named “a” already exists in this context at line 3, character 7.") {
			return "Expected block duplication error";
		}
	}
};

module.exports = test;
