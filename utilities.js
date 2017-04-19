"use strict";

var voidTags = [
	"area", "base", "br", "col", "command", "embed", "hr", "img", "input",
	"keygen", "link", "meta", "param", "source", "track", "wbr",
];

function Markup(parts) {
	if (!Array.isArray(parts) || !("raw" in parts)) {
		throw new TypeError("Markup should be written as a template string tag, as in Markup`<br>`; use Markup.unsafe() to create an instance from an arbitrary string.");
	}

	if (parts.length !== 1) {
		throw new TypeError("Template literal used with Markup should not have ${…} substitutions");
	}

	return Markup.unsafe(parts[0]);
}

Markup.unsafe = function (html) {
	return Object.create(Markup.prototype, {
		_html: {
			configurable: true,
			value: html,
		},
	});
};

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

function unwrapMarkup(markup) {
	if (!(markup instanceof Markup)) {
		throw new TypeError("Unescaped content must be an instance of Markup");
	}

	return markup._html;
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

exports.CodeBlock = CodeBlock;
exports.Markup = Markup;
exports.escapeAttributeValue = escapeAttributeValue;
exports.escapeContent = escapeContent;
exports.unwrapMarkup = unwrapMarkup;
exports.voidTags = voidTags;
