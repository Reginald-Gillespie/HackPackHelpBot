// Helper module to manage flowcharts

const fs = require("fs");
const CryptoJS = require("crypto-js");
const puppeteer = require('puppeteer');
const path = require('path');
const process = require('process');
process.chdir(path.dirname(__filename)); // Make sure this file is always cd-ed into its dir


// This file returns the filepath to the requested flowcharts, 
//   rendering them if we haven't already saved the current version as an image.

function hash(data) {
    return CryptoJS.MD5(data).toString();
}

function getChartOptions() {
    let files = fs.readdirSync("./Flowcharts");
    files = files
        .filter(filename => filename.toLowerCase().endsWith(".json"))
        .map(filename => filename.slice(0, -5))
    return files
}

async function renderHTML(html, overrideCache=false) {
    // returns imageLoc

    const fileLoc = `./Flowcharts/cache/${hash(html)}.jpg`;
      
    // Render with puppeteer if this HTML has not been rendered before
    if (overrideCache || !fs.existsSync(fileLoc)) {
        var debug = false;
        // const browser = await puppeteer.launch({headless: !debug});
        const browser = await puppeteer.launch({
            executablePath: fs.existsSync("/usr/bin/chromium-browser") ? "/usr/bin/chromium-browser" : undefined, // Use system Chromium if available
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: !debug
        });
        await new Promise(resolve => setTimeout(resolve, debug ? 100000 : 1000));
        const page = await browser.newPage();
        await new Promise(resolve => setTimeout(resolve, debug ? 100000 : 1000));
        await page.setViewport({
            width: 1920*1,
            height: 1080*1,
            deviceScaleFactor: 4
        });
        await new Promise(resolve => setTimeout(resolve, debug ? 100000 : 1000));
        await page.setContent(html);
        await new Promise(resolve => setTimeout(resolve, debug ? 100000 : 2000));
        await page.screenshot({path: fileLoc, fullPage: true});
        await new Promise(resolve => setTimeout(resolve, debug ? 100000 : 500));
        await browser.close();
    }

    return fileLoc;
}

async function getMermaidFromJSON(chart) {
    try {
        const chartJSON = require(chart);

        // Start at the start of the chart, always labeled "Title"
        let queue = ["Title"];
        let done = new Set();
        let builtChart = ""; // Start building the nodes part of the chart
        let round = 0;
        while (queue.length > 0) {
            // console.log(`Round ${round++}`);
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
                        const arrow = answerObject.customArrow || node.customArrow || "-->";
                        if (answerObject.answer)
                            builtChart += `${nodeName} ${arrow} |${answerObject.answer}| ${nextNodeName}\n`;
                        else
                            builtChart += `${nodeName} ${arrow} ${nextNodeName}\n`; // Dummy answer for spacing
                        
                        // Add next node to the queue if it hasn't been done yet
                        if (!done.has(nextNodeName)) {
                            done.add(nextNodeName)
                            batch.add(nextNodeName);
                        } else {
                            // console.log(`Already processed node ${nodeName}`)
                        }
                    })
                }
            })
            queue = [...batch];
        }

        // Add the rest of the boilerplate
        builtChart = builtChart.replaceAll(/^/gm, "    ").trim()
        builtChart = builtChart.replaceAll("https://", "https:\\/\\/")
        builtChart = builtChart.replaceAll("http://", "http:\\/\\/")
        builtChart = 
        `flowchart TD
        ${builtChart}
        %% Node-specific styling
        style Title white-space:nowrap
        style Title stroke-width:3px;

        %% templateColor ${chartJSON?.config?.color || "#57899E"}`;

        return builtChart;

    } catch (e) {
        // Most often the reason this would be hit is because of invalid json 
        return ""
    }
}

async function getPathToFlowchart(chartName, mermaidOnly=false, dumpHTML=false, overrideCache=false) {
    // returns [imagePath, errorString], if mermaidOnly is false
    // returns [mermaidPath, errorString], if mermaidOnly is true
    if (!getChartOptions().includes(chartName)) {
        return [null, "That chart could not be found, check the spelling and try using the autocompletes options."]
    }

    // Create HTML
    const mermaidPath = `./Flowcharts/${chartName}.json`;
    if (mermaidOnly) return [mermaidPath, null]; // for editing the template we don't need the whole thiing
    const templatePath = `./Flowcharts/template.html`;

    // const mermaidContent = fs.readFileSync(mermaidPath).toString()
    const mermaidContent = await getMermaidFromJSON(`./Flowcharts/${chartName}.json`)

    let templateContent = fs.readFileSync(templatePath).toString()
    const templateColor = "#"+mermaidContent.match(/%% templateColor #?([a-zA-Z\d]+)/)?.[1]
    templateContent = templateContent.replace("##color##", templateColor || "#57899E");
    templateContent = templateContent.replace("##flowchart##", mermaidContent);

    if (dumpHTML) {
        fs.writeFileSync(`./Flowcharts/generated.html`, templateContent)
    }

    const imageLoc = await renderHTML(templateContent, overrideCache);
    return [imageLoc, null];
}




if (require.main == module) {
    (async function main(){
        console.log(await getPathToFlowchart("label", false, true))
    })()
} else {
    module.exports = { getPathToFlowchart, getChartOptions };
}
