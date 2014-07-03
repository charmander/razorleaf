"use strict";

var parser = require("./parser");
var compiler = require("./compiler");

var path = require("path");
var fs = require("fs");

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
	name: "<Razor Leaf template>"
};

function compile(template, options) {
	options = combine(defaults, options);

	var tree = parser.parse(template, options);
	return compiler.compile(tree, options);
}

function DirectoryLoader(root, options) {
	var loader = this;
	var loaderOptions = {
		load: function (name) {
			return parser.parse(loader.read(name), combine(defaults, loaderOptions, { name: name }, loader.options));
		}
	};

	this.root = root;

	this.options = combine(loaderOptions, options);
}

DirectoryLoader.prototype.read = function (name) {
	return fs.readFileSync(path.join(this.root, name + ".leaf"), "utf-8");
};

DirectoryLoader.prototype.load = function (name) {
	return compile(this.read(name), combine(this.options, { name: name }));
};

exports.constructor = { name: "razorleaf" };
exports.compile = compile;
exports.DirectoryLoader = DirectoryLoader;
