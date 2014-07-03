"use strict";

var utilities = require("./utilities");
var CodeBlock = utilities.CodeBlock;
var push = Array.prototype.push;

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

var keywords;

function isExpression(js) {
	// jshint evil: true, nonew: false

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

	var code = c.charCodeAt(0);

	if (code >= 0xd800 && code <= 0xdbff) {
		var trailSurrogate = c.charCodeAt(1);

		if (trailSurrogate) {
			code = ((code - 0xd800) << 10 | (trailSurrogate - 0xdc00)) + 0x10000;
		}
	}

	return require("./unicode")[code] || JSON.stringify(c);
}

function indentState(parser, c) {
	if (c === null && parser.indentString) {
		parser.warn("Trailing whitespace");
		return;
	}

	if (c === "\n") {
		if (parser.indentString) {
			parser.warn("Whitespace-only line");
		}

		parser.indentString = "";
		return indentState;
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
				if (parser.indentString.length !== 1) {
					throw parser.error("Excessive indent of " + parser.indentString.length + " tabs; one tab always represents one indent level");
				}

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

		return contentState(parser, c);
	}

	parser.indentString += c;
	return indentState;
}

function contentState(parser, c) {
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
		return indentState;
	}

	if (c === " ") {
		return contentState;
	}

	if (c === ".") {
		parser.identifier = "";
		return classNameState;
	}

	if (c === "!") {
		parser.string = new CodeBlock();
		parser.escapeFunction = null;
		return rawStringState;
	}

	if (c === '"') {
		parser.string = new CodeBlock();
		parser.escapeFunction = parser.context.type === "attribute" ? "escapeAttributeValue" : "escapeContent";
		return stringState;
	}

	if (c === "#") {
		return commentState;
	}

	if (c === "%") {
		parser.code = "";
		return codeState;
	}

	if (IDENTIFIER.test(c)) {
		parser.identifier = "";
		return identifierState(parser, c);
	}

	throw parser.error("Unexpected " + describe(c));
}

function commentState(parser, c) {
	if (c === null || c === "\n") {
		return contentState(parser, c);
	}

	return commentState;
}

function codeState(parser, c) {
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

		return contentState(parser, c);
	}

	parser.code += c;
	return codeState;
}

function identifierState(parser, c) {
	if (c === ":") {
		return possibleAttributeState;
	}

	if (c !== null && IDENTIFIER.test(c)) {
		parser.identifier += c;
		return identifierState;
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
		unexpected: parser.error("Unexpected element"),
		position: {
			line: parser.position.line,
			character: parser.position.character
		}
	};

	parser.context.parent.children.push(parser.context);

	return contentState(parser, c);
}

function classNameState(parser, c) {
	if (c !== null && IDENTIFIER.test(c)) {
		parser.identifier += c;
		return classNameState;
	}

	if (!parser.identifier) {
		throw parser.error("Expected class name");
	}

	parser.context.children.push({
		type: "class",
		value: parser.identifier,
		parent: parser.context,
		unexpected: parser.error("Unexpected class"),
		position: {
			line: parser.position.line,
			character: parser.position.character
		}
	});

	return contentState(parser, c);
}

function possibleAttributeState(parser, c) {
	if (c !== null && IDENTIFIER.test(c)) {
		parser.identifier += ":" + c;
		return identifierState;
	}

	if (c === ":") {
		parser.identifier += ":";
		return possibleAttributeState;
	}

	parser.context = {
		type: "attribute",
		name: parser.identifier,
		value: null,
		parent: parser.context,
		unexpected: parser.error("Unexpected attribute"),
		position: {
			line: parser.position.line,
			character: parser.position.character
		}
	};

	parser.context.parent.children.push(parser.context);

	return contentState(parser, c);
}

function rawStringState(parser, c) {
	if (c !== '"') {
		throw parser.error("Expected beginning quote of raw string, not " + describe(c));
	}

	return stringState;
}

