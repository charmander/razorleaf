/* eslint-disable no-shadow */
"use strict";

const CodeBlock = require("./internal/code-block");
const extend = require("./internal/extend");
const escapes = require("./escapes");

const HEX = /[\da-fA-F]/;
const DIGIT = /\d/;
const IDENTIFIER = /[\w-]/;
const RECOGNIZABLE = /[!-~]/;
const POSSIBLE_COMMENT = /\/\/|<!--/;
const BLOCK_OR_TEMPLATE_NAME = /\S/;
const JS_IDENTIFIER = /\w/;
const JS_RESERVED_WORDS = new Set([
	"arguments",
	"class",
	"const",
	"enum",
	"eval",
	"export",
	"extends",
	"implements",
	"import",
	"interface",
	"let",
	"package",
	"private",
	"protected",
	"public",
	"static",
	"super",
	"yield",
]);

const singleCharEscapes = new Map([
	["\\", "\\"],
	["n", "\n"],
	["r", "\r"],
	["t", "\t"],
	["v", "\v"],
	["f", "\f"],
	["b", "\b"],
	["0", "\0"],
]);

const isExpression = js => {
	try {
		/* eslint-disable no-new */
		new Function("'use strict'; (" + js + "\n)");
		new Function("'use strict'; void " + js);

		/* eslint-enable no-new */
		return true;
	} catch (e) {
		return false;
	}
};

const isIdentifierCharacter = c =>
	c !== null && IDENTIFIER.test(c);

const isLeadingSurrogate = code =>
	code >= 0xd800 && code <= 0xdbff;

const describeCharacter = c => {
	if (RECOGNIZABLE.test(c)) {
		return c;
	}

	const code = c.codePointAt(0);
	return "U+" + code.toString(16).toUpperCase();
};

const describeString = s => {
	const json = JSON.stringify(s);

	return s.includes("'") ?
		json :
		"'" + json.slice(1, -1).replace(/\\"/g, '"') + "'";
};

const describeList = (list, maxLength) => {
	const itemDescriptions =
		list.slice(0, maxLength)
			.map(describeString)
			.join(", ");

	return list.length > maxLength ?
		"[" + itemDescriptions + ", …]" :
		"[" + itemDescriptions + "]";
};

const indentState = (parser, c) => {
	if (c === null) {
		return null;
	}

	if (c === "\n") {
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
				const i = parser.indentString.indexOf(" ");
				parser.indent = i === -1 ? parser.indentString.length : i;
			} else {
				const level = parser.indentString.length / parser.indentType.spaces;

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
					name: "one tab",
				};
			} else {
				parser.indentType = {
					indentCharacter: " ",
					name: parser.indentString.length + " space" + (parser.indentString.length === 1 ? "" : "s"),
					spaces: parser.indentString.length,
				};
			}

			parser.indentType.determined = parser.getPosition();
		}

		if (parser.indent > parser.context.indent + 1) {
			if (parser.context.type === "code") {
				const unitsPerLevel =
					parser.indentType.indentCharacter === "\t" ?
						1 :
						parser.indentType.spaces;

				parser.context.code += parser.indentString.substring(unitsPerLevel * (parser.context.indent + 1));
			} else {
				throw parser.error("Excessive indent " + parser.indent + "; expected " + (parser.context.indent + 1) + (parser.context.indent === -1 ? "" : " or smaller"));
			}
		}

		while (parser.context.indent >= parser.indent) {
			parser.context = parser.context.parent;
		}

		return contentState(parser, c);
	}

	parser.indentString += c;
	return indentState;
};

