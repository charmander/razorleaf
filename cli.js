#!/usr/bin/env node
"use strict";

const fs = require("fs");
const vm = require("vm");

const razorleaf = require("./");
const DirectoryLoader = require("./directory-loader");

const showUsage = () => {
	console.error("Usage: razorleaf [-d|--data <expression>] [<template file>]");
};

const readToEnd = (textStream, callback) => {
	let text = "";

	textStream.on("data", part => {
		text += part;
	});

	textStream.on("end", () => {
		callback(null, text);
	});

	textStream.on("error", callback);
};

const evalExpression = js => {
	let isExpression;

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
};

const firstIndex = (a, b) =>
	a === -1 ? b :
	b === -1 ? a :
	a < b ? a : b;

const mainWithOptions = (options, args) => {
	args = args.slice();

	if (args[0] === "-h" || args[0] === "--help") {
		showUsage();
		return;
	}

	const separator = args.indexOf("--");

	if (separator !== -1) {
		args.splice(separator, 1);
	}

	const d = firstIndex(args.indexOf("-d"), args.indexOf("--data"));
	let dataExpression = null;

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

	const data = dataExpression ? evalExpression(dataExpression) : null;

	const read = (error, templateSource) => {
		if (error) {
			throw error;
		}

		const loader = new DirectoryLoader(".", options);
		const template = razorleaf.compile(templateSource, loader.options);
		process.stdout.write(template(data));
	};

	if (args.length === 0 || args[0] === "-") {
		readToEnd(process.stdin, read);
	} else {
		fs.readFile(args[0], "utf-8", read);
	}
};

const main = args => {
	mainWithOptions(undefined, args);
};

module.exports = {
	main,
	mainWithOptions,
};

if (module === require.main) {
	main(process.argv.slice(2));
}
