// Helper module to manage flowchart parsing
// If my flowcharts start using more advanced stuff, this file will need to be changed to support more.

function postProcessForDiscord(message, guild) {
    message = String(message || "This answer appears to be undefined. Please try again later.");
    message = message.replaceAll("#quot;", '"')
    message = message.replaceAll("https:\\/\\/", "https://")

    // Snowflake channel mentions
    const channelMentionRegex = /#(\w[\w-]*)/g;
    message = message.replace(channelMentionRegex, (match, channelName) => {
        const channel = guild.channels.cache.find(c => c.name === channelName);
        return channel ? `<#${channel.id}>` : match;
    });
    
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

function getQuestionAndAnswers(chartJSON, currentQuestionID, currentAnswerID) {
    // returns [{questionID, question}, [ answer1, answer2, ...]]

    let questions = chartJSON.questions;

    try {
        let nextNodeId = null;

        if (!currentQuestionID) {
            // If no current ID was specified, find the entry point
            nextNodeId = "Title";
        } else {
            // If there was an ID, find the next node along this path
            const currentNode = questions[currentQuestionID];
            const selectedAnswer = currentNode.answers.find(answerObj => answerObj?.answer === currentAnswerID);
            nextNodeId = selectedAnswer?.nextQuestion;
        }

        // If no question is provided, find the flowchart entrypoint
        const nextNode = questions[nextNodeId];

        if (!nextNode) throw new Error("No entry node found");

        // Format question and answer data as needed
        const questionData = {
            questionID: nextNodeId, 
            question: nextNode?.question
        }

        return [questionData, nextNode?.answers?.filter(answerObj => answerObj?.answer).map(answerObj => answerObj?.answer) ]
        
    } catch {
        return [ {}, [] ]
    }
        
}

module.exports = { getQuestionAndAnswers, postProcessForDiscord }