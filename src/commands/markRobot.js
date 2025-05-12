const { SlashCommandBuilder } = require('discord.js');
const MarkRobot = require('../modules/markRobot');  // Import MarkRobot class
const LRUCache = require("lru-cache").LRUCache;
const ms = require("ms")

const markRobotInstances = new LRUCache({ ttl: ms("1h") })

module.exports = {
    data: new SlashCommandBuilder().setName("mark-robot").setDescription("Chat with Mark Robot!")
        .addStringOption(option =>
            option.setName("message").setDescription("What to ask Mark Robot").setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("clear").setDescription("Start a new conversation").setRequired(false)
        ),
    async execute(cmd) {
        await cmd.deferReply({ ephemeral: true });

        const userID = cmd.member.user.id;
        const robotMessage = cmd.options.getString("message");
        const shouldClear = cmd.options.getBoolean("clear") || false;

        if (shouldClear || !markRobotInstances.has(userID)) {
            markRobotInstances.set(userID, new MarkRobot({ "useDevVersion": true }));
        }

        var response = await markRobotInstances.get(userID).message(robotMessage);
        cmd.editReply(response);
    }
};