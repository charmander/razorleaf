"use strict";

var fs = require("fs");
var path = require("path");
var razorleaf = require("./");

var testPath = path.join(__dirname, "test");

function runTest(name) {
	var test = require(path.join(testPath, name));
	var output;
	var error;

	try {
		output = razorleaf.compile(test.template, test.options)(test.data);
	} catch(e) {
		error = e;
	}

	var result = test.expected(error, output);

	if(result) {
		console.log("\x1b[31m✘\x1b[0m %s failed: %s", name, result);
		console.log("  (Got " + (error ? "error: " + error.stack : "output: " + output) + ")");
		return false;
	}

	console.log("\x1b[32m✔\x1b[0m %s passed", name);
	return true;
}

var tests = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(testPath);

var allPassed = tests.reduce(function(allPassed, test) {
	var result = runTest(test);

	return allPassed && result;
}, true);

if(!allPassed) {
	process.exit(1);
}
