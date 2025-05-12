const Fuse = require('fuse.js');
const { getChartOptions, getPathToFlowchart } = require("./flowcharter") //Moved from main file
const { ComponentType } = require("discord.js");
const { distance: levenshtein } = require('fastest-levenshtein');
const { ConfigDB, StoredMessages } = require("./database")

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
    async isCreator(userID) {
        const config = await ConfigDB.findOne({});
        return config.creators?.includes(userID) || config.admins?.includes(userID)
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
    async buildGlobalHelps() {
        let mapping = {}
        let index = 1;
        
        const allMessages = await StoredMessages.find({})
            .lean()
            .sort({ category: 1 }) // Group categories for AI

        allMessages.forEach((faq, i) => {
            const index = i + 1;
            const combinedTitle = `${index}. ${faq.title} | (${faq.category})`;
            mapping[combinedTitle] = { title: faq.title, subtopic: faq.category };
        });

        return mapping;
    },
    async getHelpMessageTitlesArray(subtopic) {
        if (subtopic == "global") {
            return Object.keys(await this.buildGlobalHelps());
        }

        // Grab all titles under this category
        const faqs = await StoredMessages.find({
            category: subtopic
        }).select("title").lean()

        return faqs.map(message => message.title);
    },
    async getHelpMessageBySubjectTitle(subtopic, title) {
        if (subtopic == "global") {
            const originalData = (await this.buildGlobalHelps())[title];
            [subtopic, title] = [originalData.subtopic, originalData.title];
        }
        
        const message = await StoredMessages.findOne({
            category: subtopic,
            title: title
        })

        return message ? message.message : "I could not find that message";
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

        let storedMesasge = new StoredMessages({
            category: subtopic,
            title: title,
            message: message
        });
        storedMesasge.save()
            .catch(e => console.log("Error, probably already exists.", e));
        
        console.log("Message added:", newMessage, "to subtopic:", subtopic);
    },
    editHelpMessage(subtopic, title, message, formerTitle, formerSubtopic) {
        message = message.match(/[\x20-\x7E\n]/g).join("").trim();

        StoredMessages.updateOne({
            category: formerSubtopic,
            title: formerTitle
        }, {
            $set: {
                category: subtopic,
                title: title,
                message: message
            }
        })
            .then(() => {
                console.log("Message updated:", { title: title, message: message }, "in subtopic:", subtopic);
            })
            .catch(e => console.log("Error, probably already exists.", e))
    },
    getPathToFlowchart, //Add to utils
    getChartOptions,

};