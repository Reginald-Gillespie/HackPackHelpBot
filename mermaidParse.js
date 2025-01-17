// Helper module to manage flowchart parsing
// If my flowcharts start using more advanced stuff, this file will need to be changed to support more.


const fs = require("fs")

function postProcessForDiscord(message) {
    message = String(message);
    message = message.replaceAll("#quot;", '"')
    message = message.replaceAll("https:\\/\\/", "https://")
    return message;
}

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

function validateQuestionAnswers(data) {
    // TODO: build a function to recursively validate all paths of a graph when submitted as validation...
    // TODO: return exact text here?
    if (data?.length !== 2) return false;
    const [ questionData, answerDataArray ] = data;
    if (Object.keys(questionData).length !== 2) return false
    if (!Array.isArray(answerDataArray)) return false
    answerDataArray.forEach((item, index) => {
        if (!(typeof item === 'object' && item !== null && Object.keys(item).length === 2)) {
            return false;
        }
    });
    // NOTE: this function does NOT validate that the data keys are valid or contain content, just they exist
    return true;
}

function getQuestionAndAnswers(chartJSON, currentQuestionID, currentAnswerID) {
    // returns [{questionID, question}, [ answer1, answer2, ...]]
    try {
        let nextNodeId = null;

        if (!currentQuestionID) {
            // If no current ID was specified, find the entry point
            nextNodeId = "Title";
        } else {
            // If there was an ID, find the next node along this path
            const currentNode = chartJSON[currentQuestionID];
            const selectedAnswer = currentNode.answers.find(answerObj => answerObj.answer === currentAnswerID);
            nextNodeId = selectedAnswer.nextStep;
        }

        // If no question is provided, find the flowchart entrypoint
        const entryNode = chartJSON[nextNodeId];

        // Format question and answer data as needed
        const questionData = {
            questionID: nextNodeId, 
            question: entryNode.question
        }

        return [questionData, entryNode.answers.filter(answerObj => answerObj.answer).map(answerObj => answerObj.answer) ]
        
    } catch {
        return [ {}, [] ]
    }
        
}

module.exports = { getQuestionAndAnswers, validateQuestionAnswers, postProcessForDiscord }