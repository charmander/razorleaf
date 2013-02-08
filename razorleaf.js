"use strict";

var assert = require("assert");
var vm = require("vm");
var esprima = require("esprima");
var escodegen = require("escodegen");

var push = Array.prototype.push;
var unshift = Array.prototype.unshift;

function extend(destination, source) {
	if(source !== undefined) {
		Object.keys(source).forEach(function(key) {
			destination[key] = source[key];
		});
	}

	return destination;
}

var voidTags = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];

var amp = /&/g;
var lt = /</g;
var gt = />/g;
var quot = /"/g;

function escapeText(text) {
	return text.replace(amp, "&amp;")
	           .replace(lt, "&lt;")
	           .replace(gt, "&gt;");
}

function escapeAttributeText(text) {
	return text.replace(amp, "&amp;")
	           .replace(quot, "&quot;");
}

function LiteralString(content) {
	this.content = content;
}

function scriptToFunction(script) {
	var stack = [];
	var program = esprima.parse(script);
	var current = program.body;

	var makeReturn = function(statement) {
		statement.expression = {
			type: "AssignmentExpression",
			operator: "=",
			left: {
				type: "Identifier",
				name: "__retval"
			},
			right: statement.expression
		};
	};

	do {
		var lastExpressionStatement = null;

		current.forEach(function(item) {
			if(item.type === "FunctionDeclaration") {
				return;
			}

			if(item.type === "ExpressionStatement") {
				lastExpressionStatement = item;
			}

			if(item.body) {
				if(Array.isArray(item.body)) {
					stack.push(item.body);
				} else {
					stack.push([item.body]);
				}
			}

			if(item.consequent) {
				stack.push([item.consequent]);
			}

			if(item.alternate) {
				stack.push([item.alternate]);
			}
		});

		if(lastExpressionStatement) {
			makeReturn(lastExpressionStatement);
		}

		current = stack.pop();
	} while(current);

	program.body.unshift({
		type: "VariableDeclaration",
		declarations: [
			{
				type: "VariableDeclarator",
				id: {
					type: "Identifier",
					name: "__retval"
				},
				init: null
			}
		],
		kind: "var"
	});

	program.body.push({
		type: "ReturnStatement",
		argument: {
			type: "Identifier",
			name: "__retval"
		}
	});

	return escodegen.generate(program, {format: {compact: true}});
}

function createModel(queue) {
	var element = {name: queue.shift(), attributes: {}, children: []};

	while(queue.length > 0) {
		var item = queue.shift();

		if(Array.isArray(item)) {
			if(typeof item[0] === "string") {
				if(item[0].slice(-1) === "=") {
					if(item.length !== 2) {
						throw new TypeError("An attribute array should have exactly 2 elements.");
					}

					element.attributes[item[0].slice(0, -1)] = item[1];
				} else {
					element.children.push(createModel(item));
				}
			} else {
				unshift.apply(queue, item);
			}
		} else if(item instanceof LiteralString) {
			element.children.push(item);
		} else if(item !== null && item !== undefined) {
			element.children.push(String(item));
		}
	}

	return element;
}

function renderElement(element, options) {
	var isVoid = (voidTags.indexOf(element.name.toLowerCase()) !== -1);

	if(isVoid && element.children.length > 0) {
		throw new Error("Expected void element “" + element.name + "” to be empty.");
	}

	var output = "<" + element.name;

	Object.keys(element.attributes).forEach(function(attributeName) {
		var attributeValue = element.attributes[attributeName];

		if(attributeValue !== null && attributeValue !== undefined && attributeValue !== false) {
			output += " " + attributeName;

			if(attributeValue !== true) {
				output += "=\"" + escapeAttributeText(String(attributeValue)) + "\"";
			} else if(options.xhtml) {
				output += "=\"" + attributeName + "\"";
			}
		}
	});

	if(isVoid) {
		return options.xhtml ? output + " />" : output + ">";
	}

	output += ">";

	element.children.forEach(function(child) {
		if(typeof child === "string") {
			output += escapeText(child);
		} else if(child instanceof LiteralString) {
			output += child.content;
		} else {
			output += renderElement(child, options);
		}
	});

	return output + "</" + element.name + ">";
}

function Template(template, filePath, options) {
	this.filePath = filePath;
	this.options = extend({
		dtd: "<!DOCTYPE html>",
		xhtml: false,
		gzip: false,
		debug: false
	}, options);

	if(this.options.debug) {
		this.script = vm.createScript(template, filePath);
	} else {
		this.script = new Function(["data"], scriptToFunction(template));
	}
}

Template.prototype.render = function(data) {
	var content;

	if(this.options.debug) {
		content = this.script.runInNewContext({data: data});
	} else {
		content = this.script(data);
	}

	assert(Array.isArray(content) && typeof content[0] === "string" && content[0].slice(-1) !== "=");

	var model = createModel(content);

	return this.options.dtd + renderElement(model, this.options);
};

module.exports.Template = Template;
module.exports.LiteralString = LiteralString;
