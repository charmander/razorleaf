"use strict";

const fs = require("fs");
const path = require("path");

const parser = require("./parser");
const razorleaf = require("./");

class DirectoryLoader {
	constructor(root, options) {
		const load = name =>
			parser.parse(this.read(name), { ...razorleaf.defaults, load, name, ...this.options });

		this.root = root;
		this.options = { load, ...options };
	}

	read(name) {
		return fs.readFileSync(path.join(this.root, name + ".rl"), "utf8");
	}

	load(name, loadOptions) {
		const options = { ...this.options, name };

		if (loadOptions) {
			if ("globals" in loadOptions) {
				options.globals = { ...options.globals, ...loadOptions.globals };
			}

			for (const option in loadOptions) {
				if (option !== "globals") {
					options[option] = loadOptions[option];
				}
			}
		}

		return razorleaf.compile(this.read(name), options);
	}
}

module.exports = DirectoryLoader;