const contentState = (parser, c) => {
	if (c === null) {
		return null;
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

	if (parser.context.type === "code") {
		return codeBlockState(parser, c);
	}

	if (c === " ") {
		return contentState;
	}

	if (c === ".") {
		parser.identifier = "";
		parser.identifierStart = parser.getPosition();
		return classNameState;
	}

	if (c === "!") {
		parser.string = new CodeBlock();
		parser.escapeFunction = "unwrapMarkup";
		parser.literalEscapeFunction = null;
		parser.stringStart = parser.getPosition();
		return rawStringState;
	}

	if (c === '"') {
		parser.string = new CodeBlock();

		if (parser.context.type === "attribute") {
			parser.escapeFunction = "escapeDoubleQuotedAttributeValue";
			parser.literalEscapeFunction = escapes.escapeDoubleQuotedAttributeValue;
		} else {
			parser.escapeFunction = "escapeContent";
			parser.literalEscapeFunction = escapes.escapeContent;
		}

		parser.stringStart = parser.getPosition();
		return stringState;
	}

	if (c === "#") {
		return commentState;
	}

	if (isIdentifierCharacter(c)) {
		parser.identifier = "";
		parser.identifierStart = parser.getPosition();
		return identifierState(parser, c);
	}

	throw parser.error("Unexpected " + describeCharacter(c));
};

const commentState = (parser, c) => {
	if (c === null || c === "\n") {
		return contentState(parser, c);
	}

	return commentState;
};

const codeBlockState = (parser, c) => {
	if (c === null) {
		return contentState(parser, c);
	}

	parser.context.code += c;

	return c === "\n" ?
		contentState(parser, c) :
		codeBlockState;
};

const identifierState = (parser, c) => {
	if (c === ":") {
		return possibleAttributeState;
	}

	if (c === "(") {
		return macroCallState;
	}

	if (isIdentifierCharacter(c)) {
		parser.identifier += c;
		return identifierState;
	}

	// eslint-disable-next-line no-prototype-builtins
	if (keywords.hasOwnProperty(parser.identifier)) {
		return keywords[parser.identifier](parser, c);
	}

	parser.context = {
		type: "element",
		name: parser.identifier,
		parent: parser.context,
		children: [],
		indent: parser.indent,
		unexpected: parser.error("Unexpected element", parser.identifierStart, parser.identifier.length),
		position: parser.identifierStart,
	};

	parser.context.parent.children.push(parser.context);

	return contentState(parser, c);
};

const classNameState = (parser, c) => {
	if (isIdentifierCharacter(c)) {
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
		unexpected: parser.error("Unexpected class", parser.identifierStart, parser.identifier.length + 1),
		position: parser.getPosition(),
	});

	return contentState(parser, c);
};

const possibleAttributeState = (parser, c) => {
	if (isIdentifierCharacter(c)) {
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
		unexpected: parser.error("Unexpected attribute", parser.identifierStart, parser.identifier.length + 1),
		position: parser.getPosition(),
	};

	return afterAttributeNameState(parser, c);
};

const afterAttributeNameState = (parser, c) => {
	if (c === " ") {
		return afterAttributeNameState;
	}

	if (c === "\"") {
		parser.context.parent.children.push(parser.context);

		return contentState(parser, c);
	}

	if (c === "i") {
		parser.identifierStart = parser.getPosition();

		return attributeIf0State;
	}

	throw parser.error("Expected attribute value or “if”");
};

const attributeIf0State = (parser, c) => {
	if (c === "f") {
		return attributeIf1State;
	}

	throw parser.error("Expected attribute value or “if”", parser.identifierStart);
};

const attributeIf1State = (parser, c) => {
	if (c === " ") {
		parser.context = {
			type: "if",
			condition: "",
			elif: [],
			else: null,
			parent: parser.context.parent,
			children: [parser.context],
			indent: parser.indent,
			position: parser.getPosition(),
		};

		parser.context.parent.children.push(parser.context);

		return attributeConditionSpaceState;
	}

	throw parser.error("Expected attribute value or “if”", parser.identifierStart);
};

const attributeConditionSpaceState = (parser, c) => {
	if (c === " ") {
		return attributeConditionSpaceState;
	}

	return attributeConditionState(parser, c);
};

const attributeConditionState = (parser, c) => {
	if (c === null || c === "\n") {
		return contentState(parser, c);
	}

	parser.context.condition += c;
	return attributeConditionState;
};

const macroCallState = (parser, c) => {
	parser.context = {
		type: "call",
		name: parser.identifier,
		parent: parser.context,
		parameters: [],
		children: [],
		indent: parser.indent,
		position: parser.identifierStart,
		macroUndefined: parser.error("Macro “" + parser.identifier + "” is not defined", parser.identifierStart, parser.identifier.length),
	};

	parser.context.parent.children.push(parser.context);
	parser.macroCallParameter = "";
	parser.macroCallStart = parser.getPosition();
	parser.badMacroCallParameters = [];

	return macroCallBeforeParameterState(parser, c);
};

