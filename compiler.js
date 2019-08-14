"use strict";

const CodeBlock = require("./internal/code-block");
const voidTags = require("./internal/void-tags");
const escapes = require("./escapes");
const Markup = require("./markup");

const POSSIBLE_COMMENT = /\/\/|<!--/;

const IDENTIFIER_ESCAPE = /\\u([\dA-Fa-f]{4})/g;

// Simplified because ES6 uses the ID_Start and ID_Continue Unicode properties
const SIMPLE_IDENTIFIER = /^[a-zA-Z_$][\w_$]*$/;

const RESERVED_WORDS = new Set([
	// Keyword
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"export",
	"extends",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"new",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"yield",

	// FutureReservedWord
	"enum",

	// Strict mode FutureReservedWord
	"implements",
	"interface",
	"package",
	"private",
	"protected",
	"public",

	// NullLiteral
	"null",

	// BooleanLiteral
	"true",
	"false",

	// Additional forbidden `Identifier`s in strict mode
	"let",

	// Additional forbidden `BindingIdentifier`s in strict mode
	"arguments",
	"eval",
]);

const parseIdentifierEscape = (match, identifierEscape) =>
	String.fromCharCode(parseInt(identifierEscape, 16));

const isIdentifier = text => {
	const unescaped = text.replace(IDENTIFIER_ESCAPE, parseIdentifierEscape);

	return (
		SIMPLE_IDENTIFIER.test(unescaped) &&
		!RESERVED_WORDS.has(unescaped)
	);
};

const wrapExpression = expression =>
	POSSIBLE_COMMENT.test(expression) ? expression + "\n" : expression;

const count = (text, c) => {
	let result = 0;
	let i = -1;

	while ((i = text.indexOf(c, i + 1)) !== -1) {
		result++;
	}

	return result;
};

