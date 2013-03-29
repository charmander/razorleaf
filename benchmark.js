"use strict";

var fs = require("fs");
var path = require("path");

var tests = {
	razorleaf: [
		{name: "static", file: "static.leaf"},
		{name: "control", file: "control.leaf", data: {
			title: "Hello, world!",
			scripts: [{url: "scripts/default.js", async: true}],
			stylesheets: [{url: "stylesheets/default.css"}]
		}}
	],
	jade: [
		{name: "static", file: "static.jade", options: {compileDebug: false, self: true}},
		{name: "control", file: "control.jade", options: {compileDebug: false, self: true}, data: {
			title: "Hello, world!",
			scripts: [{url: "scripts/default.js", async: true}],
			stylesheets: [{url: "stylesheets/default.css"}]
		}}
	],
	ejs: [
		{name: "static", file: "static.ect", options: {compileDebug: false}},
		{name: "control", file: "control.ejs", options: {compileDebug: false}, data: {
			title: "Hello, world!",
			scripts: [{url: "scripts/default.js", async: true}],
			stylesheets: [{url: "stylesheets/default.css"}]
		}}
	],
	"./benchmark/ect-compatible": [
		{name: "static", file: "static.ect"},
		{name: "control", file: "control.ect", data: {
			title: "Hello, world!",
			scripts: [{url: "scripts/default.js", async: true}],
			stylesheets: [{url: "stylesheets/default.css"}]
		}}
	]
};

var DURATION = 2000;

Object.keys(tests).forEach(function(templateType) {
	var compiler;

	try {
		compiler = require(templateType);
	} catch(error) {
		console.error("Benchmarks for %s will not be run.", templateType);
		return;
	}

	tests[templateType].forEach(function(test) {
		var content = fs.readFileSync(path.join(__dirname, "benchmark", test.file), "utf8");
		var template = compiler.compile(content, test.options);
		var start;
		var iterations;
		var elapsed;

		iterations = 0;
		start = Date.now();

		while(true) {
			elapsed = Date.now() - start;

			if(elapsed >= DURATION) {
				break;
			}

			compiler.compile(content, test.options);

			iterations++;
		}

		console.log("Compiling %s on %s: ~%d op/s", test.name, templateType, Math.round(iterations / elapsed * 1000));

		iterations = 0;
		start = Date.now();

		while(true) {
			elapsed = Date.now() - start;

			if(elapsed >= DURATION) {
				break;
			}

			template(test.data);

			iterations++;
		}

		console.log("Rendering %s on %s: ~%d op/s", test.name, templateType, Math.round(iterations / elapsed * 1000));
	});
});
