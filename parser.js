"use strict";

var utilities = require("./utilities");
var CodeBlock = utilities.CodeBlock;

var HEX = /[\da-fA-F]/;
var DIGIT = /\d/;
var IDENTIFIER = /[\w-]/;
var RECOGNIZABLE = /[!-~]/;
var POSSIBLE_COMMENT = /\/\/|<!--/;
var BLOCK_OR_TEMPLATE_NAME = /\S/;
var JS_IDENTIFIER = /\w/;

var singleCharEscapes = {
	"\\": "\\\\",
	n: "\n",
	r: "\r",
	t: "\t",
	v: "\v",
	f: "\f",
	b: "\b",
	0: "\0"
};

function isExpression(js) {
	try {
		new Function("'use strict'; (" + js + "\n)");
		return true;
	} catch (e) {
		return false;
	}
}

function describe(c) {
	if (RECOGNIZABLE.test(c)) {
		return c;
	}

	return require("./unicode")[c.charCodeAt(0)] || JSON.stringify(c);
}

var states = {
	indent: function(parser, c) {
		if (c === null && parser.indentString) {
			parser.warn("Trailing whitespace");
			return;
		}

		if (c === "\n") {
			if (parser.indentString) {
				parser.warn("Whitespace-only line");
			}

			parser.indentString = "";
			return states.indent;
		}

		if (c === "\t") {
			if (parser.indentType && parser.indentType.indentCharacter !== "\t") {
				throw parser.error("Unexpected tab indent; indent was already determined to be " + parser.indentType.name + " by line " + parser.indentType.determined.line + ", character " + parser.indentType.determined.character);
			}
		} else if (c !== " ") {
			if (!parser.indentString) {
				parser.indent = 0;
			} else if (parser.indentType) {
				if (parser.indentType.indentCharacter === "\t") {
					var i = parser.indentString.indexOf(" ");
					parser.indent = i === -1 ? parser.indentString.length : i;
				} else {
					var level = parser.indentString.length / parser.indentType.spaces;

					if (level !== (level | 0)) {
						throw parser.error("Invalid indent level " + level + "; indent was determined to be " + parser.indentType.name + " by line " + parser.indentType.determined.line + ", character " + parser.indentType.determined.character);
					}

					parser.indent = level;
				}
			} else {
				parser.indent = 1;

				if (parser.indentString.charAt(0) === "\t") {
					parser.indentType = {
						indentCharacter: "\t",
						name: "one tab"
					};
				} else {
					parser.indentType = {
						indentCharacter: " ",
						name: parser.indentString.length + " space" + (parser.indentString.length === 1 ? "" : "s"),
						spaces: parser.indentString.length
					};
				}

				parser.indentType.determined = {
					line: parser.position.line,
					character: parser.position.character
				};
			}

			if (parser.indent > parser.context.indent + 1) {
				throw parser.error("Excessive indent " + parser.indent + "; expected " + (parser.context.indent + 1) + " or smaller");
			}

			while (parser.context.indent >= parser.indent) {
				parser.context = parser.context.parent;
			}

			return states.content(parser, c);
		}

		parser.indentString += c;
		return states.indent;
	},
	content: function(parser, c) {
		if (c === null) {
			return;
		}

		if (parser.context.type === "attribute") {
			if (c === "!") {
				throw parser.error("Attributes cannot have raw strings for values");
			}

			if (c !== " " && c !== '"') {
				parser.context = parser.context.parent;
			}
		}

		if (c === "\n") {
			parser.indentString = "";
			return states.indent;
		}

		if (c === " ") {
			return states.content;
		}

		if (c === ".") {
			parser.identifier = "";
			return states.className;
		}

		if (c === "!") {
			parser.string = new CodeBlock();
			parser.escapeFunction = null;
			return states.rawString;
		}

		if (c === '"') {
			parser.string = new CodeBlock();
			parser.escapeFunction = parser.context.type === "attribute" ? "escapeAttributeValue" : "escapeContent";
			return states.string;
		}

		if (c === "#") {
			return states.comment;
		}

		if (c === "%") {
			parser.code = "";
			return states.code;
		}

		if (IDENTIFIER.test(c)) {
			parser.identifier = "";
			return states.identifier(parser, c);
		}

		throw parser.error("Unexpected " + describe(c));
	},
	comment: function(parser, c) {
		if (c === null || c === "\n") {
			return states.content(parser, c);
		}

		return states.comment;
	},
	code: function(parser, c) {
		if (c === null || c === "\n") {
			parser.context = {
				type: "code",
				code: parser.code.trim(),
				parent: parser.context,
				children: [],
				indent: parser.indent,
				position: {
					line: parser.position.line,
					character: parser.position.character
				}
			};

			parser.context.parent.children.push(parser.context);

			return states.content(parser, c);
		}

		parser.code += c;
		return states.code;
	},
	identifier: function(parser, c) {
		if (c === ":") {
			return states.possibleAttribute;
		}

		if (c !== null && IDENTIFIER.test(c)) {
			parser.identifier += c;
			return states.identifier;
		}

		if (keywords.hasOwnProperty(parser.identifier)) {
			return keywords[parser.identifier](parser, c);
		}

		parser.context = {
			type: "element",
			name: parser.identifier,
			parent: parser.context,
			children: [],
			indent: parser.indent,
			position: {
				line: parser.position.line,
				character: parser.position.character
			}
		};

		parser.context.parent.children.push(parser.context);

		return states.content(parser, c);
	},
	className: function(parser, c) {
		if (c !== null && IDENTIFIER.test(c)) {
			parser.identifier += c;
			return states.className;
		}

		if (!parser.identifier) {
			throw parser.error("Expected class name");
		}

		parser.context.children.push({
			type: "class",
			value: parser.identifier,
			parent: parser.context,
			position: {
				line: parser.position.line,
				character: parser.position.character
			}
		});

		return states.content(parser, c);
	},
	possibleAttribute: function(parser, c) {
		if (c !== null && IDENTIFIER.test(c)) {
			parser.identifier += ":" + c;
			return states.identifier;
		}

		if (c === ":") {
			parser.identifier += ":";
			return states.possibleAttribute;
		}

		parser.context = {
			type: "attribute",
			name: parser.identifier,
			value: null,
			parent: parser.context,
			position: {
				line: parser.position.line,
				character: parser.position.character
			}
		};

		parser.context.parent.children.push(parser.context);

		return states.content;
	},
	rawString: function(parser, c) {
		if (c !== '"') {
			throw parser.error("Expected beginning quote of raw string, not " + describe(c));
		}

		return states.string;
	},
	string: function(parser, c) {
		if (c === null) {
			throw parser.error("Expected end of string before end of file");
		}

		if (c === '"') {
			var string = {
				type: "string",
				value: parser.string,
				parent: parser.context,
				position: {
					line: parser.position.line,
					character: parser.position.character
				}
			};

			if (parser.context.type === "attribute") {
				parser.context.value = string;
				parser.context = parser.context.parent;
			} else {
				parser.context.children.push(string);
			}

			return states.content;
		}

		if (c === "#") {
			return states.stringPound;
		}

		if (c === "\\") {
			return states.escape;
		}

		if (parser.escapeFunction) {
			parser.string.addText(utilities[parser.escapeFunction](c));
		} else {
			parser.string.addText(c);
		}

		return states.string;
	},
	stringPound: function(parser, c) {
		if (c === "{") {
			parser.interpolation = "";
			return states.interpolation;
		}

		parser.string.addText("#");
		return states.string(parser, c);
	},
	interpolation: function(parser, c) {
		if (c === null) {
			throw parser.error("Interpolated section never resolves to a valid JavaScript expression"); // TODO: Where did it start?
		}

		if (c === "}" && isExpression(parser.interpolation)) {
			var interpolation = POSSIBLE_COMMENT.test(parser.interpolation) ? parser.interpolation + "\n" : parser.interpolation;
			parser.string.addExpression(parser.escapeFunction, interpolation);
			return states.string;
		}

		parser.interpolation += c;
		return states.interpolation;
	},
	escape: function(parser, c) {
		if (c === null) {
			throw parser.error("Expected escape character");
		}

		if (c === "#" || c === '"') {
			parser.string.addText(c);
			return states.string;
		}

		if (c === "x") {
			return states.escapeX1;
		}

		if (c === "u") {
			return states.escapeU1;
		}

		if (singleCharEscapes.hasOwnProperty(c)) {
			parser.string.addText(singleCharEscapes[c]);
			return states.string;
		}

		// TODO: Allow LineTerminator to be escaped?

		return states.string(parser, c);
	},
	escapeX1: function(parser, c) {
		if (c === null || !HEX.test(c)) {
			throw parser.error("Expected hexadecimal digit");
		}

		parser.charCode = parseInt(c, 16) << 4;
		return states.escapeX2;
	},
	escapeX2: function(parser, c) {
		if (c === null || !HEX.test(c)) {
			throw parser.error("Expected hexadecimal digit");
		}

		var escapedCharacter = String.fromCharCode(parser.charCode | parseInt(c, 16));

		if (parser.escapeFunction) {
			parser.string.addText(utilities[parser.escapeFunction](escapedCharacter));
		} else {
			parser.string.addText(escapedCharacter);
		}

		return states.string;
	},
	escapeU1: function(parser, c) {
		if (c === null || !HEX.test(c)) {
			throw parser.error("Expected hexadecimal digit");
		}

		parser.charCode = parseInt(c, 16) << 12;
		return states.escapeU2;
	},
	escapeU2: function(parser, c) {
		if (c === null || !HEX.test(c)) {
			throw parser.error("Expected hexadecimal digit");
		}

		parser.charCode |= parseInt(c, 16) << 8;
		return states.escapeU3;
	},
	escapeU3: function(parser, c) {
		if (c === null || !HEX.test(c)) {
			throw parser.error("Expected hexadecimal digit");
		}

		parser.charCode |= parseInt(c, 16) << 4;
		return states.escapeU4;
	},
	escapeU4: function(parser, c) {
		if (c === null || !HEX.test(c)) {
			throw parser.error("Expected hexadecimal digit");
		}

		var escapedCharacter = String.fromCharCode(parser.charCode | parseInt(c, 16));

		if (parser.escapeFunction) {
			parser.string.addText(utilities[parser.escapeFunction](escapedCharacter));
		} else {
			parser.string.addText(escapedCharacter);
		}

		return states.string;
	}
};

