const { Events } = require("discord.js");
const AutoReplyAI = require('../modules/autoReplyAI');
const utils = require('../modules/utils');
const MarkRobot = require('../modules/markRobot');

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client, storage) {
        if (message.author.bot) return;

        let repliedMessage = message.referenceData;
        if (!repliedMessage && message.reference) {
            repliedMessage = message.referenceData = await message.channel.messages.fetch(message.reference.messageId)
        }

        if (message.mentions.has(client.user)) {
            if (!storage.AIPings && !storage?.admins.includes(message.author.id)) return;

            message.channel.sendTyping()

            let repliedToAuthor, repliedToMessage;
            if (message.reference) {
                repliedToMessage = utils.markRobotMessagePostProcess(repliedMessage.content, message.guild);
                if (repliedMessage.author.id === client.user.id) {
                    repliedToAuthor = "you"
                } else {
                    repliedToAuthor = repliedMessage.author.username;
                }
            }

            const messageContentForRobot = utils.markRobotMessagePostProcess(message.content, message.guild);

            let userHistory = storage.cache.markRobotPingsCache[message.author.id] || {
                lastChatLoc: "",
                markRobot: new MarkRobot({ "useDevVersion": true })
            };

            if (message.channelId !== userHistory.lastChatLoc)
                userHistory = {
                    lastChatLoc: "",
                    markRobot: new MarkRobot({ "useDevVersion": true })
                };

            const robotsReply = await userHistory.markRobot.message(messageContentForRobot, repliedToMessage, repliedToAuthor)

            storage.cache.markRobotPingsCache[message.author.id] = userHistory
            message.reply(robotsReply);
        }

        AutoReplyAI.messageHandler(message); // Keep this as is

        const authorID = message.author.id;
        let repeatQuestions = storage.cache.repeatQuestions;
        repeatQuestions[authorID] = repeatQuestions[authorID] || [] //{message: "", channelID: 0, repeats: 0}

        // Find/create message
        let existingQuestion = repeatQuestions[authorID].find(q => utils.areTheSame(message.content, q.message));
        if (existingQuestion) {
            if (existingQuestion.channelID !== message.channel.id && existingQuestion.guildId == message.guildId) {
                existingQuestion.repeats += 1;
            }
            existingQuestion.channelID = message.channel.id
            existingQuestion.guildId = message.guildId
        } else {
            existingQuestion = {
                guildId: message.guildId,
                message: message.content,
                channelID: message.channel.id,
                repeats: 1,
                originalLink: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`
            }
            repeatQuestions[authorID].push(existingQuestion);
        }

        if (repeatQuestions[authorID].length > 3) {
            repeatQuestions[authorID].shift();
        }

        const normalizedContent = message.content.toLowerCase().replace("'", "");
        if (
            storage.dupeNotifs &&
            existingQuestion.guildId == message.guildId &&
            existingQuestion.repeats > 1 &&
            message.content.length >= 30 &&
            utils.isHelpRequest(normalizedContent)
        ) {
            try {
                const originalChannelId = existingQuestion.originalLink.split('/')[5];
                const originalChannel = await client.channels.fetch(originalChannelId);
                const originalMessage = await originalChannel.messages.fetch(existingQuestion.originalLink.split('/').pop());
                if (originalMessage) {
                    message.reply(`-# <:info:1330047959806771210> This appears to be a duplicate question. The original question was asked here ${existingQuestion.originalLink}`);
                }
            } catch (error) {
                existingQuestion.repeats = 1;
                existingQuestion.originalLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            }
        }
    }
};