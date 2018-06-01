#!/usr/bin/env node
"use strict";

var fs = require("fs");
var vm = require("vm");

var razorleaf = require("./");
var DirectoryLoader = require("./directory-loader");

function showUsage() {
	console.error("Usage: razorleaf [-d|--data <expression>] [<template file>]");
}

function readToEnd(textStream, callback) {
	var text = "";

	textStream.on("data", function (part) {
		text += part;
	});

	textStream.on("end", function () {
		callback(null, text);
	});

	textStream.on("error", callback);
}

function evalExpression(js) {
	var isExpression;

	try {
		/* eslint-disable no-new */
		new Function("'use strict'; (" + js + "\n)");
		new Function("'use strict'; void " + js);

		/* eslint-enable no-new */
		isExpression = true;
	} catch (error) {
		isExpression = false;
	}

	return vm.runInNewContext(
		isExpression ?
			"(" + js + "\n)" :
			js
	);
}

function firstIndex(a, b) {
	return (
		a === -1 ? b :
		b === -1 ? a :
		a < b ? a : b
	);
}

function mainWithOptions(options, args) {
	args = args.slice();

	if (args[0] === "-h" || args[0] === "--help") {
		showUsage();
		return;
	}

	var separator = args.indexOf("--");

	if (separator !== -1) {
		args.splice(separator, 1);
	}

	var d = firstIndex(args.indexOf("-d"), args.indexOf("--data"));
	var dataExpression = null;

	if (d !== -1 && (separator === -1 || d < separator)) {
		if (d + 1 === args.length) {
			showUsage();
			process.exit(1);
			return;
		}

		dataExpression = args[d + 1];
		args.splice(d, 2);
	}

	if (args.length > 1) {
		showUsage();
		process.exit(1);
		return;
	}

	var data = dataExpression ? evalExpression(dataExpression) : null;

	function read(error, templateSource) {
		if (error) {
			throw error;
		}

		var loader = new DirectoryLoader(".", options);
		var template = razorleaf.compile(templateSource, loader.options);
		process.stdout.write(template(data));
	}

	if (args.length === 0 || args[0] === "-") {
		readToEnd(process.stdin, read);
	} else {
		fs.readFile(args[0], "utf-8", read);
	}
}

function main(args) {
	mainWithOptions(undefined, args);
}

module.exports = {
	main: main,
	mainWithOptions: mainWithOptions,
};

if (module === require.main) {
	main(process.argv.slice(2));
}
