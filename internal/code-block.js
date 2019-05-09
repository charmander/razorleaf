"use strict";

const extend = require("./extend");

const escapeLiteral = text =>
	text
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");

class CodeBlock {
	constructor() {
		this.parts = [];
	}

	addText(escapeFunction, text) {
		this.parts.push({
			type: "text",
			escapeFunction: escapeFunction,
			value: text,
		});

		return this;
	}

	addExpression(escapeFunctionName, expression) {
		this.parts.push({
			type: "expression",
			escapeFunctionName: escapeFunctionName,
			value: expression,
		});

		return this;
	}

	addCode(code) {
		this.parts.push({
			type: "code",
			value: code,
		});

		return this;
	}

	addBlock(block) {
		extend(this.parts, block.parts);
		return this;
	}

	toCode(outputVariable, initialState) {
		let code = "";
		let currentType = initialState;

		for (const part of this.parts) {
			switch (part.type) {
			case "text": {
				if (currentType === "code") {
					code += outputVariable + " += '";
				} else if (currentType === "expression") {
					code += " + '";
				}

				const escaped =
					part.escapeFunction === null ?
						part.value :
						part.escapeFunction(part.value);

				code += escapeLiteral(escaped);
				currentType = "text";
				break;
			}

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
				throw new Error(`Unknown part type ${part.type}.`);
			}
		}

		if (currentType === "text") {
			code += "';";
		} else if (currentType === "expression") {
			code += ";";
		}

		return code;
	}

	toTextOrNull(expectedEscapeFunction) {
		let text = "";

		for (const part of this.parts) {
			if (part.type !== "text") {
				return null;
			}

			if (part.escapeFunction !== expectedEscapeFunction) {
				throw new Error("Unexpected");
			}

			text += part.value;
		}

		return text;
	}
}

module.exports = CodeBlock;
