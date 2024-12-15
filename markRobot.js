// Helper module to manage Mark RoBot sessions

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { v4: uuidv4 } = require('uuid');


// Each MarkRobot instance is intended for one person, history and all is managed by this class
class MarkRobot {
    constructor() {
        this.history = [];
        this.uuid = uuidv4();
        this.pendingQuestion = false;
        this.socketIOClientId = "Xu4NAVPvQiEWR78ECtBu"; // I don't actually know what this is
    }

    async message(content) {
        if (this.pendingQuestion) return "You already asked Mark Robot something, please wait";
        this.pendingQuestion = true;
        
        const fetchPromise = fetch("https://askmark-d0ry.onrender.com/api/v1/prediction/1065228a-5b00-4f47-917e-0a6fb8cf4c9d", {
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