const shortestAttributeRepresentation = attributeValue => {
	if (typeof attributeValue !== "string") {
		throw new TypeError("Attribute value must be a string");
	}

	if (attributeValue === "") {
		return "";
	}

	attributeValue = attributeValue.replace(/&(?=#|[0-9A-Za-z]+;)/g, "&amp;");

	if (!/[\t\n\f\r "'=<>`]/.test(attributeValue)) {
		return "=" + attributeValue;
	}

	return count(attributeValue, '"') > count(attributeValue, '"') ?
		"='" + attributeValue.replace(/'/g, "&#39;") + "'" :
		'="' + attributeValue.replace(/"/g, "&#34;") + '"';
};

const unescapeIdentifier = source =>
	source.replace(/\\u([0-9a-fA-F]{4})|\\u\{([0-9a-fA-F]+)\}/g, (_, hex4, hexAny) =>
		String.fromCodePoint(parseInt(hex4 || hexAny, 16)));

/**
 * Finds names that might be referenced by template code and so should be avoided when generating ones for compiler use.
 *
 * Will generally include many false positives, but false negatives shouldn’t be possible unless `eval` is involved.
 */
const addPossibleConflicts = (possibleConflicts, code) => {
	const JS_IDENTIFIER = /(?:[\p{ID_Start}$_]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\})(?:[\p{ID_Continue}$\u200c\u200d]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\})*/gu;
	let match;

	while ((match = JS_IDENTIFIER.exec(code))) {
		possibleConflicts.add(unescapeIdentifier(match[0]));
	}
};

const passThrough = (compiler, context, node) => {
	for (const child of node.children) {
		compileNode(compiler, context, child);
	}
};

const getScriptIdentifier = templateIdentifier =>
	"_" + templateIdentifier.replace(/-/g, "_");

const resolveParameters = (macro, node) => {
	const l = Math.min(macro.parameters.length, node.parameters.length);
	const results = new Array(l);
	let i;

	for (i = 0; i < l; i++) {
		const parameter = node.parameters[i];

		if (parameter.name !== null) {
			break;
		}

		results[i] = {
			name: macro.parameters[i],
			value: parameter.value,
		};
	}

	for (; i < l; i++) {
		const parameter = node.parameters[i];
		const parameterIndex = macro.parameters.indexOf(parameter.name);

		if (parameterIndex === -1) {
			throw parameter.nonexistent;
		}

		if (results[parameterIndex]) {
			throw parameter.alreadyProvided;
		}

		results[parameterIndex] = parameter;
	}

	if (i < node.parameters.length) {
		throw node.parameters[i].unexpected;
	}

	const missing = [];

	for (i = 0; i < macro.parameters.length; i++) {
		if (!results[i]) {
			missing.push(macro.parameters[i]);
		}
	}

	if (missing.length !== 0) {
		throw node.missing(missing);
	}

	return results;
};

class Scope {
	constructor() {
		this.used = new Set();
	}

	getName(name) {
		if (this.used.has(name)) {
			let i = 1;

			while (this.used.has(name + "_" + i)) {
				i++;
			}

			name += "_" + i;
		}

		this.used.add(name);
		return name;
	}
}

const transform = {
	root: passThrough,
	block: passThrough,
	element: (compiler, context, node) => {
		if (!context.content) {
			throw node.unexpected;
		}

		const name = node.name.toLowerCase();
		const isVoid = voidTags.has(name);

		const newContext = {
			attributes: new CodeBlock().addText(null, "<" + name),
			content: isVoid ? null : new CodeBlock(),
			classes: new CodeBlock(),
		};

		for (const child of node.children) {
			compileNode(compiler, newContext, child);
		}

		context.content.addBlock(newContext.attributes);

		if (newContext.classes.parts.length) {
			for (const part of newContext.classes.parts) {
				if (part.type === "text") {
					part.value = part.value.substring(1);
					break;
				}
			}

			const classText = newContext.classes.toTextOrNull(null);

			if (classText === null) {
				context.content.addText(null, " class=\"");
				context.content.addBlock(newContext.classes);
				context.content.addText(null, "\"");
			} else {
				context.content.addText(null, " class" + shortestAttributeRepresentation(classText));
			}
		}

		context.content.addText(null, ">");

		if (!isVoid) {
			context.content.addBlock(newContext.content);
			context.content.addText(null, "</" + name + ">");
		}
	},
	attribute: (compiler, context, node) => {
		if (!context.attributes) {
			throw node.unexpected;
		}

		context.attributes.addText(null, " " + node.name);

		if (node.value !== null && node.value.value.parts.length !== 0) {
			const text = node.value.value.toTextOrNull(escapes.escapeDoubleQuotedAttributeValue);

			if (text === null) {
				context.attributes.addText(null, "=\"");
				context.attributes.addBlock(node.value.value);
				context.attributes.addText(null, "\"");
			} else {
				context.attributes.addText(null, shortestAttributeRepresentation(text));
			}

			for (const part of node.value.value.parts) {
				if (part.type === "expression") {
					addPossibleConflicts(compiler.possibleConflicts, part.value);
				}
			}
		}
	},
	string: (compiler, context, node) => {
		if (!context.content) {
			throw node.unexpected;
		}

		context.content.addBlock(node.value);

		for (const part of node.value.parts) {
			if (part.type === "expression") {
				addPossibleConflicts(compiler.possibleConflicts, part.value);
			}
		}
	},
	class: (compiler, context, node) => {
		if (!context.classes) {
			throw node.unexpected;
		}

		context.classes.addText(null, " " + node.value);
	},
	code: (compiler, context, node) => {
		context.content.addCode(wrapExpression(node.code) + ";");

		addPossibleConflicts(compiler.possibleConflicts, node.code);
	},
	include: (compiler, context, node) => {
		const subtree = compiler.options.load(node.template);

		for (const [macroName, macro] of subtree.macros) {
			if (compiler.tree.macros.has(macroName)) {
				throw new SyntaxError(`Included template ${node.template} redefines the macro named “${macroName}”.`);
			}

			compiler.tree.macros.set(macroName, macro);
		}

		compileNode(compiler, context, subtree);
	},
	if: (compiler, context, node) => {
		let condition = wrapExpression(node.condition);

		const newContext = {
			content: new CodeBlock(),
			attributes: context.attributes && new CodeBlock(),
			classes: context.classes && new CodeBlock(),
		};

		for (const child of node.children) {
			compileNode(compiler, newContext, child);
		}

		if (node.elif.length) {
			node.else = {
				children: [
					{
						type: "if",
						condition: node.elif[0].condition,
						elif: node.elif.slice(1),
						else: node.else,
						children: node.elif[0].children,
					},
				],
			};
		}

		let elseContext = null;

		if (node.else) {
			elseContext = {
				content: new CodeBlock(),
				attributes: context.attributes && new CodeBlock(),
				classes: context.classes && new CodeBlock(),
			};

			for (const child of node.else.children) {
				compileNode(compiler, elseContext, child);
			}
		}

		const conditionName = compiler.scope.getName("condition");
		(context.attributes || context.content).addCode("var " + conditionName + " = (" + condition + ");");
		condition = conditionName;

		const hasIfAttributes = newContext.attributes && newContext.attributes.parts.length;
		const hasElseAttributes = elseContext && elseContext.attributes && elseContext.attributes.parts.length;
		const hasIfClasses = newContext.classes && newContext.classes.parts.length;
		const hasElseClasses = elseContext && elseContext.classes && elseContext.classes.parts.length;
		const hasIfContent = newContext.content && newContext.content.parts.length;
		const hasElseContent = elseContext && elseContext.content && elseContext.content.parts.length;

		if (hasIfAttributes || hasElseAttributes) {
			context.attributes.addCode("if (" + condition + ") {");
			context.attributes.addBlock(newContext.attributes);
			context.attributes.addCode("}");

			if (hasElseAttributes) {
				context.attributes.addCode("else {");
				context.attributes.addBlock(elseContext.attributes);
				context.attributes.addCode("}");
			}
		}

		if (hasIfClasses || hasElseClasses) {
			context.classes.addCode("if (" + condition + ") {");
			context.classes.addBlock(newContext.classes);
			context.classes.addCode("}");

			if (hasElseClasses) {
				context.classes.addCode("else {");
				context.classes.addBlock(elseContext.classes);
				context.classes.addCode("}");
			}
		}

		if (hasIfContent || hasElseContent) {
			context.content.addCode("if (" + condition + ") {");
			context.content.addBlock(newContext.content);
			context.content.addCode("}");

			if (hasElseContent) {
				context.content.addCode("else {");
				context.content.addBlock(elseContext.content);
				context.content.addCode("}");
			}
		}
	},
	for: (compiler, context, node) => {
		const newContext = {
			content: context.content,
		};

		const collection = wrapExpression(node.collection);

		let indexNameUsed;

		if (node.indexName !== null) {
			context.content.addCode("{ let " + node.indexName + " = 0;");
			indexNameUsed = compiler.scope.used.has(node.indexName);
			compiler.scope.used.add(node.indexName);
		}

		context.content.addCode("for (const " + node.variable + " of (" + collection + ")) {");

		for (const child of node.children) {
			compileNode(compiler, newContext, child);
		}

		if (node.indexName !== null) {
			context.content.addCode(node.indexName + "++; }");

			if (!indexNameUsed) {
				compiler.scope.used.delete(node.indexName);
			}
		}

		context.content.addCode("}");
	},
	call: (compiler, context, node) => {
		const macro = compiler.tree.macros.get(node.name);

		if (macro === undefined) {
			throw node.macroUndefined;
		}

		const macroFunctions =
			context.attributes ?
				compiler.top.attributesMacroFunctions :
				compiler.top.contentOnlyMacroFunctions;
		let macroFunction = macroFunctions.get(node);
		const parameters = resolveParameters(macro, node);
		const recursiveIndex = compiler.calls.indexOf(node);

		if (recursiveIndex === -1) {
			const pushContext = context.attributes || context.content;
			const popContext = context.content || context.attributes;
			const namesInfo = parameters.map(parameter => {
				let originalName = null;
				let temporaryName = null;

				if (compiler.scope.used.has(parameter.name)) {
					originalName = compiler.scope.getName("original_" + parameter.name);
					pushContext.addCode("var " + originalName + " = " + parameter.name + ";");

					if (context.attributes && context.content) {
						temporaryName = compiler.scope.getName("temporary_" + parameter.name);
						context.content.addCode(parameter.name + " = " + temporaryName + ";");
					}
				} else {
					compiler.scope.used.add(parameter.name);
				}

				pushContext.addCode("var " + parameter.name + " = " + wrapExpression(parameter.value) + ";");

				return {
					originalName: originalName,
					temporaryName: temporaryName,
				};
			});

			compiler.calls.push(node);
			macro.yieldContent = node.children;
			passThrough(compiler, context, macro);
			compiler.calls.pop();

			parameters.forEach((parameter, i) => {
				const nameInfo = namesInfo[i];

				if (nameInfo.originalName) {
					if (nameInfo.temporaryName) {
						context.attributes.addCode("var " + nameInfo.temporaryName + " = " + parameter.name + ";");
						context.attributes.addCode(parameter.name + " = " + nameInfo.originalName + ";");
					}

					popContext.addCode(parameter.name + " = " + nameInfo.originalName + ";");
				}
			});

			return;
		}

		const redefine = !macroFunction || !context.attributes && !compiler.calls.includes(node, recursiveIndex + 1);

		if (!macroFunction) {
			macroFunction = compiler.scope.getName(
				getScriptIdentifier(node.name) +
				(context.attributes ? "_attributes" : "_content_only")
			);

			macroFunctions.set(node, macroFunction);
		}

		if (redefine) {
			compiler.calls.push(node);

			if (context.attributes) {
				const newContext = {
					content: new CodeBlock(),
					attributes: new CodeBlock(),
					classes: new CodeBlock(),
				};

				passThrough(compiler, newContext, macro);

				const attributeOutputVariable = compiler.scope.getName("attributeOutput");
				const classOutputVariable = compiler.scope.getName("classOutput");
				const contentOutputVariable = compiler.scope.getName("contentOutput");

				const definition =
					"const " + macroFunction + " = (" + macro.parameters.join(", ") + ") => {\n" +
						"let " + attributeOutputVariable + " = '" + newContext.attributes.toCode(attributeOutputVariable, "text") +
						"let " + classOutputVariable + " = '" + newContext.classes.toCode(classOutputVariable, "text") +
						"let " + contentOutputVariable + " = '" + newContext.content.toCode(contentOutputVariable, "text") +
						"\n\nreturn { attributes: " + attributeOutputVariable + ", classes: " + classOutputVariable + ", content: " + contentOutputVariable + " };" +
					"};\n";

				compiler.top.macroDefinitions.push(definition);
			} else {
				context.content.addCode("const " + macroFunction + " = (" + macro.parameters.join(", ") + ") => {");
				passThrough(compiler, context, macro);
				context.content.addCode("};");
			}

			compiler.calls.pop();
		}

		const parameterList =
			parameters
				.map(parameter => "(" + wrapExpression(parameter.value) + ")")
				.join(", ");

		if (context.attributes) {
			const resultName = compiler.scope.getName("moutput");
			context.attributes.addCode("const " + resultName + " = " + macroFunction + "(" + parameterList + ");");
			context.attributes.addExpression(null, resultName + ".attributes");
			context.classes.addExpression(null, resultName + ".classes");
			context.content.addExpression(null, resultName + ".content");
		} else {
			context.content.addCode(macroFunction + "(" + parameterList + ");");
		}
	},
	yield: (compiler, context, node) => {
		let macro = node;

		do {
			macro = macro.parent;
		} while (macro && macro.type !== "macro");

		if (!macro) {
			throw node.unexpected;
		}

		for (const yieldNode of macro.yieldContent) {
			compileNode(compiler, context, yieldNode);
		}
	},
};

const compileNode = (compiler, context, node) => {
	const transformer = transform[node.type];

	if (!transformer) {
		throw new Error("Unknown node type " + node.type + ".");
	}

	transformer(compiler, context, node);
};

const compile = (tree, options) => {
	const scope = new Scope();

	const context = {
		content: new CodeBlock(),
		attributesMacroFunctions: new Map(),
		contentOnlyMacroFunctions: new Map(),
		macroDefinitions: [],
	};

	const compiler = {
		scope: scope,
		possibleConflicts: scope.used,
		options: options,
		tree: tree,
		top: context,
		calls: [],
	};

	compileNode(compiler, context, tree);

	const outputVariable = scope.getName("output");

	const code =
		context.macroDefinitions.join("") +
		"let " + outputVariable + " = '" + context.content.toCode(outputVariable, "text") +
		"\n\nreturn " + outputVariable + ";";

	const globals = Object.assign({}, options.globals, {
		escapeDoubleQuotedAttributeValue: escapes.escapeDoubleQuotedAttributeValue,
		escapeContent: escapes.escapeContent,
		unwrapMarkup: Markup.unwrap,
	});

	const globalNames = Object.keys(globals);

	for (const name of globalNames) {
		if (!isIdentifier(name)) {
			throw new Error(`Template global “${name}” is not a valid identifier`);
		}
	}

	return new Function(
		"__globals",
		"'use strict';\n" +
		"const {" + globalNames.join(", ") + "} = __globals;\n" +
		"return data => {\n" + code + "\n};"
	)(globals);
};

module.exports = {
	compile,
	transform,
};
