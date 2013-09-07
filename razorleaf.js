"use strict";

var parser = require("./parser");
var compiler = require("./compiler");

function isContained(element) {
	while(element.parent) {
		element = element.parent;

		if(element.type === "block") {
			return true;
		}
	}

	return false;
}

function loadExtends(tree, visited, options) {
	if(tree.extends) {
		if(visited.indexOf(tree.extends) !== -1) {
			throw new Error("Circular extension: ⤷ " + visited.slice(visited.indexOf(tree.extends)).join(" → ") + " ⤴");
		}

		for(var i = 0; i < tree.children.length; i++) {
			var child = tree.children[i];

			if(child.type !== "extends" && child.type !== "replace-block") {
				throw child.unexpected;
			}
		}

		var extendTree = parser.parse(options.include(tree.extends));

		visited.push(tree.extends);
		var newTree = loadExtends(extendTree, visited, options);
		loadIncludes(extendTree, visited, options);
		visited.pop();

		for(var name in tree.blocks) {
			if(tree.blocks.hasOwnProperty(name)) {
				if(newTree.blocks.hasOwnProperty(name)) {
					throw tree.blocks[name].duplicatesExistingName();
				}

				newTree.blocks[name] = tree.blocks[name];
			}
		}

		for(var name in newTree.blocks) {
			if(tree.blockActions.hasOwnProperty(name)) {
				var block = newTree.blocks[name];

				tree.blockActions[name].forEach(function(action) {
					action(block);
				});
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

	for(var name in tree.blocks) {
		if(tree.blockActions.hasOwnProperty(name)) {
			var block = tree.blocks[name];

			tree.blockActions[name].forEach(function(action) {
				action(block);
			});
		}
	}

	return compiler.compile(tree);
}

module.exports.compile = compile;
module.exports.utilities = compiler.utilities;
