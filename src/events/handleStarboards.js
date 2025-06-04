const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { Factions, StarboardMessage } = require("../modules/database");

// Starboard handler for the croissant war factions.
// The general idea is that only users with their faction's role can starboard messages 
//   into their faction's starboard channel. 

module.exports = {
    name: Events.MessageReactionAdd,

    /** 
     * @param {import('discord.js').MessageReaction} reaction
     * @param {import('discord.js').User} user 
     * */
    async execute(reaction, user) {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        // See if this emoji is part of a starboard faction
        const faction = await Factions.findOne({
            emoji: reaction.emoji.toString()
        }).lean();
        
        if (!faction || !faction.starboardChannel || !faction.starboardThreshold) {
            return
        }

        // See if enough users in this faction reacted
        // await guild.members.fetch(); // Make sure role cache is up to date. This could present an issue on reaction spam
        const users = await reaction.users.fetch();
        const factionMembers = (await Promise.all(
            users.map(async u => {
                const member = await reaction.message.guild.members.fetch(u.id).catch(() => null);
                return member && member.roles.cache.has(faction.roleId) ? member : null;
            })
        )).filter(Boolean);
        
        if (factionMembers.length < faction.starboardThreshold) return;

        // Star it
        const starboardMessage = {
            id: reaction.message.id,
            emoji: reaction.emoji.toString()
        }
        const result = await StarboardMessage.updateOne(
            starboardMessage,
            { $setOnInsert: starboardMessage },
            { upsert: true }
        );
        const wasCreated = result.upsertedCount > 0;

        // If this star message is new, repost it.
        if (wasCreated) {
            const message = reaction.message;
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: message.author?.tag || "Unknown User",
                    iconURL: message.author?.displayAvatarURL?.() || undefined
                })
                .setDescription(message.content || "[No content]")
                .setColor(faction.themeColor || '#FFD700'); // Gold

            // Attachments (images, etc.)
            if (message.attachments.size > 0) {
                const firstAttachment = message.attachments.first();
                if (firstAttachment && firstAttachment.contentType?.startsWith("image/")) {
                    embed.setImage(firstAttachment.url);
                }
            }

            // Add a button to jump to the original message

            const components = [];
            if (message.guild && message.channel) {
                const jumpUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel("Jump to Message")
                        .setStyle(ButtonStyle.Link)
                        .setURL(jumpUrl)
                );
                components.push(row);
            }

            const channel = message.guild.channels.cache.get(faction.starboardChannel);
            if (channel && channel.isTextBased()) {
                await channel.send({ embeds: [embed], components });
            }
        }


    }
}