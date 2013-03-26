Razor Leaf is a template engine for HTML. It is indentation-based and vaguely
resembles [Jade] \(among others).

## Example

```
doctype

html
  head
    meta charset: 'utf-8'

    title 'Hello, world!'

    for script in data.scripts
      script type: 'text/javascript' src: '#{script.url}'
        if script.async
          async:

    for stylesheet in data.stylesheets
      link
        rel: 'stylesheet'
        type: 'text/css'
        href: '#{stylesheet.url}'

  body
    h1 id: 'title'
      'An example'

    p id: 'content' 'This template demonstrates ' em 'most'
      ' of Razor Leaf’s features.'

    !'Literal <abbr title="HyperText Markup Language">HTML</abbr> content can be written using a string with a leading exclamation mark.'
```

```javascript
var fs = require("fs");
var razorleaf = require("razorleaf");
var template = razorleaf.compile(fs.readFileSync("views/template.leaf", "utf8"));

console.log(template(data));
```

## API

### `razorleaf.compile(template)`

Compiles a template and returns a function that renders the template
and returns the result, taking an optional `data` argument usable inside
the template.

## Syntax

There are four types of “items”.

### Elements

An element is defined by a name and may be followed on the same line by any
number of attributes and strings, and up to one element. If the element is not
inline (that is, on the same line as another element), it may followed by an
indented block containing any number of elements, attributes, strings, and
special blocks.

### Attributes

Attributes use the syntax `name: 'value'`. The value is optional, and must be a
string if provided. If a value is not provided, the attribute is assumed to be
boolean. Whitespace between the colon and value is required, as both attribute
and element names may contain colons.

### Strings

Strings may be delimited by either single or double quotes. Any expression
between `#{` and `}` is interpolated. When interpolating, quotes do not need to
be escaped, but a closing brace (`}`) does. Strings’ contents are escaped as
appropriate. Unescaped strings are marked up with a `!` before the opening
delimiter.

### Special blocks

- `for (identifier) in (expression)` will evaluate `(expression)` (the
  remainder of the line) as JavaScript and iterate over the result. `for`
  blocks cannot directly contain attributes.

- `if (expression)` will evaluate `(expression)` (the remainder of the line) as
  JavaScript and include the block if the result is truthy (by the same rules
  as JavaScript’s `if`). It may be followed by an `else` block.

- `doctype` will insert the string `<!DOCTYPE html>`.

## Upcoming features

- Replaceable blocks and template extension/inclusion

[Jade]: http://jade-lang.com/
