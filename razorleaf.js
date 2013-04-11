"use strict";

var compiler = require("./lib/compiler");
var parser = require("./lib/parser");
var __utilities = require("./lib/template-utilities");

var defaults = {
	load: function() {
		throw new Error("load callback must be specified to include subtemplates.");
	}
};

function combine() {
	var combined = {};

	for(var i = 0; i < arguments.length; i++) {
		var obj = arguments[i];

		for(var k in obj) {
			if(obj.hasOwnProperty(k)) {
				combined[k] = obj[k];
			}
		}
	}

	return combined;
}

function compile(template, options) {
	options = combine(defaults, options);

	var tree = parser.parse(template, options);
	var code = compiler.compile(tree);

	return eval("(function(data) {\n" + code + "\n})");
}

module.exports.compile = compile;
module.exports.defaults = defaults;
