const fs = require("fs");
const CryptoJS = require("crypto-js");
const puppeteer = require('puppeteer');

// This file returns the filepath to the requested flowcharts, 
//   rendering them if we haven't already saved the current version as an image.

function hash(data) {
    return CryptoJS.MD5(data).toString();
}

function getChartOptions() {
    let files = fs.readdirSync("./Flowcharts");
    files = files
        .filter(filename => filename.endsWith(".mmd"))
        .map(filename => filename.slice(0, -4))
    return files
}

async function renderHTML(html, overrideCache=false) {
    // returns imageLoc

    const fileLoc = `./Flowcharts/cache/${hash(html)}.jpg`;

    // Render with puppeteer if this HTML has not been rendered before
    if (overrideCache || !fs.existsSync(fileLoc)) {
        var debug = false;
        const browser = await puppeteer.launch({headless: !debug});
        const page = await browser.newPage();
        await page.setViewport({
            width: 1920*1,
            height: 1080*1,
            deviceScaleFactor: 4
        });
        await page.setContent(html);
        await new Promise(resolve => setTimeout(resolve, debug ? 100000 : 2000));
        await page.screenshot({path: fileLoc, fullPage: true});
        await browser.close();
    }

    return fileLoc;
}

async function getPathToFlowchart(chartName, mermaidOnly=false, dumpHTML=false, overrideCache=false) {
    // returns [imagePath, errorString]
    if (!getChartOptions().includes(chartName)) {
        return [null, "That does not seem to be a valid chart."]
    }

    // Create HTML
    const mermaidPath = `./Flowcharts/${chartName}.mmd`;
    if (mermaidOnly) return [mermaidPath, null]; // for editing the template we don't need the whole thiing
    const templatePath = `./Flowcharts/template.html`;
    const mermaidContent = fs.readFileSync(mermaidPath).toString()
    let templateContent = fs.readFileSync(templatePath).toString()
    const templateColor = "#"+mermaidContent.match(/%% templateColor #?([a-z\d]+)/)[1]
    templateContent = templateContent.replace("##color##", templateColor);
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
