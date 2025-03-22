const utils = require('../modules/utils');
const { Events } = require("discord.js");

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, client) {  // Add 'client' here
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Error fetching reaction:', error);
                return;
            }
        }

        if (['❌', '👎', ":x:", ":thumbsdown:"].includes(reaction.emoji.name)) {
            if (reaction.message.author.id !== client.user.id) return;
            if (!utils.isCreator(user.id)) return;

            try {
                await reaction.message.delete();
            } catch (error) {
                console.error('Error deleting message:', error);
            }
        }
    }
};