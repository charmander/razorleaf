"use strict";

var utilities = require("./utilities");
var CodeBlock = utilities.CodeBlock;

var POSSIBLE_COMMENT = /\/\/|<!--/;

function addPossibleConflicts(possibleConflicts, code) {
	// It isn’t possible to refer to a local variable and create a conflict
	// in strict mode without clearly (or nearly so) specifying the variable’s name.
	// Since we won’t be using any name but output_*, other letter and digit
	// characters are not a concern. As for eval – that obviously isn’t possible to work around.
	var JS_IDENTIFIER = /(?:[a-zA-Z_]|\\u[0-9a-fA-F])(?:\w|\\u[0-9a-fA-F])*/g;

	code.match(JS_IDENTIFIER).forEach(function (m) {
		possibleConflicts[JSON.parse('"' + m + '"')] = true;
	});
}

function passThrough(compiler, context, node) {
	node.children.forEach(function (child) {
		compileNode(compiler, context, child);
	});
}

function Scope() {
	this.used = {};
}

Scope.prototype.getName = function (name) {
	while (this.used.hasOwnProperty(name)) {
		name += "_";
	}

	this.used[name] = true;
	return name;
};

var voidTags = [
	"area", "base", "br", "col", "command", "embed", "hr", "img", "input",
	"keygen", "link", "meta", "param", "source", "track", "wbr"
];

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
			classes: new CodeBlock()
		};

		node.children.forEach(function (child) {
			compileNode(compiler, newContext, child);
		});

		context.content.addBlock(newContext.attributes);

		if (newContext.classes.parts.length) {
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
			context.content.addCode(node.code + (POSSIBLE_COMMENT.test(node.code) ? "\n{" : " {"));

			var newContext = {
				content: context.content
			};

			node.children.forEach(function (child) {
				compileNode(compiler, newContext, child);
			});

			context.content.addCode("}");
		} else {
			context.content.addCode(node.code + (POSSIBLE_COMMENT.test(node.code) ? "\n;" : ";"));
		}

		addPossibleConflicts(compiler.possibleConflicts, node.code);
	},
	include: function (compiler, context, node) {
		var subtree = compiler.options.load(node.template);

		compileNode(compiler, context, subtree);
	},
	if: function (compiler, context, node) {
		var condition = POSSIBLE_COMMENT.test(node.condition) ? node.condition + "\n" : node.condition;

		var newContext = {
			content: new CodeBlock(),
			attributes: context.attributes && new CodeBlock(),
			classes: context.classes && new CodeBlock()
		};

		var elseContext;

		node.children.forEach(function (child) {
			compileNode(compiler, newContext, child);
		});

		if (node.elif.length) {
			node.else = {
				children: [
					{
						type: "if",
						condition: node.elif[0].condition,
						elif: node.elif.slice(1),
						else: node.else,
						children: node.elif[0].children
					}
				]
			};
		}

		if (node.else) {
			elseContext = {
				content: new CodeBlock(),
				attributes: context.attributes && new CodeBlock(),
				classes: context.classes && new CodeBlock()
			};

			node.else.children.forEach(function (child) {
				compileNode(compiler, elseContext, child);
			});
		}

		var conditionName = compiler.scope.getName("condition");
		(context.attributes || context.content).addCode("var " + conditionName + " = (" + condition + ");");
		condition = conditionName;

		if (newContext.attributes && newContext.attributes.parts.length) {
			context.attributes.addCode("if (" + condition + ") {");
			context.attributes.addBlock(newContext.attributes);
			context.attributes.addCode("}");

			if (elseContext && elseContext.attributes.parts.length) {
				context.attributes.addCode("else {");
				context.attributes.addBlock(elseContext.attributes);
				context.attributes.addCode("}");
			}
		}

		if (newContext.classes && newContext.classes.parts.length) {
			context.classes.addCode("if (" + condition + ") {");
			context.classes.addBlock(newContext.classes);
			context.classes.addCode("}");

			if (elseContext && elseContext.classes.parts.length) {
				context.classes.addCode("else {");
				context.classes.addBlock(elseContext.classes);
				context.classes.addCode("}");
			}
		}

		if (newContext.content.parts.length) {
			context.content.addCode("if (" + condition + ") {");
			context.content.addBlock(newContext.content);
			context.content.addCode("}");

			if (elseContext && elseContext.content.parts.length) {
				context.content.addCode("else {");
				context.content.addBlock(elseContext.content);
				context.content.addCode("}");
			}
		}
	},
	for: function (compiler, context, node) {
		var newContext = {
			content: context.content
		};

		var originalName = null;
		var index = node.indexName || compiler.scope.getName("i");
		var collectionName = compiler.scope.getName("collection");
		var collection = POSSIBLE_COMMENT.test(node.collection) ? node.collection + "\n" : node.collection;

		context.content.addCode("var " + collectionName + " = (" + collection + ");");

		if (node.indexName) {
			if (compiler.scope.used.hasOwnProperty(node.indexName)) {
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
	}
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

	var compiler = {
		scope: scope,
		possibleConflicts: scope.used,
		options: options
	};

	var context = {
		content: new CodeBlock()
	};

	compileNode(compiler, context, tree);

	var outputVariable = scope.getName("output");

	var code =
		"'use strict';\n\n" +
		utilities.escapeAttributeValue + "\n" +
		utilities.escapeContent + "\n\n" +
		"var " + outputVariable + " = '" + context.content.toCode(outputVariable, "text") +
		"\n\nreturn " + outputVariable + ";";

	if (options.debug) {
		console.log(code);
	}

	// jshint evil: true
	return new Function("data", code);
}

module.exports.constructor = { name: "razorleaf.compiler" };
module.exports.compile = compile;
module.exports.transform = transform;
