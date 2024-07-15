// 
// This file gets the content every single time it is called.
// If it is ever used more heavily, the file content should be cached. 
//

const fs = require("fs");


function getSubtopics() {
    return fs.readdirSync("./GeneralTopicStore");
}

function grabFromStringToString(string="", start=null, end=null, inclusive=false) {
    if (start) string = string.substring(string.indexOf(start) + (inclusive ? 0 : start.length)) // cut everything before start
    if (end)   string = string.substring(0, string.indexOf(end) - (inclusive ? end.length : 0)) // cut everything after end
    string = string.trim();
    return string;
}

function getDescription(fileContent) {
    return fileContent.split("---")?.[0].split("###")?.[1].trim() || "No Description provided";
}

function getHelpMessageTitlesArray(fileContent="") {
    const messages = fileContent.split("---");
    messages.shift(); // First message is just the category description
    const titles = [];
    messages.forEach(message => {
        var title = grabFromStringToString(message, "Title: ", "\n");
        if (title) titles.push(title);
    })
    return titles;
}

function getHelpMessageBySubjectTitle(subject, title) {
    const fileContent = getFileContent(subject);
    const messages = fileContent.split("---");
    messages.shift(); // First message is just the category description
    for (var message of messages) {
        var thisTitle = grabFromStringToString(message, "Title: ", "\n");
        if (thisTitle == title) {
            return grabFromStringToString(message, "Message:");
        }
    }
    return "No content found for this query";
}

function appendHelpMessage(subtopic, title, message) {
    // Filter fields with regex
    subtopic = subtopic.match(/\w/g).join("");
    // title = title.match(/[\w\/&\(\)]/g).join(""); // This should have already been verified it exists so it is filtered
    message = message.match(/[\x20-\x7E\n]/g).join(""); // ASCII
    message = message.replace(/\-{3}/g, ""); // Three dashes is used to parse file

    // Trim extra newlines or spaces
    [subtopic, title, message] = [subtopic.trim(), title.trim(), message.trim()];

    var helpMessaage = "\n";
    helpMessaage += `Title: ${title}\n`;
    helpMessaage += `Message:\n`;
    helpMessaage += `${message}\n`;
    helpMessaage += `---`;

    console.log("Message added:");
    console.log(helpMessaage)
    fs.appendFileSync(`./GeneralTopicStore/${subtopic}`, helpMessaage);
}

function editHelpMessage(subtopic, title, message, formerSubtopic=null) {
    // We'll start off by removing this message from the file
    const currentSubtopicStore = getFileContent(formerSubtopic);

    // Regex out the old message
    const newFile = currentSubtopicStore.replace(new RegExp(`\n.+${title}(.|\n|\r)+?---`), "");

    // Write the modified file
    fs.writeFileSync(`./GeneralTopicStore/${formerSubtopic}`, newFile);

    // Now write this Help Message to the subfile it was chosen to go to 
    //  (most of the time the same one, so we could technically save one io operation by not doing the above in these cases)
    appendHelpMessage(subtopic, title, message);
}

function getFileContent(fileName) {
    return fs.readFileSync(`./GeneralTopicStore/${fileName}`).toString();
}


// Export functions
module.exports = {
    getDescription,
    getHelpMessageTitlesArray,
    getHelpMessageBySubjectTitle,
    getFileContent,
    getSubtopics,
    editHelpMessage,
    appendHelpMessage
};
