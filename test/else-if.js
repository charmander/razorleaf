"use strict";

var test = {
	template: "if false\n\tfail\nelse if true\n\tfail\nelse\n\tfail",
	expected: function(error, output) {
		if(!error || !/^Unexpected else/.test(error.message)) {
			return "Expected else if followed by else to produce syntax error";
		}
	},
	options: {
		include: function(name) {
			return includes[name];
		}
	}
};

module.exports = test;
