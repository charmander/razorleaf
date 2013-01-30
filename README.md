Razor Leaf is a template engine for HTML whose templates are simple JavaScript.

Arrays are converted into HTML by the following rules:

 - The HTML5 DTD, `<!DOCTYPE html>`, is added automatically.

 - An array whose first element is a string ending with an equals sign (`=`)
   are treated as attributes of the parent element. The name of the attribute
   is the first element of the array, without the equals sign, and its value
   is the second element. (If the array’s length is not exactly 2, an error
   is thrown.) The second attribute may be a boolean value if the attribute
   is a boolean attribute. **`null` and `undefined` will cause the attribute
   to be ignored.**

 - Otherwise, an array whose first element is a string will be treated as an
   element. The first element will be the tag’s name, and the remaining
   elements, its contents.

 - Arrays whose first elements are not strings are inserted as if directly
   into the parent array.

 - A `razorleaf.LiteralString` is inserted directly.

 - All other objects are converted to strings and escaped.

“First element” refers here to the `0` property of a given array,
and *not* the first defined element. Sparse arrays can be used to “escape”
text:

    [, "This will be treated as text, not as a tag name."]

In the case of duplicate attribute names, the last value is used.

## Configuration

Options can be passed to the `Template` constructor as a second argument.
The possible options are:

 - `doctype`: The DTD that should be used, defaulting to `<!DOCTYPE html>`.
   Specify `null` for no DTD.

 - `xhtml`: Whether XHTML-style tags and attributes should be used,
   defaulting to `false`. If `true`, void elements are expressed
   using the self-closing tag syntax (as in `<br />`), and boolean
   attributes use their name as a value when present (as in `checked="checked"`).

 - `gzip`: Whether the response served by `Template.prototype.serve` should be
   compressed, defaulting to `false`.

 - `debug`: If `true`, errors will have accurate line numbers and filenames;
   otherwise, a far more efficient means of execution is used to evaluate
   templates. (“Far more efficient” here means “one hundred times faster”;
   be sure to disable this option in production.)

## Usage

    var fs = require("fs");
    var razorleaf = require("razorleaf");

    var index = new razorleaf.Template(fs.readFileSync("views/index.leaf", "utf-8"), "views/index.leaf");

    index.render({title: "Colours that end in “urple”"});

---

    ["html",
        ["head",
            ["meta", ["charset=", "utf-8"]],
            ["title", data.title]
        ],
        ["body",
            ["h1", "Hello, world!"]
        ]
    ]

---

    <!DOCTYPE html>

    <html>
        <head>
            <meta charset="utf-8">

            <title>Colours that end in “urple”</title>
        </head>
        <body>
            <h1>Hello, world!</h1>
        </body>
    </html>

## Reference

#### `new Template(template, [filePath], [options])`

Creates a new template from the specified string with the specified options
(see **Configuration**). `filePath` optionally specifies the file containing
the template, for debugging purposes.

#### `Template.prototype.render(data)`

Renders the template with the specified data and returns the result as a string.

#### `Template.prototype.serve(request, response, data)`

*Note: this method does not yet exist*

Renders the template with the specified data and options, and serves the result
to the specified HTTP response.

## Known bugs

 - HTML attribute names also exclude Unicode control characters.
   This should be an error, but will only be a warning, because specifying
   all Unicode control characters inside the regular expression used
   to validate attribute names would be a waste.
 - Attribute names aren’t checked for validity on their respective elements.
 - Attribute names aren’t checked for validity in XML.
 - Tag names aren’t checked for validity in HTML, nor are they checked
   for validity in their context.
 - The root element isn’t verified to be called `html`.
