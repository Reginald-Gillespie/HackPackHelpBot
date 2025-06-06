const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { Factions, StarboardMessage, StarboardCooldown } = require("../modules/database");
const ms = require("ms");

// Starboard handler for the croissant war factions.
// The general idea is that only users with their faction's role can starboard messages 
//   into their faction's starboard channel. 
// Only users who are part of the faction may use the faction's emoji.
// Using the faction's emoji has a 1 hour cooldown.

module.exports = {
    name: Events.MessageReactionAdd,

    /** 
     * @param {import('discord.js').MessageReaction} reaction
     * @param {import('discord.js').User} user 
     * */
    async execute(reaction, user) {
        // Fetch partials in parallel
        await Promise.all([
            reaction.partial ? reaction.fetch() : null,
            reaction.message?.partial ? reaction.message.fetch() : null
        ]);

        // See if this emoji is part of a starboard faction
        const faction = await Factions.findOne({
            emoji: reaction.emoji.toString()
        }).lean();
        
        // Only continue if this faction is setup with a starboard
        if (!faction || !faction.starboardChannel || !faction.starboardThreshold) {
            return;
        }

        // Check if this user is allowed to react with this
        const guildMember = await reaction.message.guild.members.fetch(user.id).catch(() => null);
        const isPartOfFaction = guildMember.roles.cache.has(faction.roleId);

        const isOnCooldown = !isPartOfFaction || (await StarboardCooldown.updateOne( // Only bother setting cooldown if part of the faction
            { userId: user.id }, 
            { $setOnInsert: { 
                expiresAt: Date.now() + ms("1h") 
            } }, 
            { upsert: true }
        )).upsertedCount == 0;

        if (!isPartOfFaction || isOnCooldown) {
            await reaction.remove().catch(e=>null);
            return;
        }

        // There's a bit of a race condition here, somoene could react at the same time as someone else and this could be counted before their reactions are removed.
        // I can't think of any good solution atm, and it's not a super critical issue so we'll leave it as is.

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
            { 
                $setOnInsert: { 
                    ...starboardMessage, 
                    finalStar: user.id
                }
            },
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