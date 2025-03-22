The `render.js` script renders all `.json` files into images, stored in the cache folder.

Any `.json` files in this folder are parsed into `mermaid` chart syntax, then injected into the `template.html` in this folder. requested chart, parsed into mermaid syntax. The chart hex theme color is extracted from a comment and in injected into the template as well.

The cache folder stores the rendered webpage, named by the hash of the webpage injected template (to allow easy cache checking).