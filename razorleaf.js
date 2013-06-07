"use strict";

var parser = require("./parser");
var compiler = require("./compiler");

function loadExtends(tree, visited, options) {
	if(tree.extends) {
		if(visited.indexOf(tree.extends) !== -1) {
			throw new Error("Circular extension: ⤷ " + visited.slice(visited.indexOf(tree.extends)).join(" → ") + " ⤴");
		}

		var extendTree = parser.parse(options.include(tree.extends));

		visited.push(tree.extends);
		var newTree = loadExtends(extendTree, visited, options);
		loadIncludes(extendTree, visited, options);
		visited.pop();

		for(var name in tree.blocks) {
			if(tree.blocks.hasOwnProperty(name)) {
				var parentBlock = newTree.blocks[name];

				if(!parentBlock) {
					throw tree.blocks[name].replacesNonExistentBlock();
				}

				parentBlock.children = [tree.blocks[name]];
			}
		}

		return newTree;
	}

	return tree;
}

function loadIncludes(tree, visited, options) {
	tree.includes.forEach(function(include) {
		if(visited.indexOf(include.template) !== -1) {
			throw new Error("Circular inclusion: ⤷ " + visited.slice(visited.indexOf(include.template)).join(" → ") + " ⤴");
		}

		var includeTree = parser.parse(options.include(include.template));

		visited.push(include.template);
		tree = loadExtends(includeTree, visited, options);
		loadIncludes(includeTree, visited, options);
		visited.pop();

		include.children = includeTree.children;
	});
}

function compile(template, options) {
	var tree = parser.parse(template);

	tree = loadExtends(tree, [], options);
	loadIncludes(tree, [], options);

	return compiler.compile(tree);
}

module.exports.compile = compile;
module.exports.utilties = compiler.utilties;
