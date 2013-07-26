"use strict";

var test = {
	template: "% var x = 20;\n% if(x % 5 === 0)\n\t\"#{x}\"\n% else\n\t\"Not a multiple of 5\"",
	expected: function(error, output) {
		if(output !== "20") {
			return "Expected code blocks with content to become blocks without output in between";
		}
	},
	options: {
		include: function(name) {
			return includes[name];
		}
	}
};

module.exports = test;
