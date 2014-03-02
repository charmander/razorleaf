"use strict";

var razorleaf = require("./");
var parser = require("./parser");

var tests = [
	{
		name: "escaped double-quotes",
		template: '"println!(\\"Hello, world!\\")"',
		expected: { output: 'println!("Hello, world!")' }
	},
	{
		name: "non-conflicting output variable",
		template: '% var output;\n"#{typeof output}"',
		expected: { output: "undefined" }
	},
	{
		name: "including attributes",
		template: "script include async",
		include: {
			async: "async:"
		},
		expected: { output: "<script async></script>" }
	},
	{
		name: "conditional attributes",
		template: 'div "Hello, world!" \n\tif true\n\t\t.pass id: "#{data.example}"\n\tif false\n\t\t.fail data-fail: "true"',
		data: { example: "example" },
		expected: { output: '<div id="example" class=" pass">Hello, world!</div>' }
	},
	{
		name: "reordering of mixed conditionals",
		template: '% var x = true;\ndiv "Hello, world!" \n\tif x\n\t\t"#{data.example}"\n\tif x = false\n\t\tdata-fail: "true"',
		data: { example: "example" },
		expected: { output: '<div>Hello, world!example</div>' }
	},
	{
		name: "nested conditionals",
		template: 'div if true\n\tif 1\n\t\t"Good" data-example:',
		expected: { output: '<div data-example>Good</div>' }
	},
	{
		name: "block appension",
		template: 'extends layout\nappend title "two"',
		include: {
			layout: 'doctype\nhtml\n\thead\n\t\ttitle block title "one, "'
		},
		expected: { output: '<!DOCTYPE html><html><head><title>one, two</title></head></html>' }
	},
	{
		name: "loop with index",
		template: 'for x, y of [1, 2, 3]\n\t"#{x * (y + 1)}"',
		expected: { output: "149" }
	},
	{
		name: "non-conflicting variable in loop with index",
		template: 'for x, i of [1, 2, 3]\n\tfor y of [4, 5, 6]\n\t\t"#{i}"',
		expected: { output: "000111222" }
	},
	{
		name: "non-conflicting variable in nested loops with index",
		template: 'for x, i of [1, 2, 3]\n\tfor y, i of [4, 5, 6]\n\t\tfor z, i of [7, 8, 9]\n\t\t\t"#{i}"',
		expected: { output: "012012012012012012012012012" }
	}
];

function passes(test) {
	var output, error, errorMessage;

	var options = {
		load: function(name) {
			return parser.parse(test.include[name], options);
		},
		debug: true
	};

	try {
		output = razorleaf.compile(test.template, options)(test.data);
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
