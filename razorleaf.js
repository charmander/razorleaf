"use strict";

var compiler = require("./compiler");
var parser = require("./parser");
var __utilities = require("./template-utilities");

function compile(template) {
	var tree = parser.parse(template);
	var code = compiler.compile(tree);

	return eval("(function(data) {\n" + code + "\n})");
}

module.exports.compile = compile;
