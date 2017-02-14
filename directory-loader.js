"use strict";

var fs = require("fs");
var path = require("path");

var parser = require("./parser");
var razorleaf = require("./");

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

function DirectoryLoader(root, options) {
	var loader = this;
	var loaderOptions = {
		load: function (name) {
			return parser.parse(loader.read(name), combine(razorleaf.defaults, loaderOptions, { name: name }, loader.options));
		},
	};

	this.root = root;

	this.options = combine(loaderOptions, options);
}

DirectoryLoader.prototype.read = function (name) {
	return fs.readFileSync(path.join(this.root, name + ".rl"), "utf-8");
};

DirectoryLoader.prototype.load = function (name) {
	return razorleaf.compile(this.read(name), combine(this.options, { name: name }));
};

exports.DirectoryLoader = DirectoryLoader;
