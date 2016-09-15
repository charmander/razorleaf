"use strict";

var vm = require("vm");
var utilities = require("./utilities");
var CodeBlock = utilities.CodeBlock;

var POSSIBLE_COMMENT = /\/\/|<!--/;

var voidTags = utilities.voidTags;

function wrapExpression(expression) {
	return POSSIBLE_COMMENT.test(expression) ? expression + "\n" : expression;
}

function addPossibleConflicts(possibleConflicts, code) {
	// It isn’t possible to refer to a local variable and create a conflict
	// in strict mode without clearly (or nearly so) specifying the variable’s name.
	// Since we won’t be using any name but output_*, other letter and digit
	// characters are not a concern. As for eval – that obviously isn’t possible to work around.
	var JS_IDENTIFIER = /(?:[a-zA-Z_]|\\u[0-9a-fA-F])(?:\w|\\u[0-9a-fA-F])*/g;
	var match;

	while ((match = JS_IDENTIFIER.exec(code))) {
		possibleConflicts[JSON.parse('"' + match[0] + '"')] = true;
	}
}

function passThrough(compiler, context, node) {
	node.children.forEach(function (child) {
		compileNode(compiler, context, child);
	});
}

function getScriptIdentifier(templateIdentifier) {
	return "_" + templateIdentifier.replace(/-/g, "_");
}

