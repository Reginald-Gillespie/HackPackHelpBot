// Developer script to render all .JSON flowcharts into the ./cache directory

const fs = require('fs');

// cd to this folder
const path = require('path');
const process = require('process');
process.chdir(path.dirname(__filename));

(async function main() {

    // Import renderer
    const { getChartOptions, getPathToFlowchart } = require("../flowcharter")
    const allCharts = getChartOptions();
    const usedCache = []; // Keep track of unused cached and remove it to keep things clean
    for (chart of allCharts) {
        console.log(`\n${"=".repeat(50)}\nRendering ${chart}`);
        const [imagePath, error] = await getPathToFlowchart(chart, false, true);
        if (error) {
            console.error(`\x1b[31m${error}\x1b[0m`);
            continue;
        }
        // Copy image to more readable path
        const newCharPath = `./Flowcharts/cache/${chart}-dev.jpg`;
        fs.copyFileSync(imagePath, newCharPath);
        console.log(`\x1b[32mSaved to ${newCharPath}\x1b[0m`);

        usedCache.push(newCharPath);
        usedCache.push(imagePath);
    }

    // Remove unused cache
    const cacheDir = "./Flowcharts/cache";
    const files = fs.readdirSync(cacheDir);
    files.forEach(file => {
        if (!usedCache.includes(`${cacheDir}/${file}`)) {
            fs.unlinkSync(`${cacheDir}/${file}`);
        }
    })

    console.log(`\n${"=".repeat(50)}\nFinished`);

})();