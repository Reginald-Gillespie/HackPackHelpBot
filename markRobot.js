// Helper module to manage Mark RoBot sessions

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { v4: uuidv4 } = require('uuid');


// Each MarkRobot instance is intended for one person, history and all is managed by this class
class MarkRobot {
    constructor(options) {
        this.history = [];
        this.uuid = uuidv4();
        this.pendingQuestion = false;
        this.socketIOClientId = "cPDnAXFPtm7qOoavA57E"; // I don't actually know what this is
        // 1065228a-5b00-4f47-917e-0a6fb8cf4c9d - Production as of 3/1/25, refuses almost every question
        // 85222c0d-aa7e-42bb-88e6-029ffd91d8ce - Dev, as of 3/1/25, much smarter.
        this.version = options.useDevVersion
            ? "85222c0d-aa7e-42bb-88e6-029ffd91d8ce"
            : "1065228a-5b00-4f47-917e-0a6fb8cf4c9d"
    }

    async message(content, repliedToMessage, repliedToAuthor) {
        if (this.pendingQuestion) return "You already asked Mark Robot something, please wait";
        this.pendingQuestion = true;

        // Check if the replied to message was the last message sent, in which case we don't need to append it to this message
        if (repliedToMessage) {
            const lastMessage = this.history.slice(-1);
            if (lastMessage?.message != repliedToMessage) {
                content = `In reply to this following message by ${repliedToAuthor}:\n`
                        + `\`\`\`${repliedToMessage}\`\`\`,\n`
                        + `\n` 
                        + `${content}`
            }
        }
        
        const fetchPromise = fetch(`https://askmark-d0ry.onrender.com/api/v1/prediction/${this.version}`, {
            "headers": {
                    "accept": "*/*",
                    "accept-language": "en-US",
                    "content-type": "application/json",
                    "priority": "u=1, i",
                    "sec-ch-ua": "Hack Pack Help Bot",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "Node-Fetch",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "cross-site",
                    "sec-gpc": "1"
            },
            "referrer": "https://ide.crunchlabs.com/",
            "referrerPolicy": "strict-origin-when-cross-origin",
            "body": JSON.stringify({
                "question": content,
                "history": this.history,
                "chatId": this.uuid,
                "overrideConfig": {
                    "vars": {
                        "code": ""
                    }
                },
                "socketIOClientId": this.socketIOClientId
            }),
            "method": "POST",
            "mode": "cors",
            "credentials": "omit"
        });

        // Add user's message to history
        this.history.push({
            "message": content,
            "type": "userMessage",
            "fileUploads": []
        })

        // Grab robot's response
        // Example response: {"text":"Hey there! How can I help you today?","question":"Hello","chatId":"56d6ceae-3f41-4309-b180-3b4c80cc7c2d","chatMessageId":"edd10685-ddd2-45c2-a599-ae76754a1554"}
        const response = await (await fetchPromise).json(); // NOTE: not sure if error responses are json or not
        const robotsReply = response.text;

        // Add Robot's response to history
        this.history.push({
            "message": robotsReply,
            "type": "apiMessage",
            "messageId": response.chatMessageId,
            "sourceDocuments": null,
            "fileAnnotations": null
        })

        this.pendingQuestion = false;
        return robotsReply;
    }
  
}

module.exports = MarkRobot;