"use strict";

var tryRequire = function(lib) {
	try {
		return require(lib);
	} catch(e) {
		return null;
	}
};

var fs = require("fs");
var assert = require("assert");

var jsdom = require("jsdom");
var razorleaf = require("./razorleaf");
var jade = tryRequire("jade");
var ECT = tryRequire("ect");
var whiskers = tryRequire("whiskers");

var push = Array.prototype.push;

var benchmarks = [];
var files = [
	{
		name: "hello",
		data: null
	},
	{
		name: "common",
		data: {
			title: "A Common Page",
			stylesheets: ["one", "two", "three"],
			scripts: ["one", "two", "three", "four"]
		}
	}
];

benchmarks.push({
	name: "Razor Leaf",
	extension: "leaf",
	run: function(time, content, data, filePath) {
		var template = new razorleaf.Template(content, filePath);

		time(function() {
			template.render(data);
		});

		return template.render(data);
	}
});

if(process.argv.indexOf("--single") === -1) {
	if(jade) {
		benchmarks.push({
			name: "Jade",
			extension: "jade",
			run: function(time, content, data) {
				var template = jade.compile(content);

				time(function() {
					template(data);
				});

				return template(data);
			}
		});
	}

	if(ECT) {
		benchmarks.push({
			name: "ECT",
			extension: "ect",
			run: function(time, content, data) {
				var template = ECT({
					root: {page: content}
				});

				time(function() {
					template.render("page", data);
				});

				return template.render("page", data);
			}
		});
	}

	if(whiskers) {
		benchmarks.push({
			name: "whiskers",
			extension: "whiskers",
			run: function(time, content, data) {
				time(function() {
					whiskers.render(content, data);
				});

				return whiskers.render(content, data);
			}
		});
	}
}

function domEqual(a, b) {
	var queueA = [a.documentElement];
	var queueB = [b.documentElement];

	while(queueA.length > 0) {
		var currentA = queueA.shift();
		var currentB = queueB.shift();

		if(currentA.nodeName !== currentB.nodeName || currentA.childNodes.length !== currentB.childNodes.length) {
			return false;
		}

		push.apply(queueA, currentA.childNodes);
		push.apply(queueB, currentB.childNodes);
	}

	return true;
}

files.forEach(function(file) {
	// TODO: Output aligned and sorted using text-table

	fs.readFile("benchmark/" + file.name + ".html", "utf-8", function(error, reference) {
		assert.ifError(error);

		var referenceDom = jsdom.jsdom(reference);

		benchmarks.forEach(function(benchmark) {
			var filePath = "benchmark/" + file.name + "." + benchmark.extension;

			var time = function(block) {
				var expectedTime = 1000;
				var start = Date.now();
				var iterations = 0;

				do {
					block();
					iterations++;
				} while(Date.now() - start < expectedTime);

				var actualTime = Date.now() - start;
				var ops = iterations * 1000 / actualTime;

				console.log("%s on %s: %d op/s", file.name, benchmark.name, Math.round(ops * 100) / 100);
			};

			fs.readFile(filePath, "utf-8", function(error, content) {
				assert.ifError(error);

				try {
					var result = benchmark.run(time, content, file.data, filePath);
					var dom = jsdom.jsdom(result);

					assert(domEqual(dom, referenceDom), "DOM matches reference DOM");
				} catch(e) {
					console.error("\x1b[31m✘\x1b[0m Error running %s on %s:\n%s", file.name, benchmark.name, e.stack);
				}
			});
		});
	});
});
