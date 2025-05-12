const { SlashCommandBuilder } = require('discord.js');
const utils = require('../modules/utils');
const { ConfigDB } = require('../modules/database');

module.exports = {
    // Auto expand lookup commands into each one
    data: (async () => {
        const config = await ConfigDB.findOne({});
        const subtopics = config.allowedHelpMessageCategories;

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
                    option.setName("visible").setDescription("Should this be posted publically?").setRequired(false)
                )
            )
        })
        return lookupCommand
    })(),
    async execute(cmd) {
        const subtopic = cmd.options.getSubcommand();
        const messageTopic = cmd.options.getString("title");
        const isVisible = cmd.options.getBoolean("visible");
        const reply = await utils.getHelpMessageBySubjectTitle(subtopic, messageTopic);

        // Check if a message was actually found:
        if (reply === "No content found for this query") {
            cmd.reply({ content: "No help message found for that title.", ephemeral: true });
        } else {
            cmd.reply({ content: reply, ephemeral: !isVisible });
        }
    }
};