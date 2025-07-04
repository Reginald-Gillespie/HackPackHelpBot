const { Events } = require("discord.js");
const { AutoReplyAI, AutoTaggerAI, formatAIResponse } = require('../modules/autoReplyAI');
const utils = require('../modules/utils');
const MarkRobot = require('../modules/markRobot');
const { ChannelType } = require("discord.js");
const { GoogleGenerativeAI, FunctionCallingMode, SchemaType } = require("@google/generative-ai");
const LRUCache = require("lru-cache").LRUCache;
const ms = require("ms")
const { ConfigDB, CustomResponses } = require('../modules/database');

const { CustomResponseCache } = require("../commands/add-text-response")
const markRobotPingsCache = new LRUCache({ ttl: ms("1h") }) // Store when pinged so we know when to clear if it moved to a new channel. TODO: move to mark robot js file
const repeatQuestionCache = new LRUCache({ ttl: ms("1h") }) // Track for an hour

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot) return;

        // TODO: optimize with cache since this is run on every message
        const config = await ConfigDB.findOne({})
            .lean({ defaults: true})
            .select("AIPings admins dupeNotifs");

        // Check for custom responses:
        // Populate cache
        if (!CustomResponseCache.has("triggers")) {
            const triggers = await CustomResponses.find({}).lean().distinct("trigger");
            CustomResponseCache.set("triggers", triggers);
        }
        const triggers = CustomResponseCache.get("triggers");
        for (const trigger of triggers) {
            if (message.content?.toLowerCase().startsWith(trigger.toLowerCase())) {
                const response = await CustomResponses.findOne({ trigger }).lean().distinct("response")
                message.reply(response[0]);
            }
        }

        // Mark Robot
        let repliedMessage = message.referenceData;
        if (!repliedMessage && message.reference) {
            repliedMessage = message.referenceData = await message.channel.messages.fetch(message.reference.messageId)
        }

        if (message.mentions.has(client.user)) {
            if (!config.AIPings && !config.admins.includes(message.author.id)) return;

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

            let userHistory = markRobotPingsCache.get(message.author.id) || {
                lastChatLoc: "",
                markRobot: new MarkRobot()
            };

            if (message.channelId !== userHistory.lastChatLoc)
                userHistory = {
                    lastChatLoc: "",
                    markRobot: new MarkRobot()
                };

            let robotsReply = await userHistory.markRobot.message(messageContentForRobot, repliedToMessage, repliedToAuthor);
            const robotsReplyChunks = formatAIResponse(robotsReply, "-# ⚠️ This response was written by Mark Robot from the [CrunchLabs IDE](<https://ide.crunchlabs.com>) and may be incorrect.")

            markRobotPingsCache.set(message.author.id, userHistory)

            // Send Mark Robot's reply
            await message.reply({ 
                content: robotsReplyChunks[0], 
                allowedMentions: { users: [discordMessage.author.id] } 
            });
            for (const chunk of robotsReplyChunks.slice(1)) {
                await message.channel.send({ content: chunk, allowedMentions: { parse: [] } });
            }
        }

        // Auto Reply AI
        AutoReplyAI.messageHandler(message, await utils.isCreator(message.author?.id));

        // Auto Tag AI
        AutoTaggerAI.messageHandler(message);

        const authorID = message.author.id;
        repeatQuestionCache.set(authorID, repeatQuestionCache.get(authorID) || []) //{message: "", channelID: 0, repeats: 0}

        //#region Repeat Detection
        let existingQuestion = repeatQuestionCache.get(authorID).find(q => utils.areTheSame(message.content, q.message));
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
            repeatQuestionCache.get(authorID).push(existingQuestion);
        }

        if (repeatQuestionCache.get(authorID).length > 3) {
            repeatQuestionCache.get(authorID).shift();
        }

        const normalizedContent = message.content.toLowerCase().replace("'", "");
        if (
            config.dupeNotifs &&
            existingQuestion.guildId == message.guildId &&
            existingQuestion.repeats > 1 &&
            message.content.length >= 25 &&
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
        //#endregion
    }
};
