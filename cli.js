#!/usr/bin/env node

"use strict";

var fs = require("fs");
var path = require("path");
var razorleaf = require("./razorleaf");

function render(input, outputFile, directory, callback) {
	var buffers = [];

	input.on("error", callback);
	output.on("error", callback);

	input.on("readable", function() {
		var part = input.read();

		if(part) {
			buffers.push(part);
		}
	});

	input.on("end", function() {
		var content = Buffer.concat(buffers).toString("utf8");

		var template = razorleaf.compile(content, {
			include: function(name) {
				return fs.readFileSync(path.join(directory, name + ".leaf"), "utf8");
			}
		});

		output.write(template(), function() {
			callback(null, output);
		});
	});
}

function renderedStdin(error) {
	if(error) {
		console.error(error);
		process.exit(1);
	}
}

function renderedFile(error, output) {
	output.close();

	if(error) {
		console.error(error);
		process.exit(1);
	}
}

for(var i = 2; i < process.argv.length; i++) {
	var file = process.argv[i];
	var input;
	var output;
	var directory;
	var callback;

	if(file === "-") {
		directory = process.cwd();
		input = process.stdin;
		output = process.stdout;
		callback = renderedStdin;
	} else {
		directory = path.dirname(path.resolve(file));
		input = fs.createReadStream(file);

		var outputFile = path.join(directory, path.basename(file, ".leaf") + ".html");
		output = fs.createWriteStream(outputFile, {mode: 0x180});
		callback = renderedFile;
		console.error("Rendering %s as %s", file, outputFile);
	}

	render(input, output, directory, callback);
}

// vim:ft=javascript
