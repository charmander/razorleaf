"use strict";

var assert = require("assert");

var push = Array.prototype.push;

var identifierCharacter = /[\w\-]/;
var whitespaceCharacter = /[^\S\n]/;
var interpolatedStringPart = /#{((?:\\.|[^}])+)}|./g;
var voidTags = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
var templateUtilities = "var __amp = /&/g, __quot = /\"/g, __lt = /</g, __gt = />/g, __escapeAttributeValue = function(string) { return string.replace(__amp, '&amp;').replace(__quot, '&quot;'); }, __escapeContent = function(string) { return string.replace(__amp, '&amp;').replace(__lt, '&lt;').replace(__gt, '&gt;'); };\n";

function escapeAttributeValue(string) {
	return string.replace(/&/g, "&amp;")
	             .replace(/"/g, "&quot;");
}

function escapeContent(string) {
	return string.replace(/&/g, "&amp;")
	             .replace(/</g, "&lt;")
	             .replace(/>/g, "&gt;");
}

function InterpolatedString(string) {
	this.parts = [];
	var current = "";
	var m;

	while((m = interpolatedStringPart.exec(string)) !== null) {
		if(m[1] === undefined) {
			current += m[0];
		} else {
			if(current) {
				this.parts.push(current);
				current = "";
			}

			this.parts.push({expression: m[1]});
		}
	}

	if(current) {
		this.parts.push(current);
	}
}

InterpolatedString.prototype.toAttributeValue = function() {
	return this.parts.map(function(part) {
		if(typeof part === "string") {
			return escapeAttributeValue(part);
		}

		return "' + __escapeAttributeValue((" + part.expression + "\n)) + '";
	});
};

InterpolatedString.prototype.toContent = function() {
	return this.parts.map(function(part) {
		if(typeof part === "string") {
			return escapeContent(part);
		}

		return "' + __escapeContent((" + part.expression + "\n)) + '";
	});
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
		var quote = this.read();

		if(quote !== "\"" && quote !== "'") {
			return null;
		}

		var string = "";
		var escaped = false;

		while(true) {
			if(!this.peek()) {
				return null;
			} else if(escaped) {
				escaped = false;
			} else if(this.peek() === "\\") {
				escaped = true;
			} else if(this.readExact(quote)) {
				break;
			}

			if(this.peek() === "'") {
				string += "\\";
			}

			string += this.read();
		}

		return {
			type: "string",
			content: new InterpolatedString(string)
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
			compile: function(parent) {
				parent.addContent("';\n(function(__iterating) {\nfor(var __i = 0; __i < __iterating.length; __i++) {\nvar " + this.identifier + " = __iterating[__i];\n__output += '");
				var oldAddAttribute = parent.addAttribute;
				parent.addAttribute = function() {
					throw new SyntaxError("Attribute cannot appear inside loop."); // TODO: Where‽
				};
				addChildren(parent, this.children);
				parent.addAttribute = oldAddAttribute;
				parent.addContent("';\n}\n})((" + this.context + "));\n__output += '");
			}
		};
	},
	if: function(indent) {
		this.readWhitespace();

		return {
			type: "if",
			condition: this.readLine(),
			children: this.readBlock(indent),
			compile: function(parent) {
				parent.addAttribute("';\nvar __condition = (" + this.condition + "\n);\nif(__condition) {\n__output += '");
				parent.addContent("';\nif(__condition) {\n__output += '");
				addChildren(parent, this.children);
				parent.addAttribute("';\n}\n__output += '");
				parent.addContent("';\n}\n__output += '");
			}
		};
	},
	doctype: function(indent) {
		this.readBlock(indent);

		return {
			type: "doctype",
			compile: function(parent) {
				parent.addContent("<!DOCTYPE html>");
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

function compileElement(element) {
	var isVoid = voidTags.indexOf(element.name) !== -1;
	var compiled = "<" + element.name;
	var content = "";
	var manager = {
		name: element.name,
		isVoid: isVoid,
		addContent: function(element) {
			content += element;
		},
		addAttribute: function(attribute) {
			compiled += attribute;
		}
	};

	if(element.children) {
		addChildren(manager, element.children);
	}

	compiled += ">" + content;

	if(!isVoid) {
		compiled += "</" + element.name + ">";
	}

	return compiled;
}

function addChildren(parent, children) {
	children.forEach(function(child) {
		if(child.type === "attribute") {
			parent.addAttribute(" " + child.name);

			if(child.value !== null) {
				parent.addAttribute("=\"" + child.value.toAttributeValue() + "\"");
			}
		} else if(child.type === "element") {
			if(parent.isVoid && child.name) {
				throw new SyntaxError("Void element <" + parent.name + "> cannot have child elements.");
			}

			parent.addContent(compileElement(child));
		} else if(child.type === "string") {
			parent.addContent(child.content.toContent());
		} else {
			child.compile(parent);
		}
	});
}

function compile(template) {
	var tree = parse(template);

	var compiled = templateUtilities + "var __output = '";

	addChildren({
		addContent: function(content) {
			compiled += content;
		}
	}, tree);

	compiled += "';\nreturn __output;";

	return new Function(["data"], compiled);
}

module.exports.compile = compile;