function resolveParameters(macro, node) {
	var l = macro.parameters.length;
	var results = new Array(l);
	var i;
	var parameter;

	for (i = 0; i < l; i++) {
		parameter = node.parameters[i];

		if (parameter.name !== null) {
			break;
		}

		results[i] = {
			name: macro.parameters[i],
			value: parameter.value,
		};
	}

	for (; i < l; i++) {
		parameter = node.parameters[i];
		var parameterIndex = macro.parameters.indexOf(parameter.name);

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

	var missing = [];

	for (i = 0; i < l; i++) {
		if (!results[i]) {
			missing.push(macro.parameters[i]);
		}
	}

	if (missing.length !== 0) {
		throw new SyntaxError("Missing values for parameters " + missing.join(", "));
	}

	return results;
}

function Scope() {
	this.used = {};
}

Scope.prototype.getName = function (name) {
	while (hasOwnProperty.call(this.used, name)) {
		name += "_";
	}

	this.used[name] = true;
	return name;
};

var transform = {
	root: passThrough,
	block: passThrough,
	element: function (compiler, context, node) {
		if (!context.content) {
			throw node.unexpected;
		}

		var name = node.name.toLowerCase();
		var isVoid = voidTags.indexOf(name) !== -1;

		var newContext = {
			attributes: new CodeBlock().addText("<" + name),
			content: !isVoid && new CodeBlock(),
			classes: new CodeBlock(),
		};

		node.children.forEach(function (child) {
			compileNode(compiler, newContext, child);
		});

		context.content.addBlock(newContext.attributes);

		if (newContext.classes.parts.length) {
			for (var i = 0; i < newContext.classes.parts.length; i++) {
				var part = newContext.classes.parts[i];

				if (part.type === "text") {
					part.value = part.value.substring(1);
					break;
				}
			}

			context.content.addText(" class=\"");
			context.content.addBlock(newContext.classes);
			context.content.addText("\"");
		}

		context.content.addText(">");

		context.content.addBlock(newContext.content);

		if (!isVoid) {
			context.content.addText("</" + name + ">");
		}
	},
	attribute: function (compiler, context, node) {
		if (!context.attributes) {
			throw node.unexpected;
		}

		context.attributes.addText(" " + node.name);

		if (node.value) {
			context.attributes.addText("=\"");
			context.attributes.addBlock(node.value.value);
			context.attributes.addText("\"");

			for (var i = 0; i < node.value.value.parts.length; i++) {
				var part = node.value.value.parts[i];

				if (part.type === "expression") {
					addPossibleConflicts(compiler.possibleConflicts, part.value);
				}
			}
		}
	},
	string: function (compiler, context, node) {
		if (!context.content) {
			throw node.unexpected;
		}

		context.content.addBlock(node.value);

		for (var i = 0; i < node.value.parts.length; i++) {
			var part = node.value.parts[i];

			if (part.type === "expression") {
				addPossibleConflicts(compiler.possibleConflicts, part.value);
			}
		}
	},
	class: function (compiler, context, node) {
		if (!context.classes) {
			throw node.unexpected;
		}

		context.classes.addText(" " + node.value);
	},
	code: function (compiler, context, node) {
		if (node.children.length) {
			context.content.addCode(wrapExpression(node.code) + " {");

			var newContext = {
				content: context.content,
			};

			node.children.forEach(function (child) {
				compileNode(compiler, newContext, child);
			});

			context.content.addCode("}");
		} else {
			context.content.addCode(wrapExpression(node.code) + ";");
		}

		addPossibleConflicts(compiler.possibleConflicts, node.code);
	},
	include: function (compiler, context, node) {
		var subtree = compiler.options.load(node.template);

		for (var macroName in subtree.macros) {
			if (macroName in compiler.tree.macros) {
				throw new SyntaxError("Included template " + node.template + " redefines the macro named “" + macroName + "”.");
			}

			compiler.tree.macros[macroName] = subtree.macros[macroName];
		}

		compileNode(compiler, context, subtree);
	},
	if: function (compiler, context, node) {
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

		if (node.condition === "yield") {
			var macro = node;

			do {
				macro = macro.parent;
			} while (macro && macro.type !== "macro");

			if (!macro) {
				throw node.unexpectedIfYield;
			}

			if (macro.yieldContent.length) {
				passThrough(compiler, context, node);
			} else if (node.else) {
				passThrough(compiler, context, node.else);
			}

			return;
		}

		var condition = wrapExpression(node.condition);

		var newContext = {
			content: new CodeBlock(),
			attributes: context.attributes && new CodeBlock(),
			classes: context.classes && new CodeBlock(),
		};

		var elseContext;

		node.children.forEach(function (child) {
			compileNode(compiler, newContext, child);
		});

		if (node.else) {
			elseContext = {
				content: new CodeBlock(),
				attributes: context.attributes && new CodeBlock(),
				classes: context.classes && new CodeBlock(),
			};

			node.else.children.forEach(function (child) {
				compileNode(compiler, elseContext, child);
			});
		}

		var conditionName = compiler.scope.getName("condition");
		(context.attributes || context.content).addCode("var " + conditionName + " = (" + condition + ");");
		condition = conditionName;

		var hasIfAttributes = newContext.attributes && newContext.attributes.parts.length;
		var hasElseAttributes = elseContext && elseContext.attributes && elseContext.attributes.parts.length;
		var hasIfClasses = newContext.classes && newContext.classes.parts.length;
		var hasElseClasses = elseContext && elseContext.classes && elseContext.classes.parts.length;
		var hasIfContent = newContext.content && newContext.content.parts.length;
		var hasElseContent = elseContext && elseContext.content && elseContext.content.parts.length;

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
	for: function (compiler, context, node) {
		var newContext = {
			content: context.content,
		};

		var originalName = null;
		var index = node.indexName || compiler.scope.getName("i");
		var collectionName = compiler.scope.getName("collection");
		var collection = wrapExpression(node.collection);

		context.content.addCode("var " + collectionName + " = (" + collection + ");");

		if (node.indexName) {
			if (hasOwnProperty.call(compiler.scope.used, node.indexName)) {
				originalName = compiler.scope.getName("original");

				context.content.addCode("var " + originalName + " = " + node.indexName + ";");
			} else {
				compiler.scope.used[node.indexName] = true;
			}
		}

		context.content.addCode("for (var " + index + " = 0; " + index + " < " + collectionName + ".length; " + index + "++) {");
		context.content.addCode("var " + node.variable + " = " + collectionName + "[" + index + "];");

		node.children.forEach(function (child) {
			compileNode(compiler, newContext, child);
		});

		context.content.addCode("}");

		if (originalName) {
			context.content.addCode(node.indexName + " = " + originalName + ";");
		}
	},
	call: function (compiler, context, node) {
		if (!(node.name in compiler.tree.macros)) {
			throw node.macroUndefined;
		}

		var macro = compiler.tree.macros[node.name];
		var macroFunctions =
			context.attributes ?
				compiler.top.attributesMacroFunctions :
				compiler.top.contentOnlyMacroFunctions;
		var macroFunction = macroFunctions.get(node);
		var parameters = resolveParameters(macro, node);
		var recursiveIndex = compiler.calls.indexOf(node);

		if (recursiveIndex === -1) {
			var pushContext = context.attributes || context.content;
			var originalNames = parameters.map(function (parameter) {
				var originalName = null;

				if (hasOwnProperty.call(compiler.scope.used, parameter.name)) {
					originalName = compiler.scope.getName("original_" + parameter.name);
					pushContext.addCode("var " + originalName + " = " + parameter.name + ";");
				}

				pushContext.addCode("var " + parameter.name + " = " + wrapExpression(parameter.value) + ";");
				return originalName;
			});

			compiler.calls.push(node);
			macro.yieldContent = node.children;
			passThrough(compiler, context, macro);
			compiler.calls.pop();

			parameters.forEach(function (parameter, i) {
				var originalName = originalNames[i];

				if (originalName) {
					context.content.addCode(parameter.name + " = " + originalName + ";");
				}
			});

			return;
		}

		var redefine = !macroFunction || !context.attributes && compiler.calls.indexOf(node, recursiveIndex + 1) === -1;

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
				var newContext = {
					content: new CodeBlock(),
					attributes: new CodeBlock(),
					classes: new CodeBlock(),
				};

				passThrough(compiler, newContext, macro);

				var attributeOutputVariable = compiler.scope.getName("attributeOutput");
				var classOutputVariable = compiler.scope.getName("classOutput");
				var contentOutputVariable = compiler.scope.getName("contentOutput");

				var definition =
					"function " + macroFunction + "(" + macro.parameters.join(", ") + ") {\n" +
						"var " + attributeOutputVariable + " = '" + newContext.attributes.toCode(attributeOutputVariable, "text") +
						"var " + classOutputVariable + " = '" + newContext.classes.toCode(classOutputVariable, "text") +
						"var " + contentOutputVariable + " = '" + newContext.content.toCode(contentOutputVariable, "text") +
						"\n\nreturn { attributes: " + attributeOutputVariable + ", classes: " + classOutputVariable + ", content: " + contentOutputVariable + " };" +
					"}\n";

				compiler.top.macroDefinitions.push(definition);
			} else {
				context.content.addCode("function " + macroFunction + "(" + macro.parameters.join(", ") + ") {");
				passThrough(compiler, context, macro);
				context.content.addCode("}");
			}

			compiler.calls.pop();
		}

		var parameterList =
			parameters
				.map(function (parameter) {
					return "(" + wrapExpression(parameter.value) + ")";
				})
				.join(", ");

		if (context.attributes) {
			var resultName = compiler.scope.getName("moutput");
			context.attributes.addCode("var " + resultName + " = " + macroFunction + "(" + parameterList + ");");
			context.attributes.addExpression(null, resultName + ".attributes");
			context.classes.addExpression(null, resultName + ".classes");
			context.content.addExpression(null, resultName + ".content");
		} else {
			context.content.addCode(macroFunction + "(" + parameterList + ");");
		}
	},
	yield: function (compiler, context, node) {
		var macro = node;

		do {
			macro = macro.parent;
		} while (macro && macro.type !== "macro");

		if (!macro) {
			throw node.unexpected;
		}

		macro.yieldContent.forEach(function (yieldNode) {
			compileNode(compiler, context, yieldNode);
		});
	},
};

