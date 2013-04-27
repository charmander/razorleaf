"use strict";

var utilities = {
	escapeAttributeValue: function(value) {
		return ("" + value).replace(/&/g, "&amp;")
		                   .replace(/"/g, "&quot;");
	},
	escapeContent: function(content) {
		return ("" + content).replace(/&/g, "&amp;")
		                     .replace(/</g, "&lt;")
		                     .replace(/>/g, "&gt;");
	}
};

module.exports = utilities;
