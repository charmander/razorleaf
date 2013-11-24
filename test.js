"use strict";

var razorleaf = require("./");

var tests = [
	{
		name: "escaping",
		template: '"println!(\\"Hello, world\\")"',
		expected: { output: 'println!("Hello, world!")' }
	}
];

function passes(test) {
	var output, error, errorMessage;

	try {
		output = razorleaf.compile(test.template, test.options)(test.data);
	} catch (e) {
		error = e;
		errorMessage = e.message;
	}

	if (errorMessage === test.expected.error && output === test.expected.output) {
		console.log("\x1b[32m✔\x1b[0m \x1b[1m%s\x1b[0m passed", test.name);
		return true;
	}

	console.log("\x1b[31m✘\x1b[0m \x1b[1m%s\x1b[0m failed", test.name);
	console.log(error ? "  " + error.stack : "  Output: " + output);
	return false;
}

process.exit(!tests.every(passes));
