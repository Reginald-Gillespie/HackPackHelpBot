// This file returns the filepath to the requested flowcharts, 
//   rendering them if we haven't already saved the current version as an image.

const fs = require("fs");
const CryptoJS = require("crypto-js");
const puppeteer = require('puppeteer');
const path = require('path');
const stripJsonComments = require('strip-json-comments');

// Import parse function from CrunchLabs' OSS charts
require('esbuild-register'); // tsx import support
const { default: getMermaidFromJSON } = require('../Flowcharts/hackpack-flowcharts/utils/parseMermaid');

function JSONCparse(content) {
    const jsonWithoutComments = stripJsonComments(content);
    return JSON.parse(jsonWithoutComments);
}

function hash(data) {
    return CryptoJS.MD5(data).toString();
}

function getChartOptions() {
    const directoryPath = path.join(__dirname, "../Flowcharts/hackpack-flowcharts/flowcharts");
    const files = fs.readdirSync(directoryPath)
        .filter(filename => filename.toLowerCase().endsWith(".json") || filename.toLowerCase().endsWith(".jsonc"));

    const chartOptions = files.map(filename => {
        const filePath = path.join(directoryPath, filename);
        const fileContent = JSONCparse(fs.readFileSync(filePath).toString());
        return {
            path: filePath,
            filename: filename.slice(0, filename.lastIndexOf('.')),
            title: fileContent.title || "Untitled"
        };
    });

    return chartOptions;
}

async function renderHTML(html, overrideCache=false) {
    // returns imageLoc

    // Make sure cache folder is here
    const cacheDir = path.join(__dirname, "../Flowcharts/cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const fileLoc = path.join(__dirname, `../Flowcharts/cache/${hash(html)}.jpg`);
      
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

function getMermaidPath(chartName) {
    const mermaidPathJson = path.join(__dirname, `../Flowcharts/hackpack-flowcharts/flowcharts/${chartName}.json`);
    const mermaidPathJsonc = path.join(__dirname, `../Flowcharts/hackpack-flowcharts/flowcharts/${chartName}.jsonc`);
    if (fs.existsSync(mermaidPathJson)) {
        return mermaidPathJson;
    } else if (fs.existsSync(mermaidPathJsonc)) {
        return mermaidPathJsonc;
    } else {
        return null;
    }
}

/**
 * @param {string} chartFileName
 */
async function getPathToFlowchart(chartFileName, mermaidOnly=false, dumpHTML=false, overrideCache=false) {
    // returns [imagePath, errorString], if mermaidOnly is false
    // returns [mermaidPath, errorString], if mermaidOnly is true

    const selectedChartOption = getChartOptions().find(option => option.filename === chartFileName);
    if (!selectedChartOption) {
        return [null, "That chart could not be found, check the spelling and try using the autocompletes options."]
    }

    // Create HTML
    // const mermaidPath = getMermaidPath(chart);
    const mermaidPath = selectedChartOption.path;
    
    if (mermaidOnly) return [mermaidPath, null]; // for editing the template we don't need the whole thiing
    const templatePath = path.join(__dirname, `../Flowcharts/template.html`);

    const mermaidJSON = JSONCparse(fs.readFileSync(mermaidPath).toString());
    const mermaidContent = await getMermaidFromJSON(mermaidJSON);

    // Build template
    let templateContent = fs.readFileSync(templatePath).toString();
    templateContent = templateContent.replace("##color##", mermaidJSON.color ? "#"+mermaidJSON.color : "#57899E");
    templateContent = templateContent.replace("##flowchart##", mermaidContent);

    // Change escape method to what works best for vanilla js:
    templateContent = templateContent
        .replaceAll('&quot;', '#quot;')
        .replaceAll('&lt;', '#lt;')
        .replaceAll('&gt;', '#gt;')
        .replaceAll('&#96;', '#96;');

    if (true || dumpHTML) {
        fs.writeFileSync(path.join(__dirname, `../Flowcharts/generated.html`), templateContent);
        fs.writeFileSync(path.join(__dirname, `../Flowcharts/mermaid.md`), mermaidContent);
    }

    const imageLoc = await renderHTML(templateContent, overrideCache);
    return [imageLoc, null];
}

if (require.main == module) {
    (async function main(){
        console.log(await getPathToFlowchart("label", false, true))
    })()
} else {
    module.exports = { getPathToFlowchart, getChartOptions, JSONCparse };
}