function compileNode(compiler, context, node) {
	var transformer = transform[node.type];

	if (!transformer) {
		throw new Error("Unknown node type " + node.type + ".");
	}

	transformer(compiler, context, node);
}

function compile(tree, options) {
	var scope = new Scope();

	var context = {
		content: new CodeBlock(),
		attributesMacroFunctions: new Map(),
		contentOnlyMacroFunctions: new Map(),
		macroDefinitions: [],
	};

	var compiler = {
		scope: scope,
		possibleConflicts: scope.used,
		options: options,
		tree: tree,
		top: context,
		calls: [],
	};

	compileNode(compiler, context, tree);

	var outputVariable = scope.getName("output");

	var code =
		context.macroDefinitions.join("") +
		"var " + outputVariable + " = '" + context.content.toCode(outputVariable, "text") +
		"\n\nreturn " + outputVariable + ";";

	if (options.debug) {
		console.log(code);
	}

	return vm.runInNewContext(
		"'use strict';\n" +
		utilities.escapeAttributeValue + "\n" +
		utilities.escapeContent + "\n\n" +
		"(function template(data) {\n" + code + "\n})",
		options.globals, options.name
	);
}

exports.constructor = { name: "razorleaf.compiler" };
exports.compile = compile;
exports.transform = transform;
