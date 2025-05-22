const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BoxData = require('../modules/database'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('box')
        .setDescription('Box-related commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Display statistics for a box')
                .addStringOption(option =>
                    option.setName('box_name')
                        .setDescription('The box name to get stats for')
                        .setRequired(true)
                        .setAutocomplete(true))),

    // async autocomplete(interaction) {
    //     const focusedValue = interaction.options.getFocused();
    //     const boxes = await BoxData.find({});
    //     const filtered = boxes.filter(box =>
    //         box.boxName.toLowerCase().includes(focusedValue.toLowerCase()) ||
    //         box.displayName.toLowerCase().includes(focusedValue.toLowerCase())
    //     ).slice(0, 25);

    //     await interaction.respond(
    //         filtered.map(box => ({ name: box.displayName, value: box.boxName }))
    //     );
    // },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'stats') {
            await this.handleStats(interaction);
        }
    },

    async handleStats(interaction) {
        const boxName = interaction.options.getString('box_name');

        try {
            // Find the box data
            const box = await BoxData.findOne({ boxName: boxName });
            if (!box) {
                return await interaction.reply({
                    content: `❌ Box "${boxName}" not found.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            // Build the display name with emoji if available
            let displayTitle = box.displayName;
            if (box.boxEmoji) {
                const emoji = interaction.client.emojis.cache.get(box.boxEmoji);
                if (emoji) {
                    displayTitle = `${emoji} ${displayTitle}`;
                }
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(displayTitle)
                .setColor(box.themeColor || '#0099ff');

            if (box.boxDescription) {
                embed.setDescription(box.boxDescription);
            }

            // Creator information
            let creatorText = '';
            if (box.creatorId) {
                creatorText = `<@${box.creatorId}>`;
            } else if (box.creator) {
                creatorText = box.creator;
            }
            if (creatorText) {
                embed.addFields({ name: '👤 Creator', value: creatorText, inline: true });
            }

            // Role statistics
            if (box.roleId) {
                try {
                    const role = await interaction.guild.roles.fetch(box.roleId);
                    if (role) {
                        embed.addFields({
                            name: '👥 Role Members',
                            value: `${role.members.size} members have the ${role.name} role`,
                            inline: true
                        });
                    }
                } catch (error) {
                    console.error('Error fetching role:', error);
                }
            }

            // Channel statistics
            let statsFields = [];

            // Hacks channel stats
            if (box.hacksChannel) {
                try {
                    const hacksChannel = await interaction.client.channels.fetch(box.hacksChannel);
                    if (hacksChannel && hacksChannel.isTextBased()) {
                        // Count unique users who have posted in the hacks channel
                        const messages = await hacksChannel.messages.fetch({ limit: 100 });
                        const uniqueUsers = new Set(messages.map(msg => msg.author.id));

                        statsFields.push({
                            name: '🔧 Hacks Channel',
                            value: `${uniqueUsers.size} unique users have posted hacks\n<#${box.hacksChannel}>`,
                            inline: true
                        });
                    }
                } catch (error) {
                    console.error('Error fetching hacks channel:', error);
                    if (box.hacksChannel) {
                        statsFields.push({
                            name: '🔧 Hacks Channel',
                            value: `<#${box.hacksChannel}>`,
                            inline: true
                        });
                    }
                }
            }

            // Featured hacks stats
            if (box.featuredHacksChannel && box.featuredHacksTag) {
                try {
                    const featuredChannel = await interaction.client.channels.fetch(box.featuredHacksChannel);
                    if (featuredChannel && featuredChannel.isTextBased()) {
                        // Count messages with the specific tag for this box
                        const messages = await featuredChannel.messages.fetch({ limit: 100 });
                        const taggedMessages = messages.filter(msg =>
                            msg.content.includes(box.featuredHacksTag) ||
                            (msg.embeds.length > 0 && msg.embeds.some(embed =>
                                embed.description?.includes(box.featuredHacksTag) ||
                                embed.title?.includes(box.featuredHacksTag)
                            ))
                        );

                        statsFields.push({
                            name: '⭐ Featured Hacks',
                            value: `${taggedMessages.size} featured hacks with tag \`${box.featuredHacksTag}\`\n<#${box.featuredHacksChannel}>`,
                            inline: true
                        });
                    }
                } catch (error) {
                    console.error('Error fetching featured hacks channel:', error);
                    if (box.featuredHacksChannel) {
                        statsFields.push({
                            name: '⭐ Featured Hacks',
                            value: `<#${box.featuredHacksChannel}>`,
                            inline: true
                        });
                    }
                }
            }

            // Add all stats fields
            if (statsFields.length > 0) {
                embed.addFields(...statsFields);
            }

            // Add box URL if available
            if (box.boxURL) {
                embed.addFields({
                    name: '🔗 CrunchLabs Page',
                    value: `[View on CrunchLabs](${box.boxURL})`,
                    inline: false
                });
            }

            // Add footer with box name for reference
            embed.setFooter({ text: `Box ID: ${box.boxName}` });
            // embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in box stats command:', error);
            const errorMessage = interaction.deferred ?
                { content: '❌ An error occurred while fetching box statistics.' } :
                { content: '❌ An error occurred while fetching box statistics.', ephemeral: true };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};