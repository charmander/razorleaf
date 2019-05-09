"use strict";

const escapeDoubleQuotedAttributeValue = value => {
	const value_ = "" + value;
	let result = "";
	let start = 0;

	for (let i = 0; i < value_.length; i++) {
		const c = value_.charCodeAt(i);
		let escaped;

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
};

const escapeContent = value => {
	const value_ = "" + value;
	let result = "";
	let start = 0;

	for (let i = 0; i < value_.length; i++) {
		const c = value_.charCodeAt(i);
		let escaped;

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
};

module.exports = {
	escapeDoubleQuotedAttributeValue,
	escapeContent,
};
