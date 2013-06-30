[![Build Status](https://travis-ci.org/campersander/razorleaf.png)](https://travis-ci.org/campersander/razorleaf)

Razor Leaf is a template engine for JavaScript with a convenient
indentation-based syntax. It aims, like [Jade], to reduce the redundancy
inherent in HTML — but with simpler rules, a sparser syntax, and a few further
features not found in larger libraries.

## Syntax

### Elements

Elements are defined by their names only; no other special character is
necessary.

```
p
```

```html
<p></p>
```

Void elements are recognized automatically.

```
meta
```

```html
<meta>
```

### Strings

Strings are double-quoted and escaped for use in HTML as needed. Backslash
escape codes can be used as in JavaScript. No whitespace is added
around strings.

```
"--> A string <--\n" "A string containing \"double-quotes\""
```

```html
--&gt; A string &lt;--
A string containing "double-quotes"
```

Strings can also contain interpolated sections, delimited by `#{` and `}`.
Both delimiters can be escaped with a backslash.

```
"#{6 * 7}"
```

```html
42
```

If an exclamation mark precedes the string, it and any of its interpolated
sections will not be escaped.

```
!"<!-- A significant comment -->"
```

```html
<!-- A significant comment -->
```

### Attributes

Attributes are marked up using the syntax <code><i>name</i>:</code>.
An attribute name can, optionally, be followed by a string to be used as
its value; if a value isn’t provided, the attribute is assumed to be boolean
(and present). Note that a string used as an attributes value cannot be “raw”
— that is, cannot be preceded by an exclamation mark.

```
meta charset: "utf-8"
```

```html
<meta charset="utf-8">
```

### Hierarchy

Hierarchy in Razor Leaf is defined using indentation. Indentation *must* use
tabs, and not spaces. For example:

```
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
```

```html
<html><head><meta charset="utf-8"><title>Example</title><link rel="stylesheet"
type="text/css" href="stylesheets/example.css"></head><body><p
id="introduction">This template is a brief example of hierarchy.</p></body></html>
```

Content found after an element on the same line will also be considered that
element’s content.

### Special blocks

Some names define special blocks. These are:

- **`doctype`**: Inserts `<!DOCTYPE html>`.
- **`if (condition)`**: Includes its content only if *`condition`* is met.
- **`else`**: Can immediately follow an `if`.
- **`for (identifier) in (collection)`**: Includes its content for each element
  in the array or array-like object *`collection`*.
- **`include (name)`**: Loads and includes another template.
- **`extends (name)`**: Loads another template and replaces any blocks
  with names matching blocks in the current template with those blocks.
  `extends` must appear at the beginning of the template. A template that
  extends another template cannot have any content outside of blocks.
- **`block (name)`**: Defines a replaceable block, to be used with `extend`.

## API

### `razorleaf.compile(template, [options])`

Compiles a template string into a function. The compiled function takes
one argument, `data`, which can be used (under that name) in the template.

### Options

- **`include(name)`**: A function that should return the template represented
  by `name`, as given by any `include` statements in a template. This is
  optional if template inclusion is not used.

## leaf

`leaf` is a utility to compile static template files to HTML. It can currently
be passed any number of paths to compile, and will write the result to an HTML
file of the same name. (If the path ends in `.leaf`, it is replaced
with `.html`.)

[Jade]: http://jade-lang.com/