function stringState(parser, c) {
	if (c === null) {
		throw parser.error("Expected end of string before end of file");
	}

	if (c === '"') {
		var string = {
			type: "string",
			value: parser.string,
			parent: parser.context,
			unexpected: parser.error("Unexpected string"),
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

		return contentState;
	}

	if (c === "#") {
		return stringPoundState;
	}

	if (c === "\\") {
		return escapeState;
	}

	if (parser.escapeFunction) {
		parser.string.addText(utilities[parser.escapeFunction](c));
	} else {
		parser.string.addText(c);
	}

	return stringState;
}

function stringPoundState(parser, c) {
	if (c === "{") {
		parser.interpolation = "";
		return interpolationState;
	}

	parser.string.addText("#");
	return stringState(parser, c);
}

function interpolationState(parser, c) {
	if (c === null) {
		throw parser.error("Interpolated section never resolves to a valid JavaScript expression"); // TODO: Where did it start?
	}

	if (c === "}" && isExpression(parser.interpolation)) {
		var interpolation = POSSIBLE_COMMENT.test(parser.interpolation) ? parser.interpolation + "\n" : parser.interpolation;
		parser.string.addExpression(parser.escapeFunction, interpolation);
		return stringState;
	}

	parser.interpolation += c;
	return interpolationState;
}

function escapeState(parser, c) {
	if (c === null) {
		throw parser.error("Expected escape character");
	}

	if (c === "#" || c === '"') {
		parser.string.addText(c);
		return stringState;
	}

	if (c === "x") {
		return escapeX1;
	}

	if (c === "u") {
		return escapeU1;
	}

	if (singleCharEscapes.hasOwnProperty(c)) {
		parser.string.addText(singleCharEscapes[c]);
		return stringState;
	}

	// TODO: Allow LineTerminator to be escaped?

	return stringState(parser, c);
}

function escapeX1(parser, c) {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode = parseInt(c, 16) << 4;
	return escapeX2;
}

function escapeX2(parser, c) {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	var escapedCharacter = String.fromCharCode(parser.charCode | parseInt(c, 16));

	if (parser.escapeFunction) {
		parser.string.addText(utilities[parser.escapeFunction](escapedCharacter));
	} else {
		parser.string.addText(escapedCharacter);
	}

	return stringState;
}

function escapeU1(parser, c) {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode = parseInt(c, 16) << 12;
	return escapeU2;
}

function escapeU2(parser, c) {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode |= parseInt(c, 16) << 8;
	return escapeU3;
}

function escapeU3(parser, c) {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode |= parseInt(c, 16) << 4;
	return escapeU4;
}

function escapeU4(parser, c) {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	var escapedCharacter = String.fromCharCode(parser.charCode | parseInt(c, 16));

	if (parser.escapeFunction) {
		parser.string.addText(utilities[parser.escapeFunction](escapedCharacter));
	} else {
		parser.string.addText(escapedCharacter);
	}

	return stringState;
}

keywords = {
	doctype: function (parser, c) {
		parser.context.children.push({
			type: "string",
			value: new CodeBlock().addText("<!DOCTYPE html>"),
			parent: parser.context,
			position: {
				line: parser.position.line,
				character: parser.position.character
			}
		});

		return contentState(parser, c);
	},
	include: function (parser, c) {
		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of included template, not " + describe(c));
		}

		function identifier(parser, c) {
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

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		}

		return leadingWhitespace(parser, c);
	},
	extends: function (parser, c) {
		if (parser.root.children.length || parser.root.extends) {
			throw parser.error("extends must appear first in a template");
		}

		parser.root.children = {
			push: function () {
				throw parser.error("A template that extends another can only contain block actions directly");
			}
		};

		parser.root.blockActions = {};

		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of parent template, not " + describe(c));
		}

		function identifier(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.root.extends = parser.identifier;

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		}

		return leadingWhitespace(parser, c);
	},
	block: function (parser, c) {
		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block, not " + describe(c));
		}

		function identifier(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				if (hasOwnProperty.call(parser.root.blocks, parser.identifier)) {
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

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		}

		return leadingWhitespace(parser, c);
	},
	replace: function (parser, c) {
		if (!parser.root.extends) {
			throw parser.error("Unexpected block replacement in a root template");
		}

		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block to replace, not " + describe(c));
		}

		function identifier(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				var newBlock = {
					type: "block",
					name: parser.identifier,
					parent: parser.context,
					children: [],
					indent: parser.indent
				};

				var action = function (block) {
					block.children = newBlock.children;
				};

				if (hasOwnProperty.call(parser.root.blockActions, parser.identifier)) {
					parser.root.blockActions[parser.identifier].push(action);
				} else {
					parser.root.blockActions[parser.identifier] = [action];
				}

				parser.context = newBlock;

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		}

		return leadingWhitespace(parser, c);
	},
	append: function (parser, c) {
		if (!parser.root.extends) {
			throw parser.error("Unexpected block appension in a root template");
		}

		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block to append to, not " + describe(c));
		}

		function identifier(parser, c) {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				var newBlock = {
					type: "block",
					name: parser.identifier,
					parent: parser.context,
					children: [],
					indent: parser.indent
				};

				var action = function (block) {
					push.apply(block.children, newBlock.children);
				};

				if (hasOwnProperty.call(parser.root.blockActions, parser.identifier)) {
					parser.root.blockActions[parser.identifier].push(action);
				} else {
					parser.root.blockActions[parser.identifier] = [action];
				}

				parser.context = newBlock;

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		}

		return leadingWhitespace(parser, c);
	},
	if: function (parser, c) {
		var condition_ = "";

		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c === null) {
				throw parser.error("Expected condition, not end of file");
			}

			return condition(parser, c);
		}

		function condition(parser, c) {
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

				return contentState(parser, c);
			}

			condition_ += c;
			return condition;
		}

		return leadingWhitespace(parser, c);
	},
	elif: function (parser, c) {
		var condition_ = "";

		var previous = parser.context.children && parser.context.children[parser.context.children.length - 1];

		if (!previous || previous.type !== "if" || previous.else) {
			throw parser.error("Unexpected elif");
		}

		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c === null) {
				throw parser.error("Expected condition, not end of file");
			}

			return condition(parser, c);
		}

		function condition(parser, c) {
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

				return contentState(parser, c);
			}

			condition_ += c;
			return condition;
		}

		return leadingWhitespace(parser, c);
	},
	else: function (parser, c) {
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

		return contentState(parser, c);
	},
	for: function (parser, c) {
		var collection_ = "";

		function leadingWhitespace(parser, c) {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && JS_IDENTIFIER.test(c)) {
				if (DIGIT.test(c)) {
					throw parser.error("Expected name of loop variable, not " + describe(c));
				}

				parser.itemIdentifier = "";
				parser.indexIdentifier = null;
				return itemIdentifier(parser, c);
			}

			throw parser.error("Expected name of loop variable, not " + describe(c));
		}

		function itemIdentifier(parser, c) {
			if (c === " ") {
				return whitespaceAfterItemIdentifier;
			}

			if (c === ",") {
				parser.indexIdentifier = "";
				return whitespaceBeforeIndexIdentifier;
			}

			if (c === null || !JS_IDENTIFIER.test(c)) {
				throw parser.error("Expected of or comma");
			}

			parser.itemIdentifier += c;
			return itemIdentifier;
		}

		function whitespaceAfterItemIdentifier(parser, c) {
			if (c === " ") {
				return whitespaceAfterItemIdentifier;
			}

			if (c === "o") {
				return of1;
			}

			if (c === ",") {
				parser.indexIdentifier = "";
				return whitespaceBeforeIndexIdentifier;
			}

			throw parser.error("Expected of or comma");
		}

		function whitespaceBeforeIndexIdentifier(parser, c) {
			if (c === " ") {
				return whitespaceBeforeIndexIdentifier;
			}

			return indexIdentifier(parser, c);
		}

		function indexIdentifier(parser, c) {
			if (c === " ") {
				return whitespaceAfterIndexIdentifier;
			}

			if (c === null || !JS_IDENTIFIER.test(c)) {
				throw parser.error("Expected of");
			}

			parser.indexIdentifier += c;
			return indexIdentifier;
		}

		function whitespaceAfterIndexIdentifier(parser, c) {
			if (c === " ") {
				return whitespaceAfterIndexIdentifier;
			}

			if (c === "o") {
				return of1;
			}

			throw parser.error("Expected of");
		}

		function of1(parser, c) {
			if (c === "f") {
				return of2;
			}

			throw parser.error("Expected of");
		}

		function of2(parser, c) {
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
		}

		function whitespace2(parser, c) {
			if (c === null) {
				throw parser.error("Expected loop collection expression");
			}

			if (c === " ") {
				return whitespace2;
			}

			return collection(parser, c);
		}

		function collection(parser, c) {
			if (c === null || c === "\n") {
				parser.context = {
					type: "for",
					variable: parser.itemIdentifier,
					indexName: parser.indexIdentifier,
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

				return contentState(parser, c);
			}

			collection_ += c;
			return collection;
		}

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
		itemIdentifier: null,
		indexIdentifier: null,
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
		error: function (message, position) {
			position = position || parser.position;
			var where = eof ? "EOF" : "line " + position.line + ", character " + position.character;
			return new SyntaxError(message + " at " + where + " in " + options.name + ".");
		},
		warn: function (message) {
			if (options.debug) {
				var where = eof ? "EOF" : "line " + parser.position.line + ", character " + parser.position.character;
				console.warn("⚠ %s at %s in %s.", message, where, options.name);
			}
		}
	});

	var state = indentState;

	for (i = 0; i < template.length; i++) {
		var c = template.charAt(i);

		if (c === "\n" || c === "\r") {
			parser.position.line++;
			parser.position.character = 0;

			if (c === "\r" && template.charAt(i + 1) === "\n") {
				i++;
			}

			c = "\n";
		}

		var code = template.charCodeAt(i);

		if (code >= 0xd800 && code <= 0xdbff) {
			var nextCode = template.charCodeAt(i + 1);

			if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
				c += template.charAt(i + 1);
				i++;
			}
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
			if (hasOwnProperty.call(root.blocks, blockName)) {
				if (hasOwnProperty.call(parentTemplate.blocks, blockName)) {
					throw new SyntaxError("Parent template " + root.extends + " already contains a block named “" + blockName + "”.");
				}

				parentTemplate.blocks[blockName] = root.blocks[blockName];
			}
		}

		for (blockName in root.blockActions) {
			if (hasOwnProperty.call(root.blockActions, blockName)) {
				if (!hasOwnProperty.call(parentTemplate.blocks, blockName)) {
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

exports.constructor = { name: "razorleaf.parser" };
exports.parse = parse;
exports.keywords = keywords;
