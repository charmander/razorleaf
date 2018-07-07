"use strict";

var fs = require("fs");
var path = require("path");
var util = require("util");

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

DirectoryLoader.prototype.load = function (name, loadOptions) {
	var options = Object.assign({}, this.options, { name: name });

	if (loadOptions) {
		if ("globals" in loadOptions) {
			options.globals = Object.assign({}, options.globals, loadOptions.globals);
		}

		for (var option in loadOptions) {
			if (option !== "globals") {
				options[option] = loadOptions[option];
			}
		}
	}

	return razorleaf.compile(this.read(name), options);
};

Object.defineProperty(DirectoryLoader, "DirectoryLoader", {
	configurable: true,
	get: util.deprecate(function () {
		return DirectoryLoader;
	}, "DirectoryLoader is now a direct export; const DirectoryLoader = require('razorleaf/directory-loader')"),
	set: function (value) {
		delete this.DirectoryLoader;
		this.DirectoryLoader = value;
	},
});

module.exports = DirectoryLoader;
