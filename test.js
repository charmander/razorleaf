"use strict";

var razorleaf = require("./");
var parser = require("./parser");

var PARSER_ERROR_MESSAGE = /^(.+) at line \d+, character \d+ in <Razor Leaf template>/;

var tests = [
	{
		name: "interpolation without identifiers",
		template: '"#{5}"',
		expected: { output: "5" },
	},
	{
		name: "consecutive expressions",
		template: '"#{1 + 2}#{3 | 4}"',
		expected: { output: "37" },
	},
	{
		name: "content escaping",
		template: '"#{"<>&\\"<>&\\""}"',
		expected: { output: '&lt;>&amp;"&lt;>&amp;"' },
	},
	{
		name: "attribute escaping",
		template: 'div data-test: "#{"<>&\\"<>&\\""}"',
		expected: { output: '<div data-test="<>&amp;&#34;<>&amp;&#34;"></div>' },
	},
	{
		name: "unescaped content",
		template: '!"<b>test</b>"',
		expected: { output: "<b>test</b>" },
	},
	{
		name: "unescaped expression",
		template: '!"#{data.unsafe}"',
		data: {
			unsafe: razorleaf.Markup.unsafe("<b>unsafe</b>"),
		},
		expected: { output: "<b>unsafe</b>" },
	},
	{
		name: "unescaped string expression",
		template: '!"#{"<b>unsafe</b>"}"',
		expected: { error: "Unescaped content must be an instance of Markup" },
	},
	{
		name: "force-unescaped string expression",
		template: '!!"#{"<b>unsafe</b>"}"',
		expected: { output: "<b>unsafe</b>" },
	},
	{
		name: "escaped double-quotes",
		template: '"println!(\\"Hello, world!\\")"',
		expected: { output: 'println!("Hello, world!")' },
	},
	{
		name: "escaped backslash",
		template: '"\\\\"',
		expected: { output: "\\" },
	},
	{
		name: "comment after boolean attribute",
		template: "div\n\tdata-test:\n\t# comment",
		expected: { output: "<div data-test></div>" },
	},
	{
		name: "non-conflicting output variable",
		template: '% var output;\n"#{typeof output}"',
		expected: { output: "undefined" },
	},
	{
		name: "non-conflicting output variable with escaped references",
		template: '% var \\u006futput;\n"#{typeof \\u006futput}"',
		expected: { output: "undefined" },
	},
	{
		name: "including attributes",
		template: "script include async",
		include: {
			async: "async:",
		},
		expected: { output: "<script async></script>" },
	},
	{
		name: "conditional attributes",
		template: 'div "Hello, world!" \n\tif true\n\t\t.pass id: "#{data.example}"\n\tif false\n\t\t.fail data-fail: "true"',
		data: { example: "example" },
		expected: { output: '<div id="example" class="pass">Hello, world!</div>' },
	},
	{
		name: "reordering of mixed conditionals",
		template: '% var x = true;\ndiv "Hello, world!" \n\tif x\n\t\t"#{data.example}"\n\tif x = false\n\t\tdata-fail: "true"',
		data: { example: "example" },
		expected: { output: "<div>Hello, world!example</div>" },
	},
	{
		name: "nested conditionals",
		template: 'div if true\n\tif 1\n\t\t"Good" data-example:',
		expected: { output: "<div data-example>Good</div>" },
	},
	{
		name: "block appension",
		template: 'extends layout\nappend title "two"',
		include: {
			layout: 'doctype\nhtml\n\thead\n\t\ttitle block title "one, "',
		},
		expected: { output: "<!DOCTYPE html><html><head><title>one, two</title></head></html>" },
	},
	{
		name: "loop with index",
		template: 'for x, y of [1, 2, 3]\n\t"#{x * (y + 1)}"',
		expected: { output: "149" },
	},
	{
		name: "non-conflicting variable in loop with index",
		template: 'for x, i of [1, 2, 3]\n\tfor y of [4, 5, 6]\n\t\t"#{i}"',
		expected: { output: "000111222" },
	},
	{
		name: "non-conflicting variable in nested loops with index",
		template: 'for x, i of [1, 2, 3]\n\tfor y, i of [4, 5, 6]\n\t\tfor z, i of [7, 8, 9]\n\t\t\t"#{i}"',
		expected: { output: "012012012012012012012012012" },
	},
	{
		name: "modifying blocks in root template",
		template: "replace a",
		expected: { error: "Unexpected block replacement in a root template" },
	},
	{
		name: "carriage return/newline combination",
		template: "hello\r\n\tworld",
		expected: { output: "<hello><world></world></hello>" },
	},
	{
		name: "globals",
		template: '"#{data.count} red balloon#{s(data.count)}"',
		data: { count: 99 },
		options: {
			globals: {
				s: function (n) {
					return n === 1 ? "" : "s";
				},
			},
		},
		expected: { output: "99 red balloons" },
	},
	{
		name: "attributes in else after content in if",
		template: 'div\n\tif false\n\t\t"fail"\n\telse\n\t\tdata-status: "pass"',
		expected: { output: '<div data-status="pass"></div>' },
	},
	{
		name: "elif inside element",
		template: 'div\n\tif false\n\t\t"foo"\n\telif true\n\t\t"bar"',
		expected: { output: "<div>bar</div>" },
	},
	{
		name: "unexpected character",
		template: "$",
		expected: { error: "Unexpected $" },
	},
	{
		name: "character with two-byte UTF-16 representation",
		template: "𝑎",
		expected: { error: "Unexpected U+1D44E" },
	},
	{
		name: "initial multiple-tab indentation",
		template: "div\n\t\tdiv",
		expected: { error: "Excessive indent of 2 tabs; one tab always represents one indent level" },
	},
	{
		name: "hasOwnProperty as a variable name",
		template: '% var hasOwnProperty;\nfor x of [1, 2, 3]\n\t"#{x}"',
		expected: { output: "123" },
	},
	{
		name: "hasOwnProperty as a block name",
		template: "extends layout\nreplace hasOwnProperty",
		include: {
			layout: "block hasOwnProperty",
		},
		expected: { output: "" },
	},
	{
		name: "block substitution with attributes",
		template: "extends layout\nreplace content\n\t.test-pass",
		include: {
			layout: "body\n\tblock content\n\t\t.test-fail",
		},
		expected: { output: '<body class="test-pass"></body>' },
	},
	{
		name: "extended Unicode escape",
		template: '"\\u{1f60a}"',
		expected: { output: "😊" },
	},
	{
		name: "invalid extended Unicode escape",
		template: '"\\u{110000}"',
		expected: { error: "Undefined Unicode code-point" },
	},
	{
		name: "invalid escape",
		template: '"\\g"',
		expected: { error: "Expected escape sequence" },
	},
	{
		name: "bad interpolation for ()",
		template: '"#{0)+(0}"',
		expected: { error: "No interpolation is a valid JavaScript expression (of ['0)+(0'])" },
	},
	{
		name: "bad interpolation for () + void combined",
		template: '"#{/*/0)}"',
		expected: { error: "No interpolation is a valid JavaScript expression (of ['/*/0)'])" },
	},
	{
		name: "included macros",
		template: "include macros\ntest()",
		include: {
			macros: 'macro test()\n\t"pass"',
		},
		expected: { output: "pass" },
	},
	{
		name: "recursive macros",
		template: 'macro countdown(n)\n\tif n === 1\n\t\t"1"\n\telse\n\t\t"#{n}, " countdown(n - 1)\ncountdown(5)\n"; "\ncountdown(5)',
		expected: { output: "5, 4, 3, 2, 1; 5, 4, 3, 2, 1" },
	},
	{
		name: "macros with conflicting variable names",
		template: '% var x = 5;\nmacro test(x)\n\t"#{x},"\ntest(12)\n"#{x}"',
		expected: { output: "12,5" },
	},
	{
		name: "macro self-calls with different blocks",
		template: "macro test() yield\ntest() test()",
		expected: { output: "" },
	},
	{
		name: "macro self-calls with different blocks in attribute context",
		template: "macro test() yield\na test() test()",
		expected: { output: "<a></a>" },
	},
	{
		name: "repeated macros in attribute context",
		template: 'macro test(x) "#{x}"\ndiv\n\ttest(1)\n\ttest(2)',
		expected: { output: "<div>12</div>" },
	},
	{
		name: "macro with conflicting variable name in void element context",
		template: "% var x = 5;\nmacro test(x)\nimg test(12)",
		expected: { output: "<img>" },
	},
	{
		name: "macro called multiple times in attribute context",
		template: "macro a(x) \"#{x}\"\nmacro b(y) div a(y)\n\ndiv\n\tb(1)\n\tb(2)",
		expected: { output: "<div><div>1</div><div>2</div></div>" },
	},
	{
		name: "code blocks",
		template: "do let r = `0\n\t`\n\tr += `1\n\t\t`\n\tr += 2\n\"#{r}\"",
		expected: { output: "0\n1\n\t2" },
	},
	{
		name: "code blocks with first indentation in template",
		template: "% let x;\ndo\n\tif (true)\n\t\tx = 5;\n\n\"#{x}\"",
		expected: { output: "5" },
	},
];

function extend(a, b) {
	for (var k in b) {
		if (b.hasOwnProperty(k)) {
			a[k] = b[k];
		}
	}

	return a;
}

function passes(test) {
	var output;
	var error;
	var errorMessage;

	var options = {
		load: function (name) {
			return parser.parse(test.include[name], options);
		},
	};

	try {
		output = razorleaf.compile(test.template, extend(options, test.options))(test.data);
	} catch (e) {
		var m = PARSER_ERROR_MESSAGE.exec(e.message);

		error = e;
		errorMessage = m ? m[1] : e.message;
	}

	if (errorMessage === test.expected.error && output === test.expected.output) {
		console.log("\x1b[32m✔\x1b[0m \x1b[1m%s\x1b[0m passed", test.name);
		return true;
	}

	console.log("\x1b[31m✘\x1b[0m \x1b[1m%s\x1b[0m failed", test.name);
	console.log(error ? error.stack.replace(/^/gm, "  ") : "  Output: " + output);
	return false;
}

process.exit(!tests.every(passes));
