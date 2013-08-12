"use strict";

var utilities = require("./utilities");

function Scope() {
	this.used = {};
}

Scope.prototype.createName = function(prefix) {
	var name;
	var i = 1;

	do {
		name = "__" + prefix + i;
		i++;
	} while(this.used[name]);

	this.used[name] = true;

	return name;
};

Object.defineProperty(Scope.prototype, "code", {
	get: function() {
		var names = Object.keys(this.used);

		if(names.length === 0) {
			return "";
		}

		return "var " + names.join(", ") + ";";
	},
	configurable: true,
	enumerable: true
});

var voidTags = [
	"area", "base", "br", "col", "command", "embed", "hr", "img", "input",
	"keygen", "link", "meta", "param", "source", "track", "wbr"
];

var nodeHandlers = {
	root: function() {},
	element: function(node, context) {
		if(!context.content) {
			throw node.unexpected;
		}

		var isVoid = voidTags.indexOf(node.name) !== -1;

		return {
			attributes: new utilities.CodeContext(null, [
				{
					type: "text",
					value: "<" + node.name
				}
			]),
			content: isVoid ? null : new utilities.CodeContext(null),
			scope: context.scope,
			parent: context,
			done: function() {
				this.parent.content.addContext(this.attributes);
				this.parent.content.addText(">");

				if(!isVoid) {
					this.parent.content.addContext(this.content);
					this.parent.content.addText("</" + node.name + ">");
				}
			}
		};
	},
	string: function(node, context) {
		if(!context.content) {
			throw node.unexpected;
		}

		context.content.addContext(node.content);
	},
	attribute: function(node, context) {
		if(!context.attributes) {
			throw node.unexpected;
		}

		context.attributes.addText(" " + node.name);

		if(node.value !== null) {
			context.attributes.addText("=\"");
			context.attributes.addContext(node.value.content);
			context.attributes.addText("\"");
		}
	},
	code: function(node, context) {
		return {
			content: new utilities.CodeContext(),
			scope: context.scope,
			parent: context,
			done: function() {
				this.parent.content.addCode(node.code.trimLeft() + "\n");

				if(this.content.parts.length !== 0) {
					this.parent.content.addCode("{");
					this.parent.content.addContext(this.content);
					this.parent.content.addCode("}\n");
				} else {
					this.parent.content.addCode(";");
					this.parent.content.addContext(this.content);
				}
			}
		};
	}
};

function adjustContext(context, node) {
	var handler = nodeHandlers[node.type];

	if(!handler) {
		throw new Error("Unknown type: " + node.type);
	}

	return handler(node, context);
}

function compileNode(node, context) {
	var newContext = adjustContext(context, node);
	var children = node.children;

	if(newContext) {
		context = newContext;
	}

	if(children) {
		for(var i = 0; i < children.length; i++) {
			var child = children[i];

			compileNode(child, context);
		}
	}

	if(newContext) {
		newContext.done();
	}
}

function compile(tree) {
	var context = {
		content: new utilities.CodeContext(),
		scope: new Scope(),
		done: function() {}
	};

	context.scope.used.__output = true;

	compileNode(tree, context);

	var compiled = new Function(
		"__util, data",
		context.scope.code +
		"\n__output = '';\n" +
		context.content.code +
		"\nreturn __output;"
	);

	return function(data) {
		return compiled(utilities, data);
	};
}

nodeHandlers.doctype = function(node, context) {
	return {
		parent: context,
		done: function() {
			this.parent.content.addText("<!DOCTYPE html>");
		}
	};
};

nodeHandlers.include = function(node, context) {
	return {
		attributes: context.attributes,
		content: context.content,
		scope: context.scope,
		parent: context,
		done: function() {}
	};
};

nodeHandlers.block = function(node, context) {
	return {
		attributes: context.attributes,
		content: context.content,
		scope: context.scope,
		parent: context,
		done: function() {}
	};
};

nodeHandlers.extends = function(node, context) {
	return {
		parent: context,
		done: function() {}
	};
};

nodeHandlers.if = function(node, context) {
	var conditionName = context.scope.createName("condition");

	if(node.elif.length > 0) {
		node.else = {
			children: [{
				type: "if",
				condition: node.elif[0].condition,
				children: node.elif[0].children,
				elif: node.elif.slice(1),
				else: node.else
			}]
		};
	}

	return {
		attributes: new utilities.CodeContext(),
		content: new utilities.CodeContext(),
		scope: context.scope,
		parent: context,
		done: function() {
			var elseContext;

			if(node.else) {
				elseContext = {
					attributes: new utilities.CodeContext(),
					content: new utilities.CodeContext(),
					scope: context.scope,
					parent: context
				};

				for(var i = 0; i < node.else.children.length; i++) {
					var child = node.else.children[i];

					compileNode(child, elseContext);
				}
			}

			if(this.attributes.parts.length === 0 && (!node.else || elseContext.attributes.parts.length === 0)) {
				this.parent.content.addCode(conditionName + " = (" + node.condition + "\n);\n");
			} else {
				this.parent.attributes.addCode(conditionName + " = (" + node.condition + "\n);\n");
				this.parent.attributes.addCode("if(" + conditionName + ") {\n");
				this.parent.attributes.addContext(this.attributes);
				this.parent.attributes.addCode("}\n");

				if(node.else && elseContext.attributes.parts.length !== 0) {
					this.parent.attributes.addCode("else {\n");
					this.parent.attributes.addContext(elseContext.attributes);
					this.parent.attributes.addCode("}\n");
				}
			}

			if(this.content.parts.length !== 0 || node.else) {
				this.parent.content.addCode("if(" + conditionName + ") {\n");
				this.parent.content.addContext(this.content);
				this.parent.content.addCode("}\n");
			}

			if(node.else && elseContext.content.parts.length !== 0) {
				this.parent.content.addCode("else {\n");
				this.parent.content.addContext(elseContext.content);
				this.parent.content.addCode("}\n");
			}

			this.scope.used[conditionName] = false;
		}
	};
};

nodeHandlers.else = function(node, context) {
	// The parser has already taken care of it.
	return {
		content: new utilities.CodeContext(),
		attributes: new utilities.CodeContext(),
		scope: context.scope,
		parent: context,
		done: function() {}
	};
};

nodeHandlers.for = function(node, context) {
	var indexName = context.scope.createName("index");
	var collectionName = context.scope.createName("collection");

	if(context.scope.used[node.variableName]) {
		throw new SyntaxError("Name " + node.variableName + " is in use in a containing scope."); // TODO: Rename variable (requires esprima and escodegen as dependencies) or use a wrapping function (slower).
	}

	context.scope.used[node.variableName] = true;

	return {
		content: new utilities.CodeContext(),
		scope: context.scope,
		parent: context,
		done: function() {
			this.parent.content.addCode(
				collectionName + " = (" + node.collection + "\n);\n" +
				"for(" + indexName + " = 0; " + indexName + " < " + collectionName + ".length; " + indexName + "++) {\n" +
				node.variableName + " = " + collectionName + "[" + indexName + "];\n"
			);
			this.parent.content.addContext(this.content);
			this.parent.content.addCode("}\n");

			this.scope.used[node.variableName] = false;
			this.scope.used[collectionName] = false;
			this.scope.used[indexName] = false;
		}
	};
};

module.exports.compile = compile;
module.exports.utilities = utilities;
module.exports.nodeHandlers = nodeHandlers;
