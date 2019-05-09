[![Build status][ci image]][ci]

Razor Leaf is an HTML template engine for Node.js.


## Features

- automatic escaping

- template inheritance

- recursive macros

- conditional attributes and classes

- explicit whitespace only to make it clear when it affects the content

- no dependencies\*

- unrestricted JavaScript expressions and inline code; no sandboxes to work around

<small>\* This might change.</small>


## Example

`example.rl`:

```
doctype html
    head
        meta charset: "utf-8"
        meta name: "viewport" content: "initial-scale=1"

        title "Example"
    body
        h1 "Hello, world!"

        % const { left, right } = data;
        p "#{left} × #{right} = #{left * right}"
```

`example.js`:

```javascript
const DirectoryLoader = require('razorleaf/directory-loader');

const templateLoader = new DirectoryLoader(__dirname);
const template = templateLoader.load('example');

console.log(
    template({
        left: 9,
        right: 12,
    })
);
```

Output:

> # Hello, world!

> 9 × 12 = 108


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
`#{` can be escaped with a leading backslash; `}` doesn’t require escaping.

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

Attributes are marked up using the syntax <code><i>name</i>: "<i>value</i>"</code>, where <code>"<i>value</i>"</code> is a string as described above. Use an empty string for boolean attributes.

```
meta charset: "utf-8"
```

```html
<meta charset="utf-8">
```

If a boolean attribute is conditional, it can be written in shorthand:

```
input
    name: "#{field.name}"
    disabled: if field.disabled
```

equivalent to:

```
input
    name: "#{field.name}"

    if field.disabled
        disabled: ""
```

### Classes

Classes are marked up with a leading period, as in <code>.<i>class</i></code>.

```
fieldset .upload-meta
    input.required
```

```html
<fieldset class="upload-meta"><input class="required"></fieldset>
```

### Hierarchy

Hierarchy in Razor Leaf is defined using indentation. For example:

```
doctype

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
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Example</title><link rel="stylesheet" type="text/css" href="stylesheets/example.css"></head><body><p id="introduction">This template is a brief example of hierarchy.</p></body></html>
```

Content found after an element on the same line will also be considered that
element’s content.

### Comments

Comments begin with `#` and continue to the end of the line. They do not affect
the rendered HTML.

### Code

**Code blocks** begin with `do` and treats all of their content as JavaScript.

```
do
    const compareKeys = (a, b) =>
        a.key < b.key ? -1 :
        a.key > b.key ? 1 :
        0;

    const sorted = (array, by) =>
        array
            .map(value => ({key: by(value), value}))
            .sort(compareKeys)
            .map(({value}) => value);

    let characterCount = 0;

for post in sorted(posts, post => post.title)
    post-detail(post)
    do characterCount += post.content.length;
```

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
- **`do`**: See [**Code**](#code).

## API

### `new razorleaf.DirectoryLoader(root, [options])`

Creates a loader that maps template names to files with the `.rl` extension
in the directory located at *`root`*.

#### `razorleaf.DirectoryLoader.prototype.load(name, [options])`

Returns a template object loaded from the root directory.

### `razorleaf.compile(template, [options])`

Compiles a template string into a function. The compiled function takes
one argument, `data`, which can be used (under that name) in the template.

### Options

- **`load(name)`**: A function that returns a parsed template represented by `name`. This is filled automatically by most loaders.
- **`globals`**: An object representing the global variables that should be made available to the template.


  [ci]: https://travis-ci.org/charmander/razorleaf
  [ci image]: https://api.travis-ci.org/charmander/razorleaf.svg?branch=master
