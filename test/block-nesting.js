"use strict";

var includes = {
	a: "extends b\nreplace a\n\tblock b\n\t\t\"Incorrect\"",
	b: "block a"
};

var test = {
	template: "extends a\nreplace b\n\t\"This is valid.\"",
	expected: function(error, output) {
		if(output !== "This is valid.") {
			return "Expected introduced nested block to be present in the output";
		}
	},
	options: {
		include: function(name) {
			return includes[name];
		}
	}
};

module.exports = test;
