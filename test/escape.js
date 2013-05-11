"use strict";

var test = {
	template: '"\n\\"\'\\\'\\\\\\"\\\\" " \\#{##{{\\}}"',
	expected: function(error, output) {
		if(output !== "\n\"''\\\"\\ #{#[object Object]") {
			return "Expected backslashes to escape quotes and interpolation";
		}
	}
};

module.exports = test;
