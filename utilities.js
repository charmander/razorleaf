"use strict";

var voidTags = [
	"area", "base", "br", "col", "command", "embed", "hr", "img", "input",
	"keygen", "link", "meta", "param", "source", "track", "wbr",
];

function escapeLiteral(text) {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

function escapeAttributeValue(value) {
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
		} else if (c === 62) {
			escaped = "&gt;";
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

function CodeBlock() {
	this.parts = [];
}

CodeBlock.prototype.addText = function (text) {
	this.parts.push({
		type: "text",
		value: text,
	});

	return this;
};

CodeBlock.prototype.addExpression = function (escapeFunction, expression) {
	this.parts.push({
		type: "expression",
		escapeFunction: escapeFunction,
		value: expression,
	});

	return this;
};

CodeBlock.prototype.addCode = function (code) {
	this.parts.push({
		type: "code",
		value: code,
	});

	return this;
};

CodeBlock.prototype.addBlock = function (block) {
	Array.prototype.push.apply(this.parts, block.parts);

	return this;
};

CodeBlock.prototype.toCode = function (outputVariable, initialState) {
	var code = "";
	var currentType = initialState;

	for (var i = 0; i < this.parts.length; i++) {
		var part = this.parts[i];

		switch (part.type) {
		case "text":
			if (currentType === "code") {
				code += outputVariable + " += '";
			} else if (currentType === "expression") {
				code += " + '";
			}

			code += escapeLiteral(part.value);
			currentType = "text";
			break;

		case "expression":
			if (currentType === "code") {
				code += outputVariable + " += ";
			} else if (currentType === "expression") {
				code += " + ";
			} else {
				code += "' + ";
			}

			if (part.escapeFunction) {
				code += part.escapeFunction + "((" + part.value + "))";
			} else {
				code += "(" + part.value + ")";
			}

			currentType = "expression";
			break;

		case "code":
			if (currentType === "text") {
				code += "';\n";
			} else if (currentType === "expression") {
				code += ";\n";
			}

			code += part.value + "\n";
			currentType = "code";
			break;

		default:
			throw new Error("Unknown part type " + part.type + ".");
		}
	}

	if (currentType === "text") {
		code += "';";
	} else if (currentType === "expression") {
		code += ";";
	}

	return code;
};

exports.constructor = { name: "razorleaf.utilities" };
exports.escapeAttributeValue = escapeAttributeValue;
exports.escapeContent = escapeContent;
exports.CodeBlock = CodeBlock;
exports.voidTags = voidTags;
