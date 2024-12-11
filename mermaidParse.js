const fs = require("fs")

// If my flowcharts start using more advanced stuff, this file will need to be changed to support more.

function matchMultipleGroups(content, regex=/./) {
    // returns [ [match array], [match array] ]
    const matchFinder = new RegExp(regex.source, "gm");
    const matchParser = new RegExp(regex.source, "");
    const results = [];
    content.match(matchFinder)?.forEach(match => {
        const parsed = match.match(matchParser);
        results.push(parsed);
    })
    return results;
}

// answerID is the ID of the answer box, otherwise the line name. 
// Line names take president over answer box IDs
function getQuestionAndAnswers(chartContent, cQuestionID, cAnswerID) {
    // returns [{questionID, question}, [ {answerID, answer} ]]

    // TODO: error checking, return nothing

    try {

        let questionID, question;

        if (!cQuestionID) {
            // Search for entry nodes if no question was provided
            const entryNode = chartContent.match(/^\s*(\w+)\["?(.+?)"?\]/m);
            questionID = entryNode[1]
            question = entryNode[2]
        } else {
            // Try to match a dirrect answer box
            const answerBoxRegex = `${cAnswerID}\\s*-->\\s*(\\w+)\\['?(.+?)"?\\]`
            const inlineRegex = `^\\s*${cQuestionID}\\s*-->\\s*\\|${cAnswerID}\\|\\s*(\\w+)(\\["?(.+?)"?\\])?` // content group is optional for inline
            const selectedNode = chartContent.match(RegExp(`(${answerBoxRegex}|${inlineRegex})`, "m"))

            questionID = selectedNode[2] || selectedNode[4]
            question = selectedNode[3] || selectedNode[6]

            // Sometimes, the question is not defined in the line if it's linked to multiple places
            if (!question) {
                // Fetch question by questionID
                const questionContent = chartContent.match(`ReplaceLCD\\["?(.+?)"?\\]`) || []
                question = questionContent[1]
            }
        }

        // Now that we have the question we're asking, grab the answers.
        var dirrectAnswers = matchMultipleGroups(chartContent, RegExp(`${questionID}\\s*-->\\s*(\\w+)\\['?(.+?)"?\\]`)); // answers pointed to
        var lineAnswers = matchMultipleGroups(chartContent, RegExp(`^\\s*${questionID}\\s*-->\\s*\\|(.+?)\\|\\s*(\\w+)(\\["?.+?"?\\])?`)); // answers in the lines

        // Parse into answer format
        let answers = []
        dirrectAnswers.forEach(answerData => {
            let answerID = answerData[1]
            let answer = answerData[2]
            answers.push({answerID, answer})
        })
        lineAnswers.forEach(answerData => {
            let answerID = answerData[1]
            let answer = answerData[1]
            answers.push({answerID, answer})
        })

        return [
            {questionID, question}, 
            answers
        ]

    } catch {
        // TODO: error reporting? meh, for now I see everything anyways
        return [ {}, [] ]
    }
}

module.exports = { getQuestionAndAnswers }


// const fileLoc = "Flowcharts/label.mmd"
// const chartContent = fs.readFileSync(fileLoc).toString()


// console.log(getQuestionAndAnswers(chartContent))
// [
//     { questionID: 'Title', question: "My Label Maker isn't working" },
//     [
//         { answerID: 'Screen', answer: "My screen isn't working" },
//         { answerID: 'Motor', answer: "A tape motor isn't working" },
//         { answerID: 'Servo', answer: "My servo isn't working" },
//         { answerID: 'Joystick', answer: "My joystick isn't working" },
//         { answerID: 'Power', answer: "It won't turn on" }
//     ]
// ]

// console.log(getQuestionAndAnswers(chartContent, "Title", "Screen"))
// [
//     {
//         questionID: 'ScreenPushIn',
//         question: 'Push the arduino firmly into the breadboard, it might click into place. Does it work now?'
//     },
//     [ { answerID: 'No', answer: 'No' } ]
// ]

// console.log(getQuestionAndAnswers(chartContent, "ScreenPushIn", "No"))
// [
//     { questionID: 'CheckBacklight', question: 'Is the backlight on?' },
//     [
//         { answerID: 'No', answer: 'No' },
//         { answerID: 'Yes', answer: 'Yes' }
//     ]
// ]

// console.log(getQuestionAndAnswers(chartContent, "CheckBacklight", "Yes"))
// [
//     {
//         questionID: 'LCDAnotherArduino',
//         question: 'Try uploading Label Maker code to a different Arduino from ide.crunchlabs.com, and use this arduino. Does it work now?'
//     },
//     [
//         { answerID: 'No', answer: 'No' },
//         { answerID: 'Yes', answer: 'Yes' }
//     ]
// ]

// console.log(getQuestionAndAnswers(chartContent, "LCDAnotherArduino", "No"))
// [
//     {
//       questionID: 'ReplaceLCD',
//       question: 'Contact CrunchLabs for a replacement screen'
//     },
//     []
// ]