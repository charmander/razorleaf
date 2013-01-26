"use strict";

var assert = require("assert");
var vm = require("vm");

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
	this.script = vm.createScript(template, filePath);
	this.options = extend({
		dtd: "<!DOCTYPE html>",
		xhtml: false,
		gzip: false
	}, options);
}

Template.prototype.render = function(data) {
	global.data = data;
	var content = this.script.runInThisContext();

	assert(Array.isArray(content) && typeof content[0] === "string" && content[0].slice(-1) !== "=");

	var model = createModel(content);

	return this.options.dtd + renderElement(model, this.options);
};

module.exports.Template = Template;
module.exports.LiteralString = LiteralString;
