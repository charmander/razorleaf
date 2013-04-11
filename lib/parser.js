"use strict";

var format = require("index-format");
var push = Array.prototype.push;

var identifierCharacter = /[\w\-]/;
var jsIdentifierCharacter = /\w/; // For simplicity, no escape codes, please.

function isIdentifierCharacter(c) {
	return c && identifierCharacter.test(c);
}

function parse(template, options) {
	var context = {type: "element", children: [], parent: null, indent: -1};
	var accumulator;
	var indent = 0;

	var line = 1;
	var lineOffset = 0;
	var i;
	var c;

	var error = function(description) {
		throw new SyntaxError(
			format(
				"{0} at line {1}, character {2}.",
				[description, line, i - lineOffset + 1]
			)
		);
	};

	var readLine = function() {
		var line = "";

		while(true) {
			var c = template.charAt(i + 1);

			if(!c || c === "\n") {
				break;
			}

			line += c;
			i++;
		}

		return line;
	};

	var readWhitespace = function() {
		if(template.charAt(i + 1) !== " " && template.charAt(i + 1) !== "\t") {
			return false;
		}

		i++;

		while(true) {
			var c = template.charAt(i + 1);

			if(c !== " " && c !== "\t") {
				return true;
			}

			i++;
		}
	};

	var controlBlocks = {
		if: function() {
			readWhitespace();

			return {
				type: "element",
				name: "if",
				condition: readLine(),
				children: [],
				indent: indent,
				parent: context
			};
		},
		for: function() {
			readWhitespace();

			var variableName = "";

			while(true) {
				var c = template.charAt(i + 1);

				if(!c || !jsIdentifierCharacter.test(c)) {
					break;
				}

				variableName += c;
				i++;
			}

			if(!variableName) {
				error("Expected loop variable name");
			}

			if(!readWhitespace() || template.substr(i + 1, 2) !== "in") {
				error("Expected in");
			}

			i += 2;

			if(!readWhitespace()) {
				error("Expected in");
			}

			return {
				type: "element",
				name: "for",
				variableName: variableName,
				collection: readLine(),
				children: [],
				indent: indent,
				parent: context
			};
		}
	};

	for(i = 0; i < template.length; i++) {
		c = template.charAt(i);

		if(c === "\n") {
			indent = 0;
			line++;
			lineOffset = i + 1;

			while(true) {
				c = template.charAt(i + 1);

				if(c === "\n") {
					i++;
					line++;
					lineOffset = i;
					continue;
				}

				if(c !== "\t" && c !== " ") {
					break;
				}

				indent++;
				i++;
			}

			while(indent <= context.indent || (context.parent && context.indent === context.parent.indent)) {
				context = context.parent;
			}
		} else if(isIdentifierCharacter(c)) {
			if(context.type === "attribute") {
				// Boolean attributes are reset upon encountering another identifier or a newline.
				// Attributes with values are reset upon encountering their values.
				context = context.parent;
			}

			if(context.type !== "element") {
				error("Unexpected identifier");
			}

			accumulator = c;

			while(true) {
				c = template.charAt(i + 1);

				if(!isIdentifierCharacter(c)) {
					if(c !== ":" || !isIdentifierCharacter(template.charAt(i + 2))) {
						break;
					}
				}

				accumulator += c;
				i++;
			}

			if(c === ":") {
				context = {type: "attribute", name: accumulator, value: null, indent: indent, parent: context};
				i++;
			} else if(accumulator === "include") {
				readWhitespace();

				var templateName = readLine();

				if(!templateName) {
					error("Expected template name");
				}

				var subtemplate = parse(options.load(templateName));

				context = {type: "include", template: templateName, indent: indent, parent: context};

				push.apply(context.parent.children, subtemplate.children);

				continue;
			} else if(controlBlocks.hasOwnProperty(accumulator)) {
				context = controlBlocks[accumulator]();
			} else {
				context = {type: "element", name: accumulator, children: [], indent: indent, parent: context};
			}

			context.parent.children.push(context);
		} else if(c === "\t" || c === " ") {
			// Outside of indents and strings, these should be ignored.
		} else if(c === "\"" || c === "'") {
			if(context.type !== "attribute" && context.type !== "element") {
				error("Unexpected string");
			}

			accumulator = "";

			var raw = template.charAt(i - 1) === "!";
			var escaped = false;
			var interpolated = false;
			var quote = c;
			var startLine = line;
			var startLineOffset = lineOffset;
			var startOffset = i - 1;

			while(true) {
				c = template.charAt(i + 1);

				if(!c) {
					line = startLine;
					lineOffset = startLineOffset;
					i = startOffset;
					error("Expected end of string before end of input, starting");
				}

				if(escaped) {
					escaped = false;

					if(c !== "'") {
						accumulator += "\\";
					}
				} else if(c === "\\") {
					escaped = true;
					i++;
					continue;
				} else if(interpolated) {
					if(c === "}") {
						interpolated = false;
					}
				} else if(c === "#" && template.charAt(i + 2) === "{") {
					interpolated = true;
				} else if(c === quote) {
					i++;
					break;
				}

				accumulator += c;
				i++;

				if(c === "\n") {
					line++;
					lineOffset = i;
				}
			}

			var type = raw ? "raw_string" : "string";

			if(context.type === "attribute") {
				// Attributes cannot have more than one value, so this resets the context to their parent.
				context.value = {type: type, content: accumulator};
				context = context.parent;
			} else {
				context.children.push({type: type, content: accumulator});
			}
		} else if(c === "!" && (template.charAt(i + 1) === "\"" || template.charAt(i + 1) === "'")) {
			// “Raw” strings are handled by a lookbehind.
		} else {
			error("Unexpected “" + c + "”");
		}
	}

	while(context.parent) {
		context = context.parent;
	}

	return context;
}

module.exports.parse = parse;
