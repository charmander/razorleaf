"use strict";

var push = Array.prototype.push;
var amp = /&/g;
var quot = /"/g;
var lt = /</g;
var gt = />/g;

var utilities = {
	escapeAttributeValue: function(value) {
		return ("" + value).replace(amp, "&amp;")
		                   .replace(quot, "&quot;");
	},
	escapeContent: function(content) {
		return ("" + content).replace(amp, "&amp;")
		                     .replace(lt, "&lt;")
		                     .replace(gt, "&gt;");
	},
	CodeContext: CodeContext
};

function escapeStringLiteral(string) {
	var result = "";
	var escaped = false;

	for(var i = 0; i < string.length; i++) {
		var c = string.charAt(i);

		if(escaped) {
			escaped = false;
			result += c;
		} else if(c === "\\") {
			escaped = true;
			result += c;
		} else if(c === "\n") {
			result += "\\n";
		} else if(c === "\r") {
			result += "\\r";
		} else if(c === "\u2028") {
			result += "\\u2028";
		} else if(c === "\u2029") {
			result += "\\u2029";
		} else if(c === "'") {
			result += "\\'";
		} else {
			result += c;
		}
	}

	return result;
}

function CodeContext(escapeFunction, initialParts) {
	this.parts = initialParts || [];
	this.escapeFunction = escapeFunction;
}

CodeContext.prototype.addCode = function(code) {
	this.parts.push({type: "code", value: code});
};

CodeContext.prototype.addText = function(text) {
	if(this.escapeFunction) {
		text = utilities[this.escapeFunction](text);
	}

	this.parts.push({type: "text", value: text});
};

CodeContext.prototype.addExpression = function(expression) {
	this.parts.push({type: "expression", value: expression, escapeFunction: this.escapeFunction});
};

CodeContext.prototype.addContext = function(context) {
	push.apply(this.parts, context.parts);
};

CodeContext.prototype.generateStatic = function() {
	var isStatic = function(part) {
		return part.type === "text";
	};

	if(!this.parts.every(isStatic)) {
		return null;
	}

	return this.parts.map(function(part) {
		return part.value;
	}).join("");
};

CodeContext.prototype.generateCode = function(initial) {
	var current = initial || "code";
	var generated = "";

	for(var i = 0; i < this.parts.length; i++) {
		var part = this.parts[i];

		switch(part.type) {
		case "code":
			if(current === "text") {
				generated += "';\n";
			} else if(current === "expression") {
				generated += ";\n";
			}

			generated += part.value;
			current = "code";

			break;
		case "text":
			if(current === "code") {
				generated += "__output += '";
			} else if(current === "expression") {
				generated += " + '";
			}

			generated += escapeStringLiteral(part.value);
			current = "text";

			break;
		case "expression":
			if(current === "code") {
				generated += "__output += ";
			} else if(current === "text") {
				generated += "' + ";
			} else {
				generated += " + ";
			}

			if(part.escapeFunction) {
				generated += "__util." + part.escapeFunction + "((" + part.value + "))";
			} else {
				generated += "(" + part.value + ")";
			}

			current = "expression";

			break;
		default:
			throw new Error("Unknown part type");
		}
	}

	if(current === "text") {
		generated += "';";
	} else if(current === "expression") {
		generated += ";";
	}

	return generated;
};

module.exports = utilities;
