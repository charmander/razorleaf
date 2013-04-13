"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var async = require("async");
var diff = require("diff");
var color = require("cli-color");
var razorleaf = require(path.dirname(__dirname));

function readFile(path, callback) {
	fs.readFile(path, "utf8", callback);
}

function runTest(test) {
	var options = test.options;
	var template = test.template;
	var expected = test.expected;

	var compiled = razorleaf.compile(template, options.options);
	var output = compiled(options.data);

	if(output === expected) {
		console.log(color.green("✓") + " %s passed", test.name);
	} else {
		console.log(color.red.bold("✗ %s failed"), test.name);
		console.log("Diff:");
		console.log(diff.diffChars(expected, output).map(function(part) {
			if(part.added) {
				return color.bgGreen(part.value);
			}

			if(part.removed) {
				return color.bgRed(part.value);
			}

			return part.value;
		}).join(""));
	}

	return output !== expected;
}

var run;

if(process.argv.length > 2) {
	run = process.argv.slice(2);
} else {
	run = JSON.parse(fs.readFileSync(path.join(__dirname, "tests.json"), "utf8"));
}

async.reduce(run, false, function(failed, test, callback) {
	async.map([
		path.join(__dirname, test, "options.json"),
		path.join(__dirname, test, "test.leaf"),
		path.join(__dirname, test, "expected.html")
	], readFile, function(error, files) {
		assert.ifError(error);

		callback(null, runTest({
			name: test,
			options: JSON.parse(files[0]),
			template: files[1],
			expected: files[2].replace(/\n$/, "") // A trailing newline makes no difference.
		}));
	});
}, function(error, failed) {
	if(failed) {
		process.exit(1);
	}
});
