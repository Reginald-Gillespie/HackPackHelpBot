const { BoxData } = require('../modules/database');

module.exports = {
    "IDE": "This is the coding IDE. These boxes use ae custom branded online IDE (which in turn uses a branded Arduino Create Agent to allow the browser to connect to the arduino) to code the projects. Some people prefer other IDEs like the Arduino IDE, but these take more setup work and are only advised when the user requests it. A lot of users may refer to coding as \"Hacking\", as this is the language the product is advertised with."
    // Box subtopic info is loaded async
};

// Fill in additional data async
async function loadSubtopicInfo() {
    const allBoxes = await BoxData.find({})
        .select("boxName boxDescription")
        .lean();

    allBoxes.forEach(({ boxName, boxDescription }) => {
        module.exports[boxName] = boxDescription;
    })
}
loadSubtopicInfo()