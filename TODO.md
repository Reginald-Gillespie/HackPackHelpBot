/admin
- Restart
- Update
- Create new box / flowchart slots

Make sure IDE flowchart covers windows driver issues... might mean seperating paths? Maybe redo flowcharts in more custimizable json and write mermaid compiler.

Add IDE steps image and discord links to flowchart

Lots of caching

Flowcharts
- Error catching 
  - Length of answer history - splice embed answers to not crash on flowchart loops.
  - Flowchart validation
- Slowly work on more advanced+flexible flowchart parsing.
- Post-process flowchart nodes... activate links, embed link, etc
- "Start Over" at the end, and "Back" buttons in flowchart... likely processing flowcharts into json and caching is actually the best idea?
- Figure out why half the time, puppeteer doesn't work properly - extra delays may have fixed this?
- Double check regex anchoring in mermaid parsing (to allow comments)


git ignore the help files loaded so that they don't get overridden with commits
Could convert to storage.js format? But this is nice and easy to edit...

JSON decode handling on mark robot errors

Longer term:
- Split answers out into more embeds (current max with 1 embed is 25 answers logged)