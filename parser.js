"use strict";

var push = Array.prototype.push;
var utilities = require("./utilities");

var IDENTIFIER_CHARACTER = /[\w-]/;
var JS_IDENTIFIER_CHARACTER = /\w/; // Others are not included for simplicity’s sake.

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

function InterpolatedString(escapeFunction) {
	this.parts = [];
	this.escapeFunction = escapeFunction;
}

InterpolatedString.prototype.addText = function(text) {
	this.parts.push({
		type: "text",
		value: text
	});
};

InterpolatedString.prototype.addCode = function(code) {
	this.parts.push({
		type: "code",
		value: code
	});
};

InterpolatedString.prototype.addBuffer = function(buffer) {
	push.apply(this.parts, buffer.parts);
};

Object.defineProperty(InterpolatedString.prototype, "code", {
	get: function() {
		var isCode = false;
		var code = "";

		for(var i = 0; i < this.parts.length; i++) {
			var part = this.parts[i];

			if(part.type === "code") {
				if(!isCode) {
					code += "' + ";
					isCode = true;
				}

				if(this.escapeFunction) {
					code += "__util." + this.escapeFunction + "((" + part.value + "\n)) + ";
				} else {
					code += "(" + part.value + "\n) + ";
				}
			} else {
				if(isCode) {
					code += "'";
					isCode = false;
				}

				if(this.escapeFunction) {
					code += escapeStringLiteral(utilities[this.escapeFunction](part.value));
				} else {
					code += escapeStringLiteral(part.value);
				}
			}
		}

		if(isCode) {
			code += "'";
		}

		return code;
	}
});

var specialBlocks = {};

var states = {
	content: function(c) {
		if(c === " ") {
			return states.content;
		}

		if(c === "\n") {
			this.indent = 0;
			return states.indent;
		}

		if(c === "\"") {
			this.context = {
				type: "string",
				content: new InterpolatedString("escapeContent"),
				current: "",
				parent: this.context,
				unterminated: this.error("Expected end of string before end of input, starting"),
				unexpected: this.error("A string here is not valid")
			};
			this.context.parent.children.push(this.context);
			return states.string;
		}

		if(c === "!" && this.peek() === "\"") {
			this.skip();
			this.context = {
				type: "string",
				content: new InterpolatedString(null),
				current: "",
				parent: this.context,
				unterminated: this.error("Expected end of string before end of input, starting"),
				unexpected: this.error("A string here is not valid")
			};
			this.context.parent.children.push(this.context);
			return states.string;
		}

		if(IDENTIFIER_CHARACTER.test(c)) {
			this.context = {
				name: c,
				parent: this.context,
				indent: this.indent,
				unexpected: this.prepareError()
			};
			this.context.parent.children.push(this.context);
			return states.identifier;
		}

		throw this.error("Unexpected " + c);
	},
	indent: function(c) {
		if(c === "\n") {
			this.indent = 0;
			return states.indent;
		}

		if(c !== "\t") {
			while(this.indent <= this.context.indent) {
				this.context = this.context.parent;
			}

			if(this.indent > this.context.indent + 1) {
				throw this.error("Excessive indent");
			}

			return this.pass(states.content);
		}

		this.indent++;
		return states.indent;
	},
	string: function(c) {
		if(c === "\"") {
			if(this.context.current) {
				this.context.content.addText(this.context.current);
			}

			this.context = this.context.parent;
			return states.content;
		}

		if(c === "\\") {
			this.context.current += c;
			return states.escaped;
		}

		if(c === "#" && this.peek() === "{") {
			if(this.context.current) {
				this.context.content.addText(this.context.current);
				this.context.current = "";
			}
			this.context = {
				type: "interpolation",
				value: "",
				parent: this.context,
				unterminated: this.error("Expected end of interpolated section before end of input, starting")
			};
			this.skip();
			return states.interpolation;
		}

		this.context.current += c;
		return states.string;
	},
	escaped: function(c) {
		this.context.current += c;
		return states.string;
	},
	interpolation: function(c) {
		if(c === "\\") {
			if(this.peek() === "}") {
				this.skip();
				this.context.value += "}";
				return states.interpolation;
			}
		} else if(c === "}") {
			this.context.parent.content.addCode(this.context.value);
			this.context = this.context.parent;
			return states.string;
		}

		this.context.value += c;
		return states.interpolation;
	},
	identifier: function(c) {
		if(c === ":") {
			if(!IDENTIFIER_CHARACTER.test(this.peek())) {
				this.context.type = "attribute";
				this.context.value = null;
				this.context.unexpected = this.context.unexpected("An attribute here is not valid");

				return states.attributeValue;
			}
		} else if(!IDENTIFIER_CHARACTER.test(c)) {
			this.context.type = "element";
			this.context.children = [];
			this.context.unexpected = this.context.unexpected("An element here is not valid");

			if(specialBlocks.hasOwnProperty(this.context.name)) {
				var specialBlock = specialBlocks[this.context.name];

				specialBlock.begin.call(this);

				return this.pass(specialBlock.initialState);
			}

			return this.pass(states.content);
		}

		this.context.name += c;
		return states.identifier;
	},
	attributeValue: function(c) {
		if(c === " ") {
			return states.attributeValue;
		}

		if(c === "!") {
			throw this.error("Attributes cannot have raw strings as values");
		}

		if(c === "\"") {
			var attribute = this.context;

			attribute.value = this.context = {
				type: "string",
				content: new InterpolatedString("escapeAttributeValue"),
				current: "",
				parent: attribute.parent,
				unterminated: this.error("Expected end of string before end of input, starting")
			};

			return states.string;
		}

		this.context = this.context.parent;

		return this.pass(states.content);
	}
};

