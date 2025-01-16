
// This file compiles json debugging steps into visual mermaid flowcharts
const fs = require("fs");

const chartJSON = require("./IDE.json")

// Start at the start of the chart, always labeled "Title"
let queue = ["Title"];
let done = new Set();
let builtChart = ""; // Start building the nodes part of the chart
let round = 0;
while (queue.length > 0) {
    console.log(`Round ${round++}`);
    if (round > 100) { // Emergency crash
        process.exit(1);
    }

    let batch = new Set();
    queue.forEach(nodeName => {
        const node = chartJSON[nodeName];
        if (node) {
            // Define node content
            const escapedContent = node.question.replaceAll('"', "#quot;")
            builtChart += `${nodeName}["${escapedContent}"]\n`;

            // Link node to each answer
            node.answers.forEach(answerObject => {
                const nextNodeName = answerObject.nextStep;
                builtChart += `${nodeName} --> |${answerObject.answer}| ${nextNodeName}\n`;
                
                // Add next node to the queue if it hasn't been done yet
                if (!done.has(nextNodeName)) {
                    done.add(nextNodeName)
                    batch.add(nextNodeName);
                } else {
                    console.log(`Already processed node ${nodeName}`)
                }
            })
        }
    })
    queue = [...batch];
}

// Add the rest of the boilerplate
builtChart = 
`flowchart TD
${builtChart.replaceAll(/^/gm, "    ")}
    %% Node-specific styling
    style Title white-space:nowrap
    style Title stroke-width:3px;

    %% templateColor ${chartJSON?.config?.color || "#57899E"}`;

console.log(builtChart)

fs.writeFileSync("test.mmd", builtChart);
