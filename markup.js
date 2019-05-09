"use strict";

function Markup(parts) {
	if (!Array.isArray(parts) || !("raw" in parts)) {
		throw new TypeError("Markup should be written as a template string tag, as in Markup`<br>`; use Markup.unsafe() to create an instance from an arbitrary string.");
	}

	if (parts.length !== 1) {
		throw new TypeError("Template literal used with Markup should not have ${…} substitutions");
	}

	return Markup.unsafe(parts[0]);
}

Markup.unsafe = function (html) {
	if (typeof html !== "string") {
		throw new TypeError("HTML passed to Markup.unsafe must be a string");
	}

	return Object.create(Markup.prototype, {
		_html: {
			configurable: true,
			value: html,
		},
	});
};

Markup.unwrap = function (markup) {
	if (!(markup instanceof Markup)) {
		throw new TypeError("Unescaped content must be an instance of Markup");
	}

	return markup._html;
};

module.exports = Markup;
