"use strict";

var parser = require("./parser");
var compiler = require("./compiler");

function combine() {
	var result = {};

	for (var i = 0; i < arguments.length; i++) {
		var obj = arguments[i];

		for (var k in obj) {
			if (obj.hasOwnProperty(k)) {
				result[k] = obj[k];
			}
		}
	}

	return result;
}

var defaults = {
	debug: false,
	name: "<Razor Leaf template>",
};

function compile(template, options) {
	options = combine(defaults, options);

	var tree = parser.parse(template, options);
	return compiler.compile(tree, options);
}

exports.compile = compile;
exports.defaults = defaults;
