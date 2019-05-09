"use strict";

function escapeDoubleQuotedAttributeValue(value) {
	var value_ = "" + value;
	var result = "";
	var start = 0;

	for (var i = 0; i < value_.length; i++) {
		var c = value_.charCodeAt(i);
		var escaped;

		if (c === 38) {
			escaped = "&amp;";
		} else if (c === 34) {
			escaped = "&#34;";
		} else {
			continue;
		}

		if (start !== i) {
			result += value_.substring(start, i);
		}

		result += escaped;
		start = i + 1;
	}

	return result + value_.substring(start);
}

function escapeContent(value) {
	var value_ = "" + value;
	var result = "";
	var start = 0;

	for (var i = 0; i < value_.length; i++) {
		var c = value_.charCodeAt(i);
		var escaped;

		if (c === 38) {
			escaped = "&amp;";
		} else if (c === 60) {
			escaped = "&lt;";
		} else {
			continue;
		}

		if (start !== i) {
			result += value_.substring(start, i);
		}

		result += escaped;
		start = i + 1;
	}

	return result + value_.substring(start);
}

module.exports = {
	escapeDoubleQuotedAttributeValue: escapeDoubleQuotedAttributeValue,
	escapeContent: escapeContent,
};
