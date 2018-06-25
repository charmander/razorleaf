"use strict";

function escapeLiteral(text) {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

function CodeBlock() {
	this.parts = [];
}

CodeBlock.prototype.addText = function (escapeFunction, text) {
	this.parts.push({
		type: "text",
		escapeFunction: escapeFunction,
		value: text,
	});

	return this;
};

CodeBlock.prototype.addExpression = function (escapeFunctionName, expression) {
	this.parts.push({
		type: "expression",
		escapeFunctionName: escapeFunctionName,
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

			var escaped =
				part.escapeFunction === null ?
					part.value :
					part.escapeFunction(part.value);

			code += escapeLiteral(escaped);
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

			if (part.escapeFunctionName !== null) {
				code += part.escapeFunctionName + "((" + part.value + "))";
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

CodeBlock.prototype.toTextOrNull = function (expectedEscapeFunction) {
	var text = "";

	for (var i = 0; i < this.parts.length; i++) {
		var part = this.parts[i];

		if (part.type !== "text") {
			return null;
		}

		if (part.escapeFunction !== expectedEscapeFunction) {
			throw new Error("Unexpected");
		}

		text += part.value;
	}

	return text;
};

module.exports = CodeBlock;
