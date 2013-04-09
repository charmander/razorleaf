"use strict";

var format = require("index-format");
var push = Array.prototype.push;

var voidTags = [
	"area", "base", "br", "col", "command", "embed", "hr", "img", "input",
	"keygen", "link", "meta", "param", "source", "track", "wbr"
];

var templateUtilities = {
	__amp: {value: /&/g, dependencies: []},
	__quot: {value: /"/g, dependencies: []},
	__lt: {value: /</g, dependencies: []},
	__gt: {value: />/g, dependencies: []},
	__escapeAttributeValue: {
		value: "function(string) {\
			return ('' + string).replace(__amp, '&amp;').replace(__quot, '&quot;');\
		}",
		dependencies: ["__amp", "__quot"]
	},
	__escapeContent: {
		value: "function(string) {\
			return ('' + string).replace(__amp, '&amp;').replace(__lt, '&lt;').replace(__gt, '&gt;');\
		}",
		dependencies: ["__amp", "__lt", "__gt"]
	}
};

function createUtilities(names) {
	if(names.length === 0) {
		return "";
	}

	var used = {};
	var needed = names.slice();

	while(needed.length > 0) {
		var name = needed.pop();

		if(!used.hasOwnProperty(name)) {
			used[name] = templateUtilities[name].value;
			push.apply(needed, templateUtilities[name].dependencies);
		}
	}

	return "var " + Object.keys(used).map(function(name) {
		return name + " = " + used[name];
	}).join(", ") + ";\n";
}

function interpolateAttributeValue(utilities, value) {
	var string = "";
	var escaped = false;
	var interpolated = false;

	for(var i = 0; i < value.content.length; i++) {
		var c = value.content.charAt(i);

		if(escaped) {
			escaped = false;
		} else if(c === "\\") {
			escaped = true;
		} else if(interpolated) {
			if(c === "}") {
				interpolated = false;
				string += "\n)) + '";
				continue;
			}
		} else if(c === "#" && value.content.charAt(i + 1) === "{") {
			i++;
			interpolated = true;

			if(value.type === "raw_string") {
				string += "' + ((";
			} else {
				string += "' + __escapeAttributeValue((";
				utilities.push("__escapeAttributeValue");
			}

			continue;
		} else if(c === "'") {
			string += "\\";
		} else if(value.type !== "raw_string") {
			if(c === "&") {
				c = "&amp;";
			} else if(c === "\"") {
				c = "&quot;";
			}
		}

		string += c;
	}

	return string;
}

function interpolateContent(utilities, value) {
	var string = "";
	var escaped = false;
	var interpolated = false;

	for(var i = 0; i < value.content.length; i++) {
		var c = value.content.charAt(i);

		if(escaped) {
			escaped = false;
		} else if(c === "\\") {
			escaped = true;
		} else if(interpolated) {
			if(c === "}") {
				interpolated = false;
				string += "\n)) + '";
				continue;
			}
		} else if(c === "#" && value.content.charAt(i + 1) === "{") {
			i++;
			interpolated = true;

			if(value.type === "raw_string") {
				string += "' + ((";
			} else {
				string += "' + __escapeContent((";
				utilities.push("__escapeContent");
			}

			continue;
		} else if(c === "'") {
			string += "\\";
		} else if(value.type !== "raw_string") {
			if(c === "&") {
				c = "&amp;";
			} else if(c === "<") {
				c = "&lt;";
			} else if(c === ">") {
				c = "&gt;";
			}
		}

		string += c;
	}

	return string;
}

function CodeString(outputName) {
	this.code = "";
	this.isCode = false;
	this.outputName = outputName;
}

CodeString.prototype.addCode = function(part) {
	if(part === "") {
		return;
	}

	if(!this.isCode) {
		this.isCode = true;
		this.code += "';\n";
	}

	this.code += part;
};

CodeString.prototype.addString = function(string) {
	if(this.isCode) {
		this.isCode = false;
		this.code += this.outputName + " += '";
	}

	this.code += string;
};

CodeString.prototype.addCodeString = function(codeString) {
	this.addString(codeString.code);
	this.isCode = codeString.isCode;
};

Object.defineProperties(CodeString.prototype, {
	string: {
		get: function() {
			if(this.isCode) {
				return this.code + this.outputName + " += '";
			}

			return this.code;
		},
		enumerable: true,
		configurable: true
	}
});

function createVariableName(variables, prefix) {
	var i = 1;
	var name;

	do {
		name = "__" + prefix + i;
		i++;
	} while(variables[name]);

	variables[name] = true;

	return name;
}

function getElementInfo(variables, element) {
	if(voidTags.indexOf(element.name) !== -1) {
		return {
			open: function(info) {
				info.attributes.addString("<" + element.name);
			},
			close: function(info) {
				info.attributes.addString(">");
				info.content = info.attributes;
				info.attributes = null;
			}
		};
	}

	switch(element.name) {
	case "doctype":
		if(element.children.length !== 0) {
			throw new Error("doctype element cannot have children."); // TODO: Where?
		}

		return {
			open: function(info) {
				info.content.addString("<!DOCTYPE html>");
			},
			close: function() {}
		};

	case "if":
		return {
			open: function(info) {
				this.variableName = createVariableName(variables, "condition");
				info.content.addCode("if(" + this.variableName + ") {\n");
			},
			close: function(info) {
				var newContent = new CodeString("__output");

				if(info.attributes) {
					var newAttributes = new CodeString("__output");

					newAttributes.addCode(
						format(
							"{0} = !!({1}\n);\n" +
							"if({0}) {\n",
							[this.variableName, element.condition]
						)
					);

					newAttributes.addCodeString(info.attributes);

					newAttributes.addCode("}\n");

					info.attributes = newAttributes;
				} else {
					newContent.addCode(
						format(
							"{0} = !!({1}\n);\n",
							[this.variableName, element.condition]
						)
					);
				}

				newContent.addCodeString(info.content);
				newContent.addCode("}\n");
				info.content = newContent;

				variables[this.variableName] = false;
			}
		};

	case "for":
		return {
			open: function(info) {
				this.collectionName = createVariableName(variables, "collection");
				this.indexName = createVariableName(variables, "index");
				variables[element.variableName] = true;

				info.content.addCode(
					format(
						"{0} = ({1}\n);\n" +
						"for({2} = 0; {2} < {0}.length; {2}++) {\n" +
						"{3} = {0}[{2}];\n",
						[this.collectionName, element.collection, this.indexName, element.variableName]
					)
				);

				info.attributes = null; // TODO: Make invalidCodeString() to show descriptive error message on add attempt
			},
			close: function(info) {
				info.content.addCode("}\n");

				variables[this.indexName] = false;
				variables[this.collectionName] = false;
			}
		};

	default:
		return {
			open: function(info) {
				info.attributes.addString("<" + element.name);
			},
			close: function(info) {
				info.attributes.addString(">");
				info.attributes.addCodeString(info.content);
				info.content = info.attributes;
				info.attributes = null;
				info.content.addString("</" + element.name + ">");
			}
		};
	}
}

function compileElement(utilities, variables, item) {
	var info = {
		content: new CodeString("__output")
	};

	switch(item.type) {
	case "element":
		var elementInfo = getElementInfo(variables, item);

		info.attributes = new CodeString("__output");
		elementInfo.open(info);

		for(var i = 0; i < item.children.length; i++) {
			var child = item.children[i];

			if(child.type === "attribute") {
				info.attributes.addString(" " + child.name);

				if(child.value !== null) {
					info.attributes.addString("=\"" + interpolateAttributeValue(utilities, child.value) + "\"");
				}
			} else {
				var compiled = compileElement(utilities, variables, child);

				if(compiled.attributes) {
					info.attributes.addCodeString(compiled.attributes);
				}

				info.content.addCodeString(compiled.content);
			}
		}

		elementInfo.close(info);

		break;

	case "attribute":
		throw new SyntaxError("Attribute not valid here."); // TODO: Where?

	case "raw_string":
	case "string":
		info.content.addString(interpolateContent(utilities, item));

		break;

	default:
		throw new Error("Unrecognized type: " + item.type);
	}

	return info;
}

function compile(root) {
	var utilities = [];
	var variables = {};

	var code = root.children.map(function(item) {
		var compiled = compileElement(utilities, variables, item);

		return compiled.content.string;
	}).join("");

	return createUtilities(utilities) + "var " + Object.keys(variables).map(function(variable) {
		return variable + ", ";
	}).join("") + "__output = '" + code + "';\nreturn __output;";
}

module.exports.compile = compile;