const macroCallBeforeParameterState = (parser, c) => {
	if (c === " " || c === "\n" || c === "\t") {
		return macroCallBeforeParameterState;
	}

	if (c === ")") {
		const endPosition = parser.getPosition();

		parser.context.missing = missing =>
			parser.error(
				(missing.length === 1 ? "Missing value for parameter " : "Missing values for parameters ") + missing.join(", "),
				endPosition
			);

		return contentState;
	}

	if (c === ",") {
		throw parser.error("Expected parameter value");
	}

	parser.macroCallParameterStart = parser.getPosition();

	if (c !== null && c !== ":" && !DIGIT.test(c)) {
		parser.macroCallParameterName = "";
		return macroCallPossibleNamedParameterState(parser, c);
	} else {
		parser.macroCallParameterName = null;
		return macroCallParameterState(parser, c);
	}
};

const macroCallPossibleNamedParameterState = (parser, c) => {
	if (c === ":") {
		return macroCallAfterParameterNameState;
	}

	if (c !== null && JS_IDENTIFIER.test(c)) {
		parser.macroCallParameterName += c;
		return macroCallPossibleNamedParameterState;
	}

	parser.macroCallParameter = parser.macroCallParameterName;
	parser.macroCallParameterName = null;
	return macroCallParameterState(parser, c);
};

const macroCallAfterParameterNameState = (parser, c) => {
	if (c === " ") {
		return macroCallAfterParameterNameState;
	}

	if (c === ")" || c === ",") {
		throw parser.error("Expected parameter value");
	}

	if (
		parser.macroCallParameterName !== null &&
		parser.context.parameters.some(parameter => parameter.name === parser.macroCallParameterName)
	) {
		throw parser.error("A value has already been specified for the parameter “" + parser.macroCallParameterName + "”", parser.macroCallParameterStart, parser.macroCallParameterName.length + 1);
	}

	return macroCallParameterState(parser, c);
};

const macroCallParameterState = (parser, c) => {
	if (c === null) {
		if (parser.badMacroCallParameters.length === 0) {
			throw parser.error("Unclosed macro call", parser.macroCallStart);
		}

		throw parser.error("No parameter is a valid JavaScript expression (of " + describeList(parser.badMacroCallParameters, 4) + ")", parser.interpolationStart);
	}

	if (c === ")" || c === ",") {
		if (isExpression(parser.macroCallParameter)) {
			if (
				parser.macroCallParameterName === null &&
				parser.context.parameters.some(parameter => parameter.name !== null)
			) {
				throw parser.error("A positional parameter can’t be placed after a named parameter", parser.macroCallParameterStart, parser.macroCallParameter.length);
			}

			parser.context.parameters.push({
				name: parser.macroCallParameterName,
				value: parser.macroCallParameter,
				position: parser.macroCallParameterStart,
				alreadyProvided: parser.error("A value for the parameter “" + parser.macroCallParameterName + "” was already provided"),
				nonexistent: parser.error("The macro “" + parser.context.name + "” does not accept a parameter named “" + parser.macroCallParameterName + "”"),
				unexpected: parser.error("Too many arguments passed to macro “" + parser.context.name + "”", parser.macroCallParameterStart, parser.macroCallParameter.length),
			});

			if (c === ")") {
				parser.macroCallParameter = null;
				parser.macroCallStart = null;
				parser.badMacroCallParameters = null;
				return macroCallBeforeParameterState(parser, c);
			} else {
				parser.macroCallParameter = "";
				parser.badMacroCallParameters = [];
				return macroCallBeforeParameterState;
			}
		}

		const lastTerminator = Math.max(
			parser.macroCallParameter.lastIndexOf(")"),
			parser.macroCallParameter.lastIndexOf(",")
		);

		const badParameter =
			lastTerminator === -1 ?
				parser.macroCallParameter :
				"…" + parser.macroCallParameter.substring(lastTerminator);

		parser.badMacroCallParameters.push(badParameter);
	}

	parser.macroCallParameter += c;
	return macroCallParameterState;
};

const rawStringState = (parser, c) => {
	if (c === "!") {
		parser.escapeFunction = null;
		return doubleRawStringState;
	}

	if (c !== '"') {
		throw parser.error("Expected beginning quote of raw string, not " + describeCharacter(c));
	}

	return stringState;
};

const doubleRawStringState = (parser, c) => {
	if (c !== '"') {
		throw parser.error("Expected beginning quote of raw string, not " + describeCharacter(c));
	}

	return stringState;
};

