Razor Leaf is a template engine for JavaScript with a convenient
indentation-based syntax. It aims to reduce the redundancy inherent in HTML
with simple rules, a sparse syntax, and a few further features not found
in larger libraries.

## Syntax

### Elements

Elements are defined by their names only; no other special character is
necessary.

	p

<!-- -->

	<p></p>

Void elements are recognized automatically.

	meta

<!-- -->

	<meta>

### Strings

Strings are double-quoted and escaped for use in HTML as needed. Backslash
escape codes can be used as in JavaScript. No whitespace is added
around strings.

	"--> A string <--\n" "A string containing \"double-quotes\""

<!-- -->

	--&gt; A string &lt;--
	A string containing "double-quotes"

Strings can also contain interpolated sections, delimited by `#{` and `}`.
`#{` can be escaped with a leading backslash; `}` doesn’t require escaping.

	"#{6 * 7}"

<!-- -->

	42

If an exclamation mark precedes the string, it and any of its interpolated
sections will not be escaped.

	!"<!-- A significant comment -->"

<!-- -->

	<!-- A significant comment -->

### Attributes

Attributes are marked up using the syntax <code><i>name</i>:</code>.
An attribute name can, optionally, be followed by a string to be used as
its value; if a value isn’t provided, the attribute is assumed to be boolean
(and present). Note that a string used as an attributes value cannot be “raw”
— that is, cannot be preceded by an exclamation mark.

	meta charset: "utf-8"

<!-- -->

	<meta charset="utf-8">

### Classes

Classes are marked up with a leading period, as in <code>.<i>class</i></code>.

	fieldset .upload-meta
		input.required

<!-- -->

	<fieldset class="upload-meta"><input class="required"></fieldset>

### Hierarchy

Hierarchy in Razor Leaf is defined using indentation. For example:

	html
		head
			meta charset: "utf-8"

			title "Example"

			link
				rel: "stylesheet"
				type: "text/css"
				href: "stylesheets/example.css"

		body
			p id: "introduction"
				"This template is a brief example of hierarchy."

<!-- -->

	<html><head><meta charset="utf-8"><title>Example</title><link rel="stylesheet" type="text/css" href="stylesheets/example.css"></head><body><p id="introduction">This template is a brief example of hierarchy.</p></body></html>

Content found after an element on the same line will also be considered that
element’s content.

### Comments

Comments begin with `#` and continue to the end of the line. They do not affect
the rendered HTML.

### Code

Code blocks begin with `%` and continue to the end of the line.
Code blocks may contain content (strings, elements, other code blocks,
and special blocks, but not attributes); if they do, they are treated as blocks
and wrapped in curly braces.

For example, this template:

	% function countTo(n)
		% for (var i = 1; i <= n; i++)
			"#{i}"

	% countTo(5);

might compile to this JavaScript:

	function countTo(n) {
		for (var i = 1; i <= n; i++) {
			output += i;
		}
	}

	countTo(5);

### Special blocks

Some names define special blocks. These are:

- **`doctype`**: Inserts `<!DOCTYPE html>`.
- **`if (condition)`**: Includes its content only if *`condition`* is met.
- **`elif (condition)`**: Can immediately follow an `if` or an `elif`.
- **`else`**: Can immediately follow an `if` or an `elif`.
- **`for (identifier) of (collection)`**: Includes its content for each element of the array or array-like object *`collection`*.
- **`for (identifier), (index) of (collection)`**: Allows the index variable in a `for` loop to be named.
- **`include (name)`**: Loads and includes another template.
- **`extends (name)`**: Loads another template and replaces its blocks. A template that extends another template cannot have any content outside of block actions.
- **`block (name)`**: Defines a replaceable block.
- **`replace (name)`**: Replaces a block.
- **`append (name)`**: Appends to a block.

## API

### `new razorleaf.DirectoryLoader(root, [options])`

Creates a loader that maps template names to files with the `.leaf` extension
in the directory located at *`root`*.

#### `razorleaf.DirectoryLoader.prototype.load(name)`

Returns a template object loaded from the root directory.

### `razorleaf.compile(template, [options])`

Compiles a template string into a function. The compiled function takes
one argument, `data`, which can be used (under that name) in the template.

### Options

- **`debug`**: If `true`, warnings will be printed. (In a later version, this will enable error rewriting.)
- **`load(name)`**: A function that returns a parsed template represented by `name`. This is filled automatically by most loaders.
- **`globals`**: An object representing the global variables that should be made available to the template.