function parse(template) {
	var i;
	var c;
	var state = states.content;

	var line = 1;
	var lineStart = 0;

	var root = {
		type: "root",
		children: [],
		includes: [],
		extends: null,
		blocks: {},
		indent: -1
	};

	template += "\n";

	var parser = {
		template: template,
		context: root,
		root: root,
		indent: 0,
		pass: function(state) {
			return state.call(parser, c);
		},
		peek: function(count) {
			return count === undefined ? template.charAt(i + 1) : template.substr(i + 1, count);
		},
		skip: function(count) {
			if(count === undefined) {
				count = 1;
			}

			for(var j = 0; j < count; j++) {
				i++;

				if(template.charAt(i) === "\n") {
					parser.beginLine();
				}
			}
		},
		error: function(message) {
			var details = message + " at line " + line + ", character " + (i - lineStart + 1) + ".";

			return new SyntaxError(details);
		},
		prepareError: function() {
			var location = " at line " + line + ", character " + (i - lineStart + 1) + ".";

			return function(message) {
				return new SyntaxError(message + location);
			};
		},
		beginLine: function() {
			line++;
			lineStart = i + 1;
		}
	};

	for(i = 0; i < template.length; i++) {
		c = template.charAt(i);

		if(c === "\n") {
			parser.beginLine();
		}

		state = state.call(parser, c);
	}

	switch(state) {
	case states.indent:
		break;

	case states.string:
	case states.interpolation:
		throw parser.context.unterminated;

	default:
		// If this error is thrown, an extension to the parser has most likely parsed incorrectly.
		throw new Error("Parsing bug: expected final state to be indent.");
	}

	return root;
}

specialBlocks.doctype = {
	begin: function() {
		var parser = this;

		this.context.type = "doctype";
		delete this.context.name;

		this.context.children = {
			push: function() {
				throw parser.error("doctype element cannot have content");
			}
		};
	},
	initialState: states.content
};

specialBlocks.if = {
	begin: function() {
		this.context.type = "if";
		this.context.condition = "";

		delete this.context.name;
	},
	initialState: function whitespace(c) {
		if(c !== " ") {
			return this.pass(specialBlocks.if.condition);
		}

		return whitespace;
	},
	condition: function condition(c) {
		if(c === "\n") {
			return this.pass(states.content);
		}

		this.context.condition += c;
		return condition;
	}
};

specialBlocks.else = {
	begin: function() {
		this.context.parent.children.splice(-1, 1);

		var previous = this.context.parent.children[this.context.parent.children.length - 1];

		if(previous.type !== "if") {
			throw this.error("Unexpected else");
		}

		previous.else = this.context;
		this.context.type = "else";
		delete this.context.name;
	},
	initialState: function() {
		return this.pass(states.content);
	}
};

specialBlocks.for = {
	begin: function() {
		this.context.type = "for";
		this.context.variableName = "";
		this.context.collection = "";
		delete this.context.name;
	},
	initialState: function whitespace(c) {
		if(c !== " ") {
			return this.pass(specialBlocks.for.variableName);
		}

		return whitespace;
	},
	variableName: function variableName(c) {
		if(!JS_IDENTIFIER_CHARACTER.test(c)) {
			if(!this.context.variableName) {
				throw this.error("Expected variable name");
			}

			if(c !== " " || this.peek(3) !== "in ") {
				throw this.error("Expected in");
			}

			this.skip(3);

			return specialBlocks.for.whitespace;
		}

		this.context.variableName += c;
		return variableName;
	},
	whitespace: function whitespace(c) {
		if(c !== " ") {
			return this.pass(specialBlocks.for.collection);
		}

		return whitespace;
	},
	collection: function collection(c) {
		if(c === "\n") {
			return this.pass(states.content);
		}

		this.context.collection += c;
		return collection;
	}
};

specialBlocks.include = {
	begin: function() {
		var parser = this;

		this.context.type = "include";
		this.context.template = "";
		delete this.context.name;

		this.context.children = {
			push: function() {
				throw parser.error("include element cannot have content");
			}
		};

		this.root.includes.push(this.context);
	},
	initialState: function whitespace(c) {
		if(c !== " ") {
			return this.pass(specialBlocks.include.template);
		}

		return whitespace;
	},
	template: function template(c) {
		if(c === "\n") {
			return this.pass(states.content);
		}

		this.context.template += c;
		return template;
	}
};

specialBlocks.block = {
	begin: function() {
		this.context.type = "block";
		this.context.name = "";
	},
	initialState: function whitespace(c) {
		if(c !== " ") {
			var replacesNonExistentError = this.prepareError();
			this.context.replacesNonExistentBlock = function() {
				return replacesNonExistentError("Block " + this.name + " does not exist in a parent template");
			};

			return this.pass(specialBlocks.block.name);
		}

		return whitespace;
	},
	name: function name(c) {
		if(c === "\n") {
			// TODO: Warn that duplicating block names within the same template serves no purpose.
			this.root.blocks[this.context.name] = this.context;
			return this.pass(states.content);
		}

		this.context.name += c;
		return name;
	}
};

specialBlocks.extends = {
	begin: function() {
		this.context.type = "extends";

		if(this.root.extends !== null) {
			throw this.error("A template cannot extend more than one template");
		}

		if(this.root.children.length !== 1) {
			throw this.error("extends must appear at the beginning of a template");
		}

		this.root.extends = "";
		delete this.context.name;
	},
	initialState: function whitespace(c) {
		if(c !== " ") {
			return this.pass(specialBlocks.extends.template);
		}

		return whitespace;
	},
	template: function template(c) {
		if(c === "\n") {
			return this.pass(states.content);
		}

		this.root.extends += c;
		return template;
	}
};

module.exports.parse = parse;
module.exports.states = states;
module.exports.specialBlocks = specialBlocks;
