"use strict";

var fs = require("fs");
var path = require("path");
var optimist = require("optimist")
	.usage("Run Razor Leaf’s tests.\nUsage: $0 [options] [tests]")
	.options("benchmark", {
		describe: "Run benchmarks as well as tests.",
		boolean: true,
		default: true
	})
	.describe("no-benchmark");
var razorleaf = require("./");

var testPath = path.join(__dirname, "test");
var argv = optimist.argv;

if(argv.help) {
	optimist.showHelp();
	process.exit();
}

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
		console.log("  (Got " + (error ? "error: " + error : "output: " + output) + ")");
		return false;
	}

	console.log("\x1b[32m✔\x1b[0m %s passed", name);
	return true;
}

var tests = argv._.length === 0 ? fs.readdirSync(testPath) : argv._;

var allPassed = tests.reduce(function(allPassed, test) {
	var result = runTest(test);

	return allPassed && result;
}, true);

if(!allPassed) {
	process.exit(1);
}
