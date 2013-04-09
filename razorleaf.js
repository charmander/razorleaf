"use strict";

var compiler = require("./compiler");
var parser = require("./parser");

function compile(template) {
	var tree = parser.parse(template);
	var code = compiler.compile(tree);

	return new Function("data", code);
}

module.exports.compile = compile;
