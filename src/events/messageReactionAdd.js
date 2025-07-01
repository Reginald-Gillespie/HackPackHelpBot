const utils = require('../modules/utils');
const { Events } = require("discord.js");

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        if (reaction.partial) {
            await reaction.fetch().catch(e => {
                console.error('Error fetching reaction:', error);
                return;
            });
        }

        if (['❌', '👎', ":x:", ":thumbsdown:"].includes(reaction.emoji.name)) {
            if (reaction.message.author.id !== client.user.id) return;
            if (!(await utils.isCreator(user.id))) return;

            try {
                await reaction.message.delete();
            } catch (error) {
                console.error('Error deleting message:', error);
            }
        }
    }
};