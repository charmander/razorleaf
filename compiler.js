"use strict";

var push = Array.prototype.push;
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

function OutputBuffer(parts) {
	this.parts = parts || [];
}

OutputBuffer.prototype.addText = function(text) {
	this.parts.push({
		type: "text",
		value: text
	});
};

OutputBuffer.prototype.addCode = function(code) {
	this.parts.push({
		type: "code",
		value: code
	});
};

OutputBuffer.prototype.addInterpolated = function(code) {
	this.parts.push({
		type: "interpolated",
		value: code
	});
};

OutputBuffer.prototype.addBuffer = function(buffer) {
	push.apply(this.parts, buffer.parts);
};

Object.defineProperty(OutputBuffer.prototype, "code", {
	get: function() {
		var isCode = true;
		var code = "";

		for(var i = 0; i < this.parts.length; i++) {
			var part = this.parts[i];

			if(part.type === "code") {
				if(!isCode) {
					code += "';\n";
					isCode = true;
				}

				code += part.value;
			} else {
				if(isCode) {
					code += "\n__output += '";
					isCode = false;
				}

				code += part.type === "interpolated" ? part.value : part.value.replace(/'/g, "\\'");
			}
		}

		if(!isCode) {
			code += "';\n";
		}

		return code;
	}
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
			attributes: new OutputBuffer([
				{
					type: "text",
					value: "<" + node.name
				}
			]),
			content: isVoid ? null : new OutputBuffer(),
			scope: context.scope,
			parent: context,
			done: function() {
				this.parent.content.addBuffer(this.attributes);
				this.parent.content.addText(">");

				if(!isVoid) {
					this.parent.content.addBuffer(this.content);
					this.parent.content.addText("</" + node.name + ">");
				}
			}
		};
	},
	string: function(node, context) {
		if(!context.content) {
			throw node.unexpected;
		}

		context.content.addInterpolated(node.content.code);
	},
	attribute: function(node, context) {
		if(!context.attributes) {
			throw node.unexpected;
		}

		context.attributes.addText(" " + node.name);

		if(node.value !== null) {
			context.attributes.addText("=\"");
			context.attributes.addInterpolated(node.value.content.code);
			context.attributes.addText("\"");
		}
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
		content: new OutputBuffer(),
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

	return {
		attributes: new OutputBuffer(),
		content: new OutputBuffer(),
		scope: context.scope,
		parent: context,
		done: function() {
			var elseContext;

			if(node.else) {
				elseContext = {
					attributes: new OutputBuffer(),
					content: new OutputBuffer(),
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
				this.parent.attributes.addBuffer(this.attributes);
				this.parent.attributes.addCode("}\n");

				if(node.else && elseContext.attributes.parts.length !== 0) {
					this.parent.attributes.addCode("else {\n");
					this.parent.attributes.addBuffer(elseContext.attributes);
					this.parent.attributes.addCode("}\n");
				}
			}

			if(this.content.parts.length !== 0) {
				this.parent.content.addCode("if(" + conditionName + ") {\n");
				this.parent.content.addBuffer(this.content);
				this.parent.content.addCode("}\n");
			}

			if(node.else && elseContext.content.parts.length !== 0) {
				this.parent.content.addCode("else {\n");
				this.parent.content.addBuffer(elseContext.content);
				this.parent.content.addCode("}\n");
			}

			this.scope.used[conditionName] = false;
		}
	};
};

nodeHandlers.for = function(node, context) {
	var indexName = context.scope.createName("index");
	var collectionName = context.scope.createName("collection");

	if(context.scope.used[node.variableName]) {
		throw new SyntaxError("Name " + node.variableName + " is in use in a containing scope.");
	}

	context.scope.used[node.variableName] = true;

	return {
		content: new OutputBuffer(),
		scope: context.scope,
		parent: context,
		done: function() {
			this.parent.content.addCode(
				collectionName + " = (" + node.collection + "\n);\n" +
				"for(" + indexName + " = 0; " + indexName + " < " + collectionName + ".length; " + indexName + "++) {\n" +
				node.variableName + " = " + collectionName + "[" + indexName + "];\n"
			);
			this.parent.content.addBuffer(this.content);
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
