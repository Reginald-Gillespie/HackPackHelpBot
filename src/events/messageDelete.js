// Logger for ghost pings and other stuff

// events/messageDelete.js

const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {

        const logMessage = [
            `===== **Message Deleted** =====`,
            `**Author:** ${message?.author?.tag} (${message?.author?.id})`,
            `**Channel:** ${message?.channel?.name} (${message?.channel?.id})`,
            `**Content:** ${message?.content || '*No content*'}`,
            "===== ====="
        ].join('\n');

        console.log(logMessage);

    }
};
