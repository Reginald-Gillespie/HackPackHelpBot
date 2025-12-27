const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const utils = require('../modules/utils');
const { ConfigDB } = require('../modules/database');

const createLookupCacheKey = () => `lookup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

module.exports = {
    // Auto expand lookup commands into each one
    data: (async () => {
        const config = await ConfigDB.findOne({});
        const subtopics = await utils.getSubtopicCategories();

        const subtopicDescriptions = {};
        subtopics.forEach(subtopic => {
            subtopicDescriptions[subtopic] = `Help Messages for the ${subtopic} category`;
        });
        subtopics.unshift("global");
        subtopicDescriptions["global"] = "Search all help messages at once";

        var lookupCommand = new SlashCommandBuilder().setName("lookup").setDescription("Lookup Command");
        subtopics.forEach(topic => {
            lookupCommand.addSubcommand(command =>
                command.setName(topic).setDescription(subtopicDescriptions[topic]).addStringOption(option =>
                    option.setName("title").setDescription("The Help Message to lookup").setAutocomplete(true).setRequired(true)
                ).addBooleanOption(option =>
                    option.setName("visible").setDescription("Should this be posted publicly?").setRequired(false)
                )
            )
        })
        return lookupCommand
    })(),
    async execute(cmd) {
        const subtopic = cmd.options.getSubcommand();
        const messageTopic = cmd.options.getString("title");
        const isVisible = cmd.options.getBoolean("visible") === true;
        const reply = await utils.getHelpMessageBySubjectTitle(subtopic, messageTopic);
        const baseResponse = {
            allowedMentions: { parse: [] }
        };

        // Check if a message was actually found:
        if (reply === "No content found for this query") {
            cmd.reply({
                ...baseResponse,
                content: "No help message found for that title.",
                ephemeral: true
            });
            return;
        }

        const response = {
            ...baseResponse,
            content: reply,
            ephemeral: !isVisible
        };

        if (!isVisible) {
            const cacheKey = createLookupCacheKey();
            cmd.client.lookupPublicCache = cmd.client.lookupPublicCache || new Map();
            cmd.client.lookupPublicCache.set(cacheKey, {
                content: reply,
                allowedMentions: baseResponse.allowedMentions,
                userId: cmd.user.id
            });

            // Clean up cached messages after 5 minutes to avoid stale data.
            setTimeout(() => cmd.client.lookupPublicCache?.delete(cacheKey), 5 * 60 * 1000);

            response.components = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`lookup_public|${cacheKey}`)
                        .setLabel("Post Publicly")
                        .setStyle(ButtonStyle.Secondary)
                )
            ];
        }

        cmd.reply(response);
    }
};