var keywords = {
	doctype: function(parser, c) {
		parser.context.children.push({
			type: "string",
			value: new CodeBlock().addText("<!DOCTYPE html>"),
			parent: parser.context,
			position: {
				line: parser.position.line,
				character: parser.position.character
			}
		});

		return states.content(parser, c);
	},
	include: function(parser, c) {
		var leadingWhitespace = function(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of included template, not " + describe(c));
		};

		var identifier = function(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.context.children.push({
					type: "include",
					template: parser.identifier,
					parent: parser.context,
					position: {
						line: parser.position.line,
						character: parser.position.character
					}
				});

				return states.content(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	extends: function(parser, c) {
		if (parser.root.children.length || parser.root.extends) {
			throw parser.error("extends must appear first in a template");
		}

		parser.root.children = {
			push: function() {
				throw parser.error("A template that extends another can only contain block actions directly");
			}
		};

		parser.root.blockActions = {};

		var leadingWhitespace = function(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of parent template, not " + describe(c));
		};

		var identifier = function(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.root.extends = parser.identifier;

				return states.content(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	block: function(parser, c) {
		var leadingWhitespace = function(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block, not " + describe(c));
		};

		var identifier = function(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				if (parser.root.blocks.hasOwnProperty(parser.identifier)) {
					throw parser.error("A block named “" + parser.identifier + "” has already been defined");
				}

				parser.context = {
					type: "block",
					name: parser.identifier,
					parent: parser.context,
					children: [],
					indent: parser.indent
				};

				parser.context.parent.children.push(parser.context);
				parser.root.blocks[parser.identifier] = parser.context;

				return states.content(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	replace: function(parser, c) {
		var leadingWhitespace = function(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block to replace, not " + describe(c));
		};

		var identifier = function(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				var newBlock = {
					type: "block",
					name: parser.identifier,
					parent: parser.context,
					children: [],
					indent: parser.indent
				};

				var action = function(block) {
					block.children = newBlock.children;
				};

				if (parser.root.blockActions.hasOwnProperty(parser.identifier)) {
					parser.root.blockActions[parser.identifier].push(action);
				} else {
					parser.root.blockActions[parser.identifier] = [action];
				}

				parser.context = newBlock;

				return states.content(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	if: function(parser, c) {
		var condition_ = "";

		var leadingWhitespace = function(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c === null) {
				throw parser.error("Expected condition, not end of file");
			}

			return condition(parser, c);
		};

		var condition = function(parser, c) {
			if (c === null || c === "\n") {
				parser.context = {
					type: "if",
					condition: condition_,
					elif: [],
					else: null,
					parent: parser.context,
					children: [],
					indent: parser.indent,
					position: {
						line: parser.position.line,
						character: parser.position.character
					}
				};

				parser.context.parent.children.push(parser.context);

				return states.content(parser, c);
			}

			condition_ += c;
			return condition;
		};

		return leadingWhitespace(parser, c);
	},
	elif: function(parser, c) {
		var condition_ = "";

		var previous = parser.context.children && parser.context.children[parser.context.children.length - 1];

		if (!previous || previous.type !== "if" || previous.else) {
			throw parser.error("Unexpected elif");
		}

		var leadingWhitespace = function(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c === null) {
				throw parser.error("Expected condition, not end of file");
			}

			return condition(parser, c);
		};

		var condition = function(parser, c) {
			if (c === null || c === "\n") {
				var elif = {
					type: "elif",
					condition: condition_,
					parent: parser.context,
					children: [],
					indent: parser.indent,
					position: {
						line: parser.position.line,
						character: parser.position.character
					}
				};

				previous.elif.push(elif);
				parser.context = elif;

				return states.content(parser, c);
			}

			condition_ += c;
			return condition;
		};

		return leadingWhitespace(parser, c);
	},
	else: function(parser, c) {
		var previous = parser.context.children && parser.context.children[parser.context.children.length - 1];

		if (!previous || previous.type !== "if" || previous.else) {
			throw parser.error("Unexpected else");
		}

		previous.else = {
			type: "else",
			parent: parser.context,
			children: [],
			indent: parser.indent,
			position: {
				line: parser.position.line,
				character: parser.position.character
			}
		};

		parser.context = previous.else;

		return states.content(parser, c);
	},
	for: function(parser, c) {
		var collection_ = "";

		var leadingWhitespace = function(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && JS_IDENTIFIER.test(c)) {
				if (DIGIT.test(c)) {
					throw parser.error("Expected name of loop variable, not " + describe(c));
				}

				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of loop variable, not " + describe(c));
		};

		var identifier = function(parser, c) {
			if (c === null || (!JS_IDENTIFIER.test(c) && c !== " ")) {
				throw parser.error("Expected in");
			}

			if (c === " ") {
				return whitespace1;
			}

			parser.identifier += c;
			return identifier;
		};

		var whitespace1 = function(parser, c) {
			if (c === " ") {
				return whitespace1;
			}

			if (c === "o") {
				return of1;
			}

			throw parser.error("Expected of");
		};

		var of1 = function(parser, c) {
			if (c === "f") {
				return of2;
			}

			throw parser.error("Expected of");
		};

		var of2 = function(parser, c) {
			if (c === null) {
				throw parser.error("Expected loop collection expression");
			}

			if (IDENTIFIER.test(c)) {
				throw parser.error("Expected of");
			}

			if (c === " ") {
				return whitespace2;
			}

			return collection(parser, c);
		};

		var whitespace2 = function(parser, c) {
			if (c === null) {
				throw parser.error("Expected loop collection expression");
			}

			if (c === " ") {
				return whitespace2;
			}

			return collection(parser, c);
		};

		var collection = function(parser, c) {
			if (c === null || c === "\n") {
				parser.context = {
					type: "for",
					variable: parser.identifier,
					collection: collection_,
					parent: parser.context,
					children: [],
					indent: parser.indent,
					position: {
						line: parser.position.line,
						character: parser.position.character
					}
				};

				parser.context.parent.children.push(parser.context);

				return states.content(parser, c);
			}

			collection_ += c;
			return collection;
		};

		return leadingWhitespace(parser, c);
	}
};

function parse(template, options) {
	var i;

	var eof = false;

	var root = {
		type: "root",
		children: [],
		indent: -1,
		extends: null,
		blockActions: null,
		blocks: {}
	};

	var parser = Object.seal({
		context: root,
		root: root,
		indentString: "",
		indent: null,
		indentType: null,
		identifier: null,
		raw: null,
		string: null,
		escapeFunction: null,
		interpolation: null,
		charCode: null,
		code: null,
		position: {
			line: 1,
			character: 0
		},
		error: function(message) {
			var where = eof ? "EOF" : "line " + parser.position.line + ", character " + parser.position.character;
			return new SyntaxError(message + " at " + where + " in " + options.name + ".");
		},
		warn: function(message) {
			if (options.debug) {
				var where = eof ? "EOF" : "line " + parser.position.line + ", character " + parser.position.character;
				console.warn("⚠ %s at %s in %s.", message, where, options.name);
			}
		}
	});

	var state = states.indent;

	for (i = 0; i < template.length; i++) {
		var c = template.charAt(i);

		if (c === "\n") {
			parser.position.line++;
			parser.position.character = 0;
		}

		state = state(parser, c);
		parser.position.character++;
	}

	eof = true;
	state(parser, null);

	if (root.extends) {
		var parentTemplate = options.load(root.extends);
		var blockName;

		for (blockName in root.blocks) {
			if (root.blocks.hasOwnProperty(blockName)) {
				if (parentTemplate.blocks.hasOwnProperty(blockName)) {
					throw new SyntaxError("Parent template " + root.extends + " already contains a block named “" + blockName + "”.");
				}

				parentTemplate.blocks[blockName] = root.blocks[blockName];
			}
		}

		for (blockName in root.blockActions) {
			if (root.blockActions.hasOwnProperty(blockName)) {
				if (!parentTemplate.blocks.hasOwnProperty(blockName)) {
					throw new SyntaxError("There is no block named “" + blockName + "”.");
				}

				var block = parentTemplate.blocks[blockName];
				var actions = root.blockActions[blockName];

				for (i = 0; i < actions.length; i++) {
					var action = actions[i];

					action(block);
				}
			}
		}

		return parentTemplate;
	}

	return root;
}

module.exports.constructor = { name: "razorleaf.parser" };
module.exports.parse = parse;
module.exports.states = states;
module.exports.keywords = keywords;
