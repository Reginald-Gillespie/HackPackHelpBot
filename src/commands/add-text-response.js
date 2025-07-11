const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require('discord.js');
const LRUCache = require('lru-cache').LRUCache;
const { CustomResponses } = require("../modules/database")
const { isCreator } = require("../modules/utils")

const CustomResponseCache = new LRUCache({ ttl: 1000 * 60 * 20 }); // 20 minute

module.exports = {
    CustomResponseCache,

    data: new SlashCommandBuilder().setName("add-text-response").setDescription("Create a custom response to text commands like !daily")
        .addStringOption(option =>
            option.setName("trigger").setDescription("The text the message must start with to trigger").setRequired(true)
        )
        .addStringOption(option =>
            option.setName("response").setDescription("The text to respond with").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("delete").setDescription("Whether to delete this option").setRequired(false)
        ),

    async execute(cmd) {
        const trigger = cmd.options.getString("trigger");
        const response = cmd.options.getString("response");
        const shouldDelete = cmd.options.getBoolean("delete");

        if (!(await isCreator(cmd.user.id))) {
            return cmd.reply({ 
                content: `Sorry, you can't use this command.`, 
                allowedMentions: { parse: [] } 
            });
        }

        CustomResponseCache.clear();

        if (shouldDelete) {
            // Remove this one
            const result = await CustomResponses.deleteOne({
                trigger: trigger
            })

            if (result.deletedCount) {
                await cmd.reply({ 
                    content: `Removed custom response.`, 
                    allowedMentions: { parse: [] }
                });
            }
            else {
                await cmd.reply({
                    content: `No custom response found for that trigger`,
                    ephemeral: true
                });
            }
            return;
        }

        if (!response) {
            await cmd.reply({ content: 
                "You must provide a response unless deleting.", 
                allowedMentions: { parse: [] } 
            });
            return;
        }

        await CustomResponses.updateOne(
            { trigger: trigger },
            { $set: { response: response } },
            { upsert: true }
        );

        await cmd.reply({ 
            content: `Added custom response for trigger: \`${trigger}\``, 
            allowedMentions: { parse: [] }
        });
    }
}