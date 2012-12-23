"use strict";

var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

var push = Array.prototype.push;

var voidTags = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];

var htmlAttributeName = /^[^ \t\r\n\f"'>\/=\0\7\b\27\127]+$/;

function escapeText(text) {
	return text.replace(/&/g, "&amp;")
	           .replace(/</g, "&lt;")
	           .replace(/>/g, "&gt;");
}

function escapeAttributeText(text) {
	return text.replace(/&/g, "&amp;")
	           .replace(/"/g, "&quot;");
}

function LiteralString(contents) {
	this.contents = contents;
}

function createModel(content) {
	var element = {name: content[0], attributes: {}, children: []};
	var queue = content.slice(1);

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
				push.apply(queue, item);
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
			if(!htmlAttributeName.test(attributeName)) {
				throw new Error("Invalid HTML attribute name “" + attributeName + "”.");
			}

			output += " " + attributeName;

			if(attributeValue !== true) {
				output += "=\"" + escapeAttributeText(attributeValue) + "\"";
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
			output += child.contents;
		} else {
			output += renderElement(child, options);
		}
	});

	return output + "</" + element.name + ">";
}

function Template(filePath) {
	this.filePath = filePath;
	this.script = vm.createScript(fs.readFileSync(filePath, "utf-8"), filePath);
}

Template.prototype.render = function(data, options) {
	options = options || {};
	var dtd = options.doctype === undefined ? "<!DOCTYPE html>" : options.doctype;

	var content = this.script.runInNewContext(data);

	assert(Array.isArray(content) && typeof content[0] === "string" && content[0].slice(-1) !== "=");

	var model = createModel(content);

	return dtd + renderElement(model, options);
};

module.exports.Template = Template;
module.exports.LiteralString = LiteralString;
