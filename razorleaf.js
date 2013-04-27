"use strict";

var parser = require("./parser");
var compiler = require("./compiler");

function loadIncludes(tree, visited, options) {
	tree.includes.forEach(function(include) {
		if(visited.indexOf(include.template) !== -1) {
			throw new Error("Circular inclusion: ⤷ " + visited.slice(visited.indexOf(include.template)).join(" → ") + " ⤴");
		}

		var includeTree = parser.parse(options.include(include.template));

		visited.push(include.template);
		loadIncludes(includeTree, visited, options);
		visited.pop();

		include.children = includeTree.children;
	});
}

function compile(template, options) {
	var tree = parser.parse(template);

	loadIncludes(tree, [], options);

	return compiler.compile(tree);
}

module.exports.compile = compile;
module.exports.utilties = compiler.utilties;
