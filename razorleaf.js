"use strict";

var assert = require("assert");
var vm = require("vm");
var esprima = require("esprima");
var escodegen = require("escodegen");

var unshift = Array.prototype.unshift;
var toString = Object.prototype.toString;

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

function render(queue) {
	var name = queue.shift();
	var rendered = "<" + name;

	if(toString.call(queue[0]) === "[object Object]") {
		var attributes = queue.shift();

		for(var x in attributes) {
			if(attributes.hasOwnProperty(x)) {
				var value = attributes[x];

				if(value !== null && value !== undefined && value !== false) {
					rendered += " " + x;

					if(value !== true) {
						rendered += "=\"" + escapeAttributeText(String(value)) + "\"";
					}
				}
			}
		}
	}

	rendered += ">";

	if(voidTags.indexOf(name.toLowerCase()) !== -1) {
		return rendered;
	}

	while(queue.length > 0) {
		var item = queue.shift();

		if(Array.isArray(item)) {
			if(typeof item[0] === "string") {
				rendered += render(item);
			} else {
				unshift.apply(queue, item);
			}
		} else if(item instanceof LiteralString) {
			rendered += item.content;
		} else if(item !== null && item !== undefined) {
			rendered += escapeText(String(item));
		}
	}

	return rendered + "</" + name + ">";
}

function Template(template, filePath, options) {
	this.filePath = filePath;
	this.options = extend({
		dtd: "<!DOCTYPE html>",
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

	return this.options.dtd + render(content);
};

module.exports.Template = Template;
module.exports.LiteralString = LiteralString;
