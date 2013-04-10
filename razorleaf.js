"use strict";

var compiler = require("./lib/compiler");
var parser = require("./lib/parser");
var __utilities = require("./lib/template-utilities");

function compile(template) {
	var tree = parser.parse(template);
	var code = compiler.compile(tree);

	return eval("(function(data) {\n" + code + "\n})");
}

module.exports.compile = compile;
