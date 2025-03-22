const { SlashCommandBuilder } = require('discord.js');
const MarkRobot = require('../modules/markRobot');  // Import MarkRobot class

module.exports = {
    data: new SlashCommandBuilder().setName("mark-robot").setDescription("Chat with Mark Robot!")
        .addStringOption(option =>
            option.setName("message").setDescription("What to ask Mark Robot").setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("clear").setDescription("Start a new conversation").setRequired(false)
        ),
    async execute(cmd, storage) {
        await cmd.deferReply({ ephemeral: true });

        const userID = cmd.member.user.id;
        const robotMessage = cmd.options.getString("message");
        const shouldClear = cmd.options.getBoolean("clear") || false;

        if (shouldClear || !storage.cache.markRobotInstances[userID]) {
            storage.cache.markRobotInstances[userID] = new MarkRobot({ "useDevVersion": true });
        }

        var response = await storage.cache.markRobotInstances[userID].message(robotMessage);
        cmd.editReply(response);
    }
};