const Fuse = require('fuse.js');
const { getChartOptions, getPathToFlowchart } = require("./flowcharter") //Moved from main file
const { ComponentType } = require("discord.js");
const { distance: levenshtein } = require('fastest-levenshtein')

const fuseOptions = {
    includeScore: true,
    keys: ['title']
};

module.exports = {
    isHelpRequest(message) {
        message = message.toLowerCase().replace("'", "");
        return (
            message.length >= 20
        ) && (
                /\bany\b.{10}\bknow\b/.test(message) ||
                /\bcan'?t\b/.test(message) ||
                /\?/iu.test(message) ||
                /anyone know/iu.test(message) ||
                /\bhow\b/iu.test(message) ||
                /\bwhy\b/iu.test(message) ||
                /problem/iu.test(message) ||
                /will not/iu.test(message) ||
                /\bwont/iu.test(message) ||
                /\bisnt/iu.test(message) ||
                /is not/iu.test(message) ||
                /error/iu.test(message) ||
                /^does/iu.test(message) ||
                /^t work/iu.test(message) ||
                /\bhelp\b/iu.test(message)
            )
    },
    areTheSame(msg1, msg2) {
        const threshold = 0.85;

        msg1 = msg1.slice(0, 1000);
        msg2 = msg2.slice(0, 1000);

        const edits = levenshtein(msg1, msg2)
        const similarity = 1 - edits / Math.max(msg1.length + msg2.length)

        return similarity > threshold
    },
    markRobotMessagePostProcess(message, guild) {
        message = message.replace(/<@!?(\d+)>/g, (match, userId) => {
            if (userId === client.user.id) { // Use message.client to get bot
                return "";
            }
            const user = guild.members.cache.get(userId);
            return user ? `@${user.user.username}` : match;
        });
        message = message.trim()
        return message;
    },
    isCreator(userID) {
        //Access storage through global
        return global.storage.creators?.includes(userID) || global.storage.admins?.includes(userID)
    },
    sortByMatch(items, text) {
        if (!text) return items;
        const fuse = new Fuse(items.map(title => ({ title })), fuseOptions);
        const scoredResults = fuse.search(text)
            .filter(result => result.score <= 2)
            .sort((a, b) => a.score - b.score);
        return scoredResults.map(entry => entry.item.title);
    },
    arrayToAutocorrect(array) {
        const choices = array.map(choice => {
            return {
                "name": choice,
                "value": choice
            }
        });
        return choices.slice(0, 25);
    },
    async downloadFile(fileUrl, downloadPath) { //No changes here
        return new Promise((resolve, reject) => {
            const fullPath = path.resolve(downloadPath);
            const file = fs.createWriteStream(fullPath);

            get(fileUrl, (response) => {
                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(fullPath);
                });
            }).on('error', (err) => {
                file.close();
                reject(err);
            });
        });
    },
    findButtonOfId(actionRows, ID) {
        for (const actionRow of actionRows) {
            const button = actionRow.components.find(
                component => component.type === ComponentType.Button && component.customId === ID
            );
            if (button) return button
        }
        return null
    },
    buildGlobalHelps() {
        let mapping = {}
        let index = 1;
        const subtopics = Object.keys(global.storage.helpMessages);
        for (const subtopic of subtopics) {
            const helpMessages = global.storage.helpMessages[subtopic];
            helpMessages.forEach(message => {
                const combinedTitle = `${index}. ${message.title} | (${subtopic})`;
                mapping[combinedTitle] = { title: message.title, subtopic };
                index++;
            });
        }
        return mapping;
    },
    getHelpMessageTitlesArray(subtopic) {
        if (subtopic == "global") {
            return Object.keys(this.buildGlobalHelps());
        }
        else if (!global.storage.helpMessages[subtopic]) {
            return [];
        }
        return global.storage.helpMessages[subtopic].map(message => message.title);
    },
    getHelpMessageBySubjectTitle(subtopic, title) {
        if (subtopic == "global") {
            const originalData = this.buildGlobalHelps()[title];
            [subtopic, title] = [originalData.subtopic, originalData.title];
        }
        else if (!global.storage.helpMessages[subtopic]) {
            return "No Help Messages found for this subtopic.";
        }
        const message = global.storage.helpMessages[subtopic].find(m => m.title === title);
        return message ? message.message : "No content found for this query";
    },
    appendHelpMessage(subtopic, title, message) {
        subtopic = subtopic.match(/[\w-]/g).join("");
        title = title.match(/[\s\w\/&\(\)]/g).join("");
        message = message.match(/[\x20-\x7E\n]/g).join("");
        [subtopic, title, message] = [subtopic.trim(), title.trim(), message.trim()];

        const newMessage = {
            title: title,
            message: message
        };

        if (!global.storage.helpMessages[subtopic]) {
            global.storage.helpMessages[subtopic] = [];
        }
        global.storage.helpMessages[subtopic].push(newMessage);
        global.storage.saveHelps();
        console.log("Message added:", newMessage, "to subtopic:", subtopic);
    },
    editHelpMessage(subtopic, title, message, formerTitle, formerSubtopic) {
        message = message.match(/[\x20-\x7E\n]/g).join("").trim();

        if (formerSubtopic && global.storage.helpMessages[formerSubtopic]) {
            global.storage.helpMessages[formerSubtopic] = global.storage.helpMessages[formerSubtopic].filter(m => m.title !== formerTitle);
        }

        if (!global.storage.helpMessages[subtopic]) {
            global.storage.helpMessages[subtopic] = [];
        }

        const existingMessageIndex = global.storage.helpMessages[subtopic].findIndex(m => m.title === title);
        if (existingMessageIndex > -1) {
            global.storage.helpMessages[subtopic][existingMessageIndex] = { title: title, message: message };
        }
        else {
            global.storage.helpMessages[subtopic].push({ title: title, message: message });
        }

        global.storage.saveHelps();
        console.log("Message edited:", { title: title, message: message }, "in subtopic:", subtopic);
    },
    getPathToFlowchart, //Add to utils
    getChartOptions,

};