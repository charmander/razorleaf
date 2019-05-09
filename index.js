"use strict";

const parser = require("./parser");
const compiler = require("./compiler");

const defaults = {
	name: "<Razor Leaf template>",
};

const compile = (template, options) => {
	options = { ...defaults, ...options };

	const tree = parser.parse(template, options);
	return compiler.compile(tree, options);
};

module.exports = {
	compile,
	defaults,
};
