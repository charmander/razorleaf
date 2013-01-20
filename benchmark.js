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

files.forEach(function(file) {
	// TODO: Output aligned and sorted using text-table

	fs.readFile("benchmark/" + file.name + ".html", function(error, reference) {
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

				console.log("%s: %d op/s", benchmark.name, Math.round(ops * 100) / 100);
			};

			fs.readFile(filePath, function(error, content) {
				assert.ifError(error);

				try {
					var result = benchmark.run(time, content, file.data, filePath);
					var dom = jsdom.jsdom(result); // TODO: Compare this against referenceDom

					console.log(result);
				} catch(e) {
					console.error("\x1b[31m✘\x1b[0m Error running %s on %s:\n%s", file.name, benchmark.name, e.stack);
				}
			});
		});
	});
});