const stringState = (parser, c) => {
	if (c === null) {
		throw parser.error("Expected end of string before end of file");
	}

	if (c === '"') {
		const string = {
			type: "string",
			value: parser.string,
			parent: parser.context,
			unexpected: parser.error("Unexpected string", parser.stringStart, parser.getPosition().index - parser.stringStart.index + 1),
			position: parser.stringStart,
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

	parser.string.addText(parser.literalEscapeFunction, c);

	return stringState;
};

const stringPoundState = (parser, c) => {
	if (c === "{") {
		parser.interpolation = "";
		parser.interpolationStart = parser.getPosition();
		parser.badInterpolations = [];
		return interpolationState;
	}

	parser.string.addText(parser.literalEscapeFunction, "#");
	return stringState(parser, c);
};

const interpolationState = (parser, c) => {
	if (c === null) {
		if (parser.badInterpolations.length === 0) {
			throw parser.error("Unclosed interpolation", parser.interpolationStart);
		}

		throw parser.error("No interpolation is a valid JavaScript expression (of " + describeList(parser.badInterpolations, 4) + ")", parser.interpolationStart);
	}

	if (c === "}") {
		if (isExpression(parser.interpolation)) {
			const interpolation = POSSIBLE_COMMENT.test(parser.interpolation) ? parser.interpolation + "\n" : parser.interpolation;
			parser.string.addExpression(parser.escapeFunction, interpolation);
			return stringState;
		}

		const lastBrace = parser.interpolation.lastIndexOf("}");
		const badInterpolation =
			lastBrace === -1 ?
				parser.interpolation :
				"…" + parser.interpolation.substring(lastBrace);
		parser.badInterpolations.push(badInterpolation);
	}

	parser.interpolation += c;
	return interpolationState;
};

const escapeState = (parser, c) => {
	if (c === "#" || c === '"') {
		parser.string.addText(parser.literalEscapeFunction, c);
		return stringState;
	}

	if (c === "x") {
		return escapeX1;
	}

	if (c === "u") {
		return escapeU1;
	}

	const escapedValue = singleCharEscapes.get(c);

	if (escapedValue !== undefined) {
		parser.string.addText(parser.literalEscapeFunction, escapedValue);
		return stringState;
	}

	throw parser.error("Expected escape sequence");
};

const escapeX1 = (parser, c) => {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode = parseInt(c, 16) << 4;
	return escapeX2;
};

const escapeX2 = (parser, c) => {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	const escapedCharacter = String.fromCharCode(parser.charCode | parseInt(c, 16));

	parser.string.addText(parser.literalEscapeFunction, escapedCharacter);

	return stringState;
};

const escapeU1 = (parser, c) => {
	if (c === "{") {
		return extendedUnicodeEscapeState;
	}

	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode = parseInt(c, 16) << 12;
	return escapeU2;
};

const escapeU2 = (parser, c) => {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode |= parseInt(c, 16) << 8;
	return escapeU3;
};

const escapeU3 = (parser, c) => {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charCode |= parseInt(c, 16) << 4;
	return escapeU4;
};

const escapeU4 = (parser, c) => {
	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	const escapedCharacter = String.fromCharCode(parser.charCode | parseInt(c, 16));

	parser.string.addText(parser.literalEscapeFunction, escapedCharacter);

	return stringState;
};

const extendedUnicodeEscapeState = (parser, c) => {
	if (c === "}") {
		if (!parser.charHex) {
			throw parser.error("Expected hexadecimal digit");
		}

		const codePoint = parseInt(parser.charHex, 16);

		if (codePoint > 0x10ffff) {
			throw parser.error("Undefined Unicode code-point");
		}

		const escapedCharacter = String.fromCodePoint(codePoint);

		parser.string.addText(parser.literalEscapeFunction, escapedCharacter);

		return stringState;
	}

	if (c === null || !HEX.test(c)) {
		throw parser.error("Expected hexadecimal digit");
	}

	parser.charHex += c;
	return extendedUnicodeEscapeState;
};

const keywords = {
	doctype: (parser, c) => {
		parser.context.children.push({
			type: "string",
			value: new CodeBlock().addText(null, "<!DOCTYPE html>"),
			parent: parser.context,
			position: parser.getPosition(),
		});

		return contentState(parser, c);
	},
	include: (parser, c) => {
		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of included template, not " + describeCharacter(c));
		};

		const identifier = (parser, c) => {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.context.children.push({
					type: "include",
					template: parser.identifier,
					parent: parser.context,
					position: parser.getPosition(),
				});

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	extends: (parser, c) => {
		if (parser.root.children.length || parser.root.extends) {
			throw parser.error("extends must appear first in a template", parser.identifierStart, parser.identifier.length);
		}

		parser.root.children = {
			push: child => {
				if (child.type === "element") {
					throw parser.error("A child template can only contain block actions or macros at the root level", child.position, child.name.length);
				} else {
					throw parser.error("A child template can only contain block actions or macros at the root level", child.position);
				}
			},
		};

		parser.root.blockActions = Object.create(null);

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of parent template, not " + describeCharacter(c));
		};

		const identifier = (parser, c) => {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.root.extends = parser.identifier;

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	block: (parser, c) => {
		const blockStart = parser.identifierStart;

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				parser.identifierStart = parser.getPosition();
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block, not " + describeCharacter(c));
		};

		const identifier = (parser, c) => {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				if (parser.identifier in parser.root.blocks) {
					const existingBlock = parser.root.blocks[parser.identifier];

					throw parser.error(
						"A block named “" + parser.identifier + "” has already been defined on line " + existingBlock.position.line,
						parser.identifierStart,
						parser.identifier.length
					);
				}

				parser.context = {
					type: "block",
					name: parser.identifier,
					parent: parser.context,
					children: [],
					indent: parser.indent,
					position: blockStart,
				};

				parser.context.parent.children.push(parser.context);
				parser.root.blocks[parser.identifier] = parser.context;

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	replace: (parser, c) => {
		if (!parser.root.extends) {
			throw parser.error("Unexpected block replacement in a root template", parser.identifierStart, parser.identifier.length);
		}

		if (parser.context !== parser.root) {
			throw parser.error("Unexpected block replacement outside of root", parser.identifierStart, parser.identifier.length);
		}

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block to replace, not " + describeCharacter(c));
		};

		const identifier = (parser, c) => {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				const newBlock = {
					type: "block",
					name: parser.identifier,
					parent: parser.context,
					children: [],
					indent: parser.indent,
				};

				const action = block => {
					block.children = newBlock.children;
				};

				if (parser.identifier in parser.root.blockActions) {
					parser.root.blockActions[parser.identifier].push(action);
				} else {
					parser.root.blockActions[parser.identifier] = [action];
				}

				parser.context = newBlock;

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	append: (parser, c) => {
		if (!parser.root.extends) {
			throw parser.error("Unexpected block appension in a root template", parser.identifierStart, parser.identifier.length);
		}

		if (parser.context !== parser.root) {
			throw parser.error("Unexpected block appension outside of root", parser.identifierStart, parser.identifier.length);
		}

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && BLOCK_OR_TEMPLATE_NAME.test(c)) {
				parser.identifier = "";
				return identifier(parser, c);
			}

			throw parser.error("Expected name of block to append to, not " + describeCharacter(c));
		};

		const identifier = (parser, c) => {
			if (c === null || !BLOCK_OR_TEMPLATE_NAME.test(c)) {
				const newBlock = {
					type: "block",
					name: parser.identifier,
					parent: parser.context,
					children: [],
					indent: parser.indent,
				};

				const action = block => {
					extend(block.children, newBlock.children);
				};

				if (parser.identifier in parser.root.blockActions) {
					parser.root.blockActions[parser.identifier].push(action);
				} else {
					parser.root.blockActions[parser.identifier] = [action];
				}

				parser.context = newBlock;

				return contentState(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		return leadingWhitespace(parser, c);
	},
	if: (parser, c) => {
		let condition_ = "";

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c === null) {
				throw parser.error("Expected condition, not end of file");
			}

			return condition(parser, c);
		};

		const condition = (parser, c) => {
			if (c === null || c === "\n") {
				parser.context = {
					type: "if",
					condition: condition_,
					elif: [],
					else: null,
					parent: parser.context,
					children: [],
					indent: parser.indent,
					position: parser.getPosition(),
				};

				parser.context.parent.children.push(parser.context);

				return contentState(parser, c);
			}

			condition_ += c;
			return condition;
		};

		return leadingWhitespace(parser, c);
	},
	elif: (parser, c) => {
		let condition_ = "";

		const previous = parser.context.children && parser.context.children[parser.context.children.length - 1];

		if (!previous || previous.type !== "if" || previous.else) {
			throw parser.error("Unexpected elif", parser.identifierStart, parser.identifier.length);
		}

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c === null) {
				throw parser.error("Expected condition, not end of file");
			}

			return condition(parser, c);
		};

		const condition = (parser, c) => {
			if (c === null || c === "\n") {
				const elif = {
					type: "elif",
					condition: condition_,
					parent: parser.context,
					children: [],
					indent: parser.indent,
					position: parser.getPosition(),
				};

				previous.elif.push(elif);
				parser.context = elif;

				return contentState(parser, c);
			}

			condition_ += c;
			return condition;
		};

		return leadingWhitespace(parser, c);
	},
	else: (parser, c) => {
		const previous = parser.context.children && parser.context.children[parser.context.children.length - 1];

		if (!previous || previous.type !== "if" || previous.else) {
			throw parser.error("Unexpected else", parser.identifierStart, parser.identifier.length);
		}

		previous.else = {
			type: "else",
			parent: parser.context,
			children: [],
			indent: parser.indent,
			position: parser.getPosition(),
		};

		parser.context = previous.else;

		return contentState(parser, c);
	},
	for: (parser, c) => {
		let collection_ = "";

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (c !== null && JS_IDENTIFIER.test(c)) {
				if (DIGIT.test(c)) {
					throw parser.error("Expected name of loop variable, not " + describeCharacter(c));
				}

				parser.itemIdentifier = "";
				parser.indexIdentifier = null;
				return itemIdentifier(parser, c);
			}

			throw parser.error("Expected name of loop variable, not " + describeCharacter(c));
		};

		const itemIdentifier = (parser, c) => {
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
		};

		const whitespaceAfterItemIdentifier = (parser, c) => {
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
		};

		const whitespaceBeforeIndexIdentifier = (parser, c) => {
			if (c === " ") {
				return whitespaceBeforeIndexIdentifier;
			}

			return indexIdentifier(parser, c);
		};

		const indexIdentifier = (parser, c) => {
			if (c === " ") {
				return whitespaceAfterIndexIdentifier;
			}

			if (c === null || !JS_IDENTIFIER.test(c)) {
				throw parser.error("Expected of");
			}

			parser.indexIdentifier += c;
			return indexIdentifier;
		};

		const whitespaceAfterIndexIdentifier = (parser, c) => {
			if (c === " ") {
				return whitespaceAfterIndexIdentifier;
			}

			if (c === "o") {
				return of1;
			}

			throw parser.error("Expected of");
		};

		const of1 = (parser, c) => {
			if (c === "f") {
				return of2;
			}

			throw parser.error("Expected of");
		};

		const of2 = (parser, c) => {
			if (c === null) {
				throw parser.error("Expected loop collection expression");
			}

			if (isIdentifierCharacter(c)) {
				throw parser.error("Expected of");
			}

			if (c === " ") {
				return whitespace2;
			}

			return collection(parser, c);
		};

		const whitespace2 = (parser, c) => {
			if (c === null) {
				throw parser.error("Expected loop collection expression");
			}

			if (c === " ") {
				return whitespace2;
			}

			return collection(parser, c);
		};

		const collection = (parser, c) => {
			if (c === null || c === "\n") {
				parser.context = {
					type: "for",
					variable: parser.itemIdentifier,
					indexName: parser.indexIdentifier,
					collection: collection_,
					parent: parser.context,
					children: [],
					indent: parser.indent,
					position: parser.getPosition(),
				};

				parser.context.parent.children.push(parser.context);

				return contentState(parser, c);
			}

			collection_ += c;
			return collection;
		};

		return leadingWhitespace(parser, c);
	},
	macro: (parser, c) => {
		const macroStart = parser.identifierStart;

		const leadingWhitespace = (parser, c) => {
			if (c === " ") {
				return leadingWhitespace;
			}

			if (isIdentifierCharacter(c)) {
				parser.identifier = "";
				parser.identifierStart = parser.getPosition();
				return identifier(parser, c);
			}

			throw parser.error("Expected name of macro, not " + describeCharacter(c));
		};

		const identifier = (parser, c) => {
			if (!isIdentifierCharacter(c)) {
				const existingMacro = parser.root.macros.get(parser.identifier);

				if (existingMacro !== undefined) {
					throw parser.error(
						`A macro named “${parser.identifier}” has already been defined on line ${existingMacro.position.line}`,
						parser.identifierStart,
						parser.identifier.length
					);
				}

				parser.context = {
					type: "macro",
					name: parser.identifier,
					parent: parser.context,
					parameters: [],
					children: [],
					indent: parser.indent,
					position: macroStart,
				};

				parser.root.macros.set(parser.identifier, parser.context);

				return contentOrParameterList(parser, c);
			}

			parser.identifier += c;
			return identifier;
		};

		const contentOrParameterList = (parser, c) => {
			if (c === " ") {
				return contentOrParameterList;
			}

			if (c === "(") {
				parser.macroParameterListStart = parser.getPosition();
				return beforeParameterName;
			}

			return contentState(parser, c);
		};

		const beforeParameterName = (parser, c) => {
			if (c === " ") {
				return beforeParameterName;
			}

			if (c === ",") {
				throw parser.error("Expected parameter name");
			}

			if (c === ")") {
				return contentState;
			}

			if (DIGIT.test(c)) {
				throw parser.error("Expected parameter name, not digit");
			}

			parser.identifier = "";
			parser.identifierStart = parser.getPosition();
			return parameterName(parser, c);
		};

		const parameterName = (parser, c) => {
			if (c === null) {
				throw parser.error("Unclosed macro parameter list", parser.macroParameterListStart);
			}

			if (c === ")" || c === "," || c === " ") {
				if (parser.context.parameters.includes(parser.identifier)) {
					throw parser.error(`Parameter “${parser.identifier}” already specified`, parser.identifierStart, parser.identifier.length);
				}

				if (JS_RESERVED_WORDS.has(parser.identifier)) {
					throw parser.error(`Parameter name “${parser.identifier}” is reserved word`, parser.identifierStart, parser.identifier.length);
				}

				parser.context.parameters.push(parser.identifier);
				return afterParameterName(parser, c);
			}

			if (!JS_IDENTIFIER.test(c)) {
				throw parser.error("Unexpected " + describeCharacter(c));
			}

			parser.identifier += c;
			return parameterName;
		};

		const afterParameterName = (parser, c) => {
			if (c === " ") {
				return afterParameterName;
			}

			if (c === ",") {
				return beforeParameterName;
			}

			if (c === ")") {
				return contentState;
			}

			if (c === null) {
				throw parser.error("Unclosed macro parameter list", parser.macroParameterListStart);
			}

			throw parser.error("Unexpected " + describeCharacter(c));
		};

		return leadingWhitespace(parser, c);
	},
	yield: (parser, c) => {
		parser.context.children.push({
			type: "yield",
			parent: parser.context,
			unexpected: parser.error("Unexpected yield outside of macro", parser.identifierStart, parser.identifier.length),
			position: parser.identifierStart,
		});

		return contentState(parser, c);
	},
	do: (parser, c) => {
		parser.context = {
			type: "code",
			code: "",
			parent: parser.context,
			indent: parser.indent,
			position: parser.identifierStart,
		};

		parser.context.parent.children.push(parser.context);

		return contentState(parser, c);
	},
};

const parse = (template, options) => {
	const root = {
		type: "root",
		children: [],
		indent: -1,
		extends: null,
		blockActions: null,
		blocks: Object.create(null),
		macros: new Map(),
	};

	const position = {
		line: 1,
		character: 1,
		index: 0,
	};

	class TemplateError extends SyntaxError {
		constructor(message, source) {
			super(message);

			Object.defineProperty(this, "message", {
				configurable: true,
				writable: true,
				value: message,
			});

			Object.defineProperty(this, "position", {
				configurable: true,
				writable: true,
				value: source.position,
			});

			Object.defineProperty(this, "context", {
				configurable: true,
				writable: true,
				value: source.context,
			});

			Error.captureStackTrace(this, this.constructor);

			const stackInsert = "    at template (" + source.name + ":" + source.position.line + ":" + source.position.character + ")";

			Object.defineProperty(this, "stack", {
				configurable: true,
				writable: true,
				value: this.context + "\n" + this.stack.replace("\n", "\n" + stackInsert + "\n"),
			});
		}
	}

	Object.defineProperty(TemplateError.prototype, "name", {
		configurable: true,
		writable: true,
		value: TemplateError.name,
	});

	const parser = Object.seal({
		context: root,
		root: root,
		indentString: "",
		indent: null,
		indentType: null,
		identifier: null,
		identifierStart: null,
		itemIdentifier: null,
		indexIdentifier: null,
		raw: null,
		string: null,
		stringStart: null,
		escapeFunction: null,
		literalEscapeFunction: null,
		interpolation: null,
		interpolationStart: null,
		badInterpolations: null,
		charCode: null,
		charHex: "",
		code: null,
		macroCallStart: null,
		macroCallParameter: null,
		macroCallParameterName: null,
		macroCallParameterStart: null,
		badMacroCallParameters: null,
		macroParameterListStart: null,
		getPosition: () => {
			const { line, character, index } = position;
			return { line, character, index };
		},
		error: (message, displayPosition = position, extent) => {
			const defaultExtent = isLeadingSurrogate(template.charCodeAt(displayPosition)) ? 2 : 1;

			return new TemplateError(message, {
				position: displayPosition,
				name: options.name,
				context: getContext(template, displayPosition, extent || defaultExtent),
			});
		},
	});

	const getContext = (template, position, extent) => {
		const numberWidth = (Math.log10(position.line) | 0) + 2;

		const formatLine = (number, line, highlight) => {
			let highlightStart = highlight && highlight.start;
			let highlightExtent = highlight && highlight.extent;

			if (highlight && highlightExtent < 0) {
				highlightStart += highlightExtent;
				highlightExtent *= -1;
			}

			const formattedNumber = String(number).padStart(numberWidth);
			const formattedLine =
				line
					.replace(/^\t+/, match => {
						if (highlight) {
							if (highlightStart < match.length) {
								highlightStart *= 4;
								highlightExtent += 3;
							} else {
								highlightStart += 3 * match.length;
							}
						}

						return " ".repeat(4 * match.length);
					})
					.replace(/\t/g, "⇥");

			if (highlight) {
				for (let i = 0; i < highlightStart; i++) {
					if (isLeadingSurrogate(formattedLine.charCodeAt(i))) {
						highlightStart++;
						i++;
					}
				}
			}

			return formattedNumber + " │ " + (
				highlight ?
					formattedLine.substr(0, highlightStart) + "\x1b[41;37m" + formattedLine.substr(highlightStart, highlightExtent) + "\x1b[0m" + formattedLine.substr(highlightStart + highlightExtent) :
					formattedLine
			);
		};

		const lines = template.split(/\r\n|[\r\n]/);

		if (lines[lines.length - 1] === "") {
			lines.pop();
		}

		let positionLine = position.line;
		let positionCharacter = position.character;

		if (position.character === 0) {
			positionLine--;
			positionCharacter = lines[positionLine - 1].length + 1;
		}

		let output = "";
		const lowerBound = Math.max(0, positionLine - 3);
		const upperBound = Math.min(lines.length, positionLine + 2);

		for (let i = lowerBound; i < positionLine - 1; i++) {
			output += "\x1b[38;5;245m" + formatLine(i + 1, lines[i]) + "\x1b[0m\n";
		}

		const highlight = {
			start: positionCharacter - 1,
			extent: extent,
		};

		output += formatLine(positionLine, lines[positionLine - 1], highlight) + "\n";

		for (let i = positionLine; i < upperBound; i++) {
			output += "\x1b[38;5;245m" + formatLine(i + 1, lines[i]) + "\x1b[0m\n";
		}

		return output;
	};

	let state = indentState;
	let cr = false;

	for (let c of template) {
		if (cr) {
			cr = false;

			if (c !== "\n") {
				throw parser.error("Expected LF after CR");
			}

			position.index++;
			continue;
		}

		if (c === "\n" || (cr = c === "\r")) {
			position.line++;
			position.character = 0;
			c = "\n";
		}

		state = state(parser, c);
		position.character++;
		position.index += c.length;
	}

	state(parser, null);

	if (root.extends) {
		const parentTemplate = options.load(root.extends);

		for (const blockName in root.blocks) {
			if (blockName in parentTemplate.blocks) {
				throw new SyntaxError(`Parent template ${root.extends} already contains a block named “${blockName}”.`);
			}

			parentTemplate.blocks[blockName] = root.blocks[blockName];
		}

		for (const blockName in root.blockActions) {
			if (!(blockName in parentTemplate.blocks)) {
				throw new SyntaxError(`There is no block named “${blockName}”.`);
			}

			const block = parentTemplate.blocks[blockName];
			const actions = root.blockActions[blockName];

			for (const action of actions) {
				action(block);
			}
		}

		for (const [macroName, macro] of root.macros) {
			if (parentTemplate.macros.has(macroName)) {
				throw new SyntaxError(`Parent template ${root.extends} already contains a macro named “${macroName}”.`);
			}

			parentTemplate.macros.set(macroName, macro);
		}

		return parentTemplate;
	}

	return root;
};

module.exports = {
	parse,
	keywords,
};
