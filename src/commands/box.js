const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BoxData } = require('../modules/database');
const NodeCache = require("node-cache");
const ms = require("ms")

// It takes a long time to collect forum channel data, so we need to cache it.
const statsCache = new NodeCache({ stdTTL: ms("24h") /1000 })

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
                    content: `Box "${boxName}" not found.`,
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
                .setColor(box.themeColor || '#da9921');

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
                    await interaction.guild.members.fetch();
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

            // Hacks channel stats (forum channel)
            if (box.hacksChannel) {
                try {
                    const hacksChannel = await interaction.client.channels.fetch(box.hacksChannel);
                    if (hacksChannel && hacksChannel.type === 15) { // Forum channel type

                        const hacksCountKey = `${box.hacksChannel}-count`;
                        const hacksUsersKey = `${box.hacksChannel}-users`;

                        if (!statsCache.has(hacksCountKey) || !statsCache.has(hacksUsersKey)) {
                            // Get all threads in the forum
                            const threads = await hacksChannel.threads.fetchActive();
                            const archivedThreads = await hacksChannel.threads.fetchArchived({ limit: 100 });
                            
                            // Combine active and archived threads
                            const allThreads = new Map([...threads.threads, ...archivedThreads.threads]);
                            
                            // Count unique thread creators
                            const uniqueUsers = new Set();
                            allThreads.forEach(thread => {
                                if (thread.ownerId) {
                                    uniqueUsers.add(thread.ownerId);
                                }
                            });

                            statsCache.set(hacksCountKey, allThreads.size)
                            statsCache.set(hacksUsersKey, uniqueUsers.size)
                        }
                        
                        statsFields.push({
                            name: 'Hacks Channel',
                            value: `${statsCache.get(hacksCountKey)} hacks by ${statsCache.get(hacksUsersKey)} users\n<#${box.hacksChannel}>`,
                            inline: true
                        });
                    }
                } catch (error) {
                    console.error('Error fetching hacks channel:', error);
                    if (box.hacksChannel) {
                        statsFields.push({
                            name: '🔧Hacks Channel',
                            value: `<#${box.hacksChannel}>`,
                            inline: true
                        });
                    }
                }
            }

            // Featured hacks stats (forum channel with specific tag)
            if (box.featuredHacksChannel && box.featuredHacksTag) {
                try {
                    const featuredChannel = await interaction.client.channels.fetch(box.featuredHacksChannel);
                    if (featuredChannel && featuredChannel.type === 15) { // Forum channel type

                        const featuredHacksCountKey = `${box.featuredHacksChannel}>${box.featuredHacksTag}-count`;

                        if (!statsCache.has(featuredHacksCountKey)) {
                            // Get all threads in the forum
                            const threads = await featuredChannel.threads.fetchActive();
                            const archivedThreads = await featuredChannel.threads.fetchArchived({ limit: 100 });
                            
                            // Combine active and archived threads
                            const allThreads = new Map([...threads.threads, ...archivedThreads.threads]);
                            
                            // Filter threads that have the specific tag
                            const taggedThreads = [];
                            allThreads.forEach(thread => {
                                if (thread.appliedTags && thread.appliedTags.includes(box.featuredHacksTag)) {
                                    taggedThreads.push(thread);
                                }
                            });

                            statsCache.set(featuredHacksCountKey, taggedThreads.length);
                        }
                        
                        statsFields.push({
                            name: '🏆 Featured Hacks',
                            value: `${statsCache.get(featuredHacksCountKey)} featured hacks\n<#${box.featuredHacksChannel}>`,
                            inline: true
                        });
                    }
                } catch (error) {
                    console.error('Error fetching featured hacks channel:', error);
                    if (box.featuredHacksChannel) {
                        statsFields.push({
                            name: '🏆 Featured Hacks',
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