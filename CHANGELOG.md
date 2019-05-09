## 6.0.0

- Node 4 and Node 6 are no longer supported

- `%` line code is no longer supported, because it was able to capture parts of a template in a function and run them in the wrong context

- Attribute syntax now requires a value or a condition.

    5.x:

    ```
    input
        type: "text"
        autofocus:
        if !enabled
            disabled:
    ```

    6.0.0:

    ```
    input
        type: "text"
        autofocus: ""
        disabled: if !enabled
    ```

- Template `for`…`of` loops are now compiled to JavaScript `for`…`of` instead of loops from 0 to length−1

- Attributes with no dynamic content are now rendered to the shortest valid HTML

- Whitespace warnings have been removed
