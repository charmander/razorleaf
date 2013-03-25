"use strict";

var ect = require("ect");

module.exports.compile = function(template) {
	var renderer = ect({
		root: {page: template}
	});

	return function(data) {
		return renderer.render("page", data);
	};
};
