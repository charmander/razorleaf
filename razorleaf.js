"use strict";

var assert = require("assert");

var push = Array.prototype.push;

var identifierCharacter = /[\w\-]/;
var whitespaceCharacter = /[^\S\n]/;
var voidTags = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
var templateUtilities = "var __amp = /&/g, __quot = /\"/g, __lt = /</g, __gt = />/g, __escapeAttributeValue = function(string) { return String(string).replace(__amp, '&amp;').replace(__quot, '&quot;'); }, __escapeContent = function(string) { return String(string).replace(__amp, '&amp;').replace(__lt, '&lt;').replace(__gt, '&gt;'); };\n";

function escapeAttributeValue(string) {
	return string.replace(/&/g, "&amp;")
	             .replace(/"/g, "&quot;");
}

function escapeContent(string) {
	return string.replace(/&/g, "&amp;")
	             .replace(/</g, "&lt;")
	             .replace(/>/g, "&gt;");
}

function InterpolatedString(parts, unescaped) {
	this.parts = parts;
	this.unescaped = unescaped;
}

InterpolatedString.prototype.toUnescapedContent = function() {
	return this.parts.map(function(part) {
		if(typeof part === "string") {
			return part;
		}

		return "' + (" + part.expression + "\n) + '";
	}).join("");
};

InterpolatedString.prototype.toAttributeValue = function() {
	if(this.unescaped) {
		return this.toUnescapedContent();
	}

	return this.parts.map(function(part) {
		if(typeof part === "string") {
			return escapeAttributeValue(part);
		}

		return "' + __escapeAttributeValue((" + part.expression + "\n)) + '";
	}).join("");
};

InterpolatedString.prototype.toContent = function() {
	if(this.unescaped) {
		return this.toUnescapedContent();
	}

	return this.parts.map(function(part) {
		if(typeof part === "string") {
			return escapeContent(part);
		}

		return "' + __escapeContent((" + part.expression + "\n)) + '";
	}).join("");
};

function Parser(template) {
	this.template = template;
	this.index = -1;
	this.line = 1;
	this.character = 0;
}

Parser.prototype.reading = function(reader) {
	var originalIndex = this.index;
	var originalLine = this.line;
	var originalCharacter = this.character;
	var read = reader.call(this);

	assert(read !== undefined);

	if(read !== null) {
		return read;
	}

	this.index = originalIndex;
	this.line = originalLine;
	this.character = originalCharacter;

	return null;
};

Parser.prototype.peek = function() {
	return this.template[this.index + 1] || null;
};

Parser.prototype.read = function() {
	if(this.index === this.template.length) {
		return null;
	}

	this.index++;

	var c = this.template[this.index];

	if(c === "\n") {
		this.line++;
		this.character = 1;
	} else {
		this.character++;
	}

	return c;
};

Parser.prototype.readExact = function(string) {
	return this.reading(function() {
		for(var i = 0; i < string.length; i++) {
			if(this.read() !== string[i]) {
				return null;
			}
		}

		return string;
	});
};

Parser.prototype.readIdentifier = function() {
	return this.reading(function() {
		var identifier = "";

		while(this.peek() && identifierCharacter.test(this.peek())) {
			identifier += this.read();
		}

		return identifier || null;
	});
};

Parser.prototype.readWhitespace = function() {
	var whitespace = "";

	while(whitespaceCharacter.test(this.peek())) {
		whitespace += this.read();
	}

	return whitespace;
};

Parser.prototype.readAttribute = function() {
	return this.reading(function() {
		var name = this.readIdentifier();

		if(!name) {
			return null;
		}

		this.readWhitespace();

		if(!this.readExact(":")) {
			return null;
		}

		this.readWhitespace();

		var value = this.readString();

		return {
			type: "attribute",
			name: name,
			value: value && value.content
		};
	});
};

Parser.prototype.readLine = function() {
	var line = "";

	while(this.peek() && this.peek() !== "\n") {
		line += this.read();
	}

	this.read();

	return line;
};

Parser.prototype.readString = function() {
	return this.reading(function() {
		var unescaped = !!this.readExact("!");
		var quote = this.read();

		if(quote !== "\"" && quote !== "'") {
			return null;
		}

		var parts = [];
		var currentPart = "";
		var escaped = false;
		var interpolating = false;

		while(true) {
			if(!this.peek()) {
				return null;
			} else if(escaped) {
				escaped = false;
			} else if(this.peek() === "\\") {
				escaped = true;
			} else if(interpolating) {
				if(this.readExact("}")) {
					interpolating = false;
					parts.push({expression: currentPart});
					currentPart = "";
					continue;
				}
			} else if(this.readExact("#{")) {
				interpolating = true;
				parts.push(currentPart);
				currentPart = "";
				continue;
			} else if(this.readExact(quote)) {
				break;
			}

			if(!interpolating && this.peek() === "'") {
				currentPart += "\\";
			}

			currentPart += this.read();
		}

		if(currentPart) {
			parts.push(currentPart);
		}

		return {
			type: "string",
			content: new InterpolatedString(parts, unescaped)
		};
	});
};

Parser.prototype.readBlankLine = function() {
	return this.readExact("\n");
};

var control = {
	for: function(indent) {
		this.readWhitespace();

		var identifier = this.readIdentifier();

		if(!identifier) {
			return null;
		}

		this.readWhitespace();

		if(this.readIdentifier() !== "in") {
			return null;
		}

		this.readWhitespace();

		var context = this.readLine();

		return {
			type: "for",
			identifier: identifier,
			context: context,
			children: this.readBlock(indent),
			compile: function() {
				var children = compileChildren(this.children);

				if(children.attributes) {
					throw new SyntaxError("Attributes are not allowed directly inside loops."); // TODO: Where‽
				}

				var code = "(function(__iterating) {\nvar __i, " + this.identifier + ";\nfor(__i = 0; " + this.identifier + " = __iterating[__i]; __i++) {\n";
				code += children.code;
				code += "\n}\n})((" + this.context + "));";

				return {attributes: false, content: children.content, code: code};
			}
		};
	},
	if: function(indent) {
		this.readWhitespace();

		var condition = this.readLine();
		var success = this.readBlock(indent);
		while(this.readBlankLine()) {
			// Ignore
		}
		var failure;

		if(this.readExact(indent) && this.readExact("else")) {
			if(!this.readBlankLine()) {
				throw new SyntaxError("Expected end of line at line " + this.line + ", character " + this.character + ".");
			}

			failure = this.readBlock(indent);
		}

		return {
			type: "if",
			condition: condition,
			success: success,
			failure: failure,
			compile: function() {
				var success = compileChildren(this.success);
				var info = {attributes: success.attributes, content: success.content};
				info.code = "if(" + this.condition + "\n) {\n" + success.code + "\n}";

				if(this.failure) {
					var failure = compileChildren(this.failure);

					if(failure.attributes) {
						info.attributes = true;
					}

					if(failure.content) {
						info.content = true;
					}

					info.code += " else {\n" + failure.code + "\n}";
				}

				info.code += "\n";

				return info;
			}
		};
	},
	else: function() {
		throw new SyntaxError("Unexpected else at line " + this.line + ", character " + this.character + ".");
	},
	doctype: function(indent) {
		assert.strictEqual(this.readBlock(indent).length, 0, "doctype does not contain elements");

		return {
			type: "doctype",
			compile: function() {
				return {content: false, attributes: false, code: "__top.content += '<!DOCTYPE html>';"};
			}
		};
	}
};

Parser.prototype.readBlock = function(indent) {
	return this.reading(function() {
		var children = [];
		var child;

		while(true) {
			child = this.readItem(indent);

			if(child) {
				children.push(child);
			} else if(!this.readBlankLine()) {
				break;
			}
		}

		return children;
	});
};

Parser.prototype.readElement = function(indent, inline) {
	return this.reading(function() {
		var name = this.readIdentifier();

		if(!name) {
			return null;
		}

		if(control.hasOwnProperty(name)) {
			if(inline) {
				return null;
			}

			return control[name].call(this, indent);
		}

		var children = [];
		var child;

		// Inline elements
		while(true) {
			this.readWhitespace();

			child = this.readString() || this.readAttribute() || this.readElement(null, true);

			if(!child) {
				break;
			}

			children.push(child);
		}

		if(!inline) {
			if(!this.readBlankLine()) {
				return null;
			}

			push.apply(children, this.readBlock(indent));
		}

		return {
			type: "element",
			name: name,
			children: children
		};
	});
};

Parser.prototype.readItem = function(indent) {
	return this.reading(function() {
		if(this.readExact(indent) === null) {
			return null;
		}

		var newIndent = this.readWhitespace();

		if(!newIndent) {
			return null;
		}

		return this.readString() || this.readAttribute() || this.readElement(indent + newIndent);
	});
};

Parser.prototype.readTemplate = function() {
	var elements = [];
	var element;

	while(true) {
		element = this.readString() || this.readElement("");

		if(element) {
			elements.push(element);
		} else if(!this.readWhitespace() && !this.readBlankLine()) {
			break;
		}
	}

	return elements;
};

function parse(template) {
	var parser = new Parser(template);
	var root = parser.readTemplate();

	if(parser.index !== template.length - 1) {
		throw new SyntaxError("Unexpected “" + template.charAt(parser.index + 1) + "” at line " + parser.line + ", character " + parser.character + ".");
	}

	return root;
}

function compileStatic(element) {
	var isVoid = voidTags.indexOf(element.name) !== -1;
	var startTag = "<" + element.name;
	var content = "";

	for(var i = 0; i < element.children.length; i++) {
		var child = element.children[i];

		if(child.type === "attribute") {
			startTag += " " + child.name + "=\"" + child.value.toAttributeValue() + "\"";
		} else if(child.type === "element") {
			var staticMarkup = compileStatic(child);

			if(staticMarkup === null) {
				return null;
			}

			content += staticMarkup;
		} else if(child.type === "string") {
			content += child.content.toContent();
		} else {
			return null;
		}
	}

	if(isVoid) {
		if(content) {
			throw new SyntaxError("Void element " + element.name + " cannot contain elements."); // TODO: Where‽
		}

		return startTag + ">";
	}

	return startTag + ">" + content + "</" + element.name + ">";
}

function compileChildren(children) {
	var info = {attributes: false, content: false};
	info.code = children.map(function(child) {
		if(child.type === "attribute") {
			info.attributes = true;

			if(child.value) {
				return "__top.attributes += ' " + child.name + "=\"" + child.value.toAttributeValue() + "\"';";
			} else {
				return "__top.attributes += ' " + child.name + "';";
			}
		}

		if(child.type === "element") {
			info.content = true;

			var staticMarkup = compileStatic(child);

			if(staticMarkup !== null) {
				return "__top.content += '" + staticMarkup + "';";
			}

			var isVoid = voidTags.indexOf(child.name) !== -1;
			var children = compileChildren(child.children);
			var compiled = "__top.content += '<" + child.name + "';\n__top = {attributes: '', content: '', next: __top};\n";
			compiled += children.code;

			var parts = [];

			if(children.attributes) {
				parts.push("__top.attributes");
			}

			parts.push("'>'");

			if(children.content) {
				if(isVoid) {
					throw new SyntaxError("Void element " + child.name + " cannot contain elements."); // TODO: Where‽
				}

				parts.push("__top.content");
			}

			if(!isVoid) {
				parts.push("'</" + child.name + ">'");
			}

			compiled += "\n__top.next.content += " + parts.join(" + ") + ";\n__top = __top.next;";

			return compiled;
		}

		if(child.type === "string") {
			info.content = true;
			return "__top.content += '" + child.content.toContent() + "';";
		}

		var childInfo = child.compile();

		if(childInfo.attributes) {
			info.attributes = true;
		}

		if(childInfo.content) {
			info.content = true;
		}

		return childInfo.code;
	}).join("\n");

	return info;
}

function compile(template) {
	if(typeof template !== "string") {
		throw new TypeError("Template should be a string.");
	}

	var tree = parse(template);
	var compiled = templateUtilities + "var __top = {attributes: null, content: '', next: null};\n";

	compiled += compileChildren(tree).code;
	compiled += "\n\nreturn __top.content;";

	return new Function("data", compiled);
}

module.exports.compile = compile;
