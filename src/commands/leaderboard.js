const {
    SlashCommandBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { BoxData, BoxReviews, IssueTrackerDB, ConfigDB } = require('../modules/database');
const { getEmojiRatingFromNum, rankingData } = require('./rate');
const LRUCache = require('lru-cache').LRUCache;

const leaderboardCache = new LRUCache({ ttl: 1000 * 60 * 30 }); // 30 minute

// The list of all criteria used for ratings
const CRITERIA = rankingData.map(r => r.key);
const RATING_WEIGHTS = Object.fromEntries(rankingData.map(r => [r.key, r.weight]))



// Calculate the weighted average rating of a box or creator
async function calculateAverageRatings(reviews) {
    if (!reviews || reviews.length === 0) return null;

    // Initialize counters for each criterion
    const criterionSums = {};
    const criterionCounts = {};

    CRITERIA.forEach(criterion => {
        if (criterion !== 'Overall') { // Skip Overall since we calculate it
            criterionSums[criterion] = 0;
            criterionCounts[criterion] = 0;
        }
    });

    // Sum up all ratings
    reviews.forEach(review => {
        CRITERIA.forEach(criterion => {
            if (criterion !== 'Overall' && review[criterion]) {
                criterionSums[criterion] += parseFloat(review[criterion]);
                criterionCounts[criterion]++;
            }
        });
    });

    // Calculate averages for each criterion
    const averages = {};
    let weightedSum = 0;
    let totalWeight = 0;

    CRITERIA.forEach(criterion => {
        if (criterion !== 'Overall') {
            if (criterionCounts[criterion] > 0) {
                averages[criterion] = criterionSums[criterion] / criterionCounts[criterion];
                weightedSum += averages[criterion] * RATING_WEIGHTS[criterion];
                totalWeight += RATING_WEIGHTS[criterion];
            } else {
                averages[criterion] = 0;
            }
        }
    });

    // Calculate overall weighted average
    averages.Overall = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return averages;
}

// Get all boxes with their ratings
async function getAllBoxesWithRatings() {
    try {
        const boxes = await BoxData.find().lean();
        const result = [];

        for (const box of boxes) {
            const reviews = await BoxReviews.find({ boxName: box.boxName }).lean();
            if (reviews.length > 0) {
                const averageRatings = await calculateAverageRatings(reviews);
                result.push({
                    ...box,
                    averageRatings,
                    reviewCount: reviews.length
                });
            }
        }

        return result;
    } catch (error) {
        console.error('Error fetching all box ratings:', error);
        return [];
    }
}

// Get all creators with their ratings
async function getAllCreatorsWithRatings() {
    try {
        // Get all unique creators
        const creators = await BoxData.find().distinct('creator');
        const result = [];

        for (const creator of creators) {
            // Skip if no creator ID
            if (!creator) continue;

            // Get all boxes by this creator
            const creatorBoxes = await BoxData.find({ creator }).lean();
            if (!creatorBoxes || creatorBoxes.length === 0) continue;

            // Get creator info from first box
            const creatorName = creatorBoxes[0].creator || 'Unknown Creator';

            // Get all reviews for these boxes
            const allReviews = [];
            for (const box of creatorBoxes) {
                const boxReviews = await BoxReviews.find({ boxName: box.boxName }).lean();
                allReviews.push(...boxReviews);
            }

            if (allReviews.length > 0) {
                const ratings = await calculateAverageRatings(allReviews);
                result.push({
                    creator,
                    creatorName,
                    ratings,
                    boxCount: creatorBoxes.length,
                    reviewCount: allReviews.length
                });
            }
        }

        return result;
    } catch (error) {
        console.error('Error fetching all creator ratings:', error);
        return [];
    }
}

async function getFeaturedHacksLeaderboard(client) {
    try {
        // Get all boxes with featured hack channels
        const boxes = await BoxData.find({
            featuredHacksChannel: { $exists: true, $ne: null, $ne: '' }
        }).lean();

        if (!boxes || boxes.length === 0) {
            return [];
        }

        // Get unique featured hack channels to minimize API calls
        const uniqueChannels = [...new Set(boxes.map(box => box.featuredHacksChannel))];

        const userPostCounts = new Map();

        // Fetch threads from each unique channel
        for (const channelId of uniqueChannels) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (!channel || !channel.isThreadOnly?.() && !channel.threads) continue;

                // Fetch all threads in the channel
                const threads = await channel.threads.fetchActive();
                const archivedThreads = await channel.threads.fetchArchived({ limit: 100 });

                // Combine active and archived threads
                const allThreads = new Map([...threads.threads, ...archivedThreads.threads]);

                // Count posts by user
                for (const [threadId, thread] of allThreads) {
                    const ownerId = thread.ownerId;
                    if (ownerId) {
                        userPostCounts.set(ownerId, (userPostCounts.get(ownerId) || 0) + 1);
                    }
                }
            } catch (error) {
                console.error(`Error fetching threads from channel ${channelId}:`, error);
                continue;
            }
        }

        // Convert to array and sort by post count
        const leaderboard = [];
        for (const [userId, count] of userPostCounts) {
            try {
                const user = await client.users.fetch(userId);
                leaderboard.push({
                    id: userId,
                    username: user.username,
                    displayName: user.displayName || user.username,
                    postCount: count
                });
            } catch (error) {
                // If we can't fetch the user, skip them
                console.error(`Error fetching user ${userId}:`, error);
                continue;
            }
        }

        // Sort by post count (descending) and limit to top 10
        return leaderboard
            .sort((a, b) => b.postCount - a.postCount)
            .slice(0, 10);

    } catch (error) {
        console.error('Error fetching featured hacks leaderboard:', error);
        return [];
    }
}

// Create a leaderboard embed for boxes or creators
function createLeaderboardEmbed(items, type, page = 0, pageSize = 6, sortByCriterion = 'Overall') {
    // Sort items by the specified criterion
    items.sort((a, b) => {
        const ratingA = type === 'box' 
            ? (a.averageRatings[sortByCriterion] || 0) 
            : (a.ratings[sortByCriterion] || 0);
            
        const ratingB = type === 'box' 
            ? (b.averageRatings[sortByCriterion] || 0) 
            : (b.ratings[sortByCriterion] || 0);
            
        return ratingB - ratingA; // Descending order
    });

    const totalPages = Math.ceil(items.length / pageSize);
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, items.length);
    const pageItems = items.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setTitle(`${type === 'box' ? 'Box' : 'Creator'} Leaderboard - ${sortByCriterion}`)
        .setColor(0x00AE86)
        .setFooter({ text: `Page ${page + 1}/${totalPages} • ${items.length} total ${type === 'box' ? 'boxes' : 'creators'}` });

    if (pageItems.length === 0) {
        embed.setDescription(`No rated ${type === 'box' ? 'boxes' : 'creators'} found.`);
        return { embed, totalPages };
    }

    let description = '';
    
    pageItems.forEach((item, index) => {
        const position = startIndex + index + 1;

        const displayName = type === 'box' ? item.displayName : item.creatorName;

        // TODO: overall should be overall, not actual thing
        const rating = type === 'box' 
            ? item.averageRatings[sortByCriterion] 
            : item.ratings[sortByCriterion];
        const reviewCount = type === 'box' 
            ? item.reviewCount 
            : item.reviewCount;
        
        description += 
            `${position}. **${displayName}**\n` +
            `${rating.toFixed(1)} ${getEmojiRatingFromNum(rating)} (${reviewCount} review${reviewCount !== 1 ? 's' : ''})\n\n`;
    });

    embed.setDescription(description);
    
    return { embed, totalPages };
}

function createFeaturedLeaderboardEmbed(users) {
    const embed = new EmbedBuilder()
        .setTitle('Featured Hackers Leaderboard')
        .setFooter({ text: "This leaderboard requires 2 or more featured hacks." })
        .setColor("#e69149")

    if (users.length === 0) {
        embed.setDescription('No featured hacks found.');
        return embed;
    }

    let description = '';

    users
        .filter(user => user.postCount >= 2)
        .forEach((user, index) => {
            const position = index + 1;
            const medal = position === 1 ? '🥇 ' : position === 2 ? '🥈 ' : position === 3 ? '🥉 ' : '';

            description +=
                `**${position}.** ${medal}<@${user.id}>, with **${user.postCount}** featured hack${user.postCount !== 1 ? 's' : ''}.\n\n`;
        });

    description += "\n"

    embed.setDescription(description);
    return embed;
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View leaderboards for boxes or creators')
        .addSubcommand(subcommand =>
            subcommand
                .setName('boxes')
                .setDescription('View leaderboard of top rated boxes')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('The rating category to sort by')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Overall', value: 'Overall' },
                            { name: 'Hackability', value: 'Hackability' },
                            { name: 'Usability', value: 'Usability' },
                            { name: 'Building', value: 'Building' },
                            { name: 'Design', value: 'Design' },
                            { name: 'Code Cleanliness', value: 'CodeCleanliness' }
                        )
                )
        )
        // Disabling creator subcommand until there's more data to balance them out, giving them a chance to not be ruined by a disliked box.
        // .addSubcommand(subcommand =>
        //     subcommand
        //         .setName('creators')
        //         .setDescription('View leaderboard of top rated creators')
        //         .addStringOption(option =>
        //             option.setName('category')
        //                 .setDescription('The rating category to sort by')
        //                 .setRequired(false)
        //                 .addChoices(
        //                     { name: 'Overall', value: 'Overall' },
        //                     { name: 'Hackability', value: 'Hackability' },
        //                     { name: 'Usability', value: 'Usability' },
        //                     { name: 'Building', value: 'Building' },
        //                     { name: 'Design', value: 'Design' },
        //                     { name: 'Code Cleanliness', value: 'CodeCleanliness' }
        //                 )
        //         )
        // ),
        .addSubcommand(subcommand =>
            subcommand
                .setName('featured')
                .setDescription('View leaderboard of users with most featured hacks')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('issues')
                .setDescription('Display issue tracker leaderboard')
        ),

    /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();
            const category = interaction.options.getString('category') || 'Overall';
            const pageSize = 6;
            
            if (subcommand === 'boxes') {
                const boxes = await getAllBoxesWithRatings();
                
                if (!boxes || boxes.length === 0) {
                    return interaction.editReply('No rated boxes found.');
                }
                
                // Initial page
                let currentPage = 0;
                const { embed, totalPages } = createLeaderboardEmbed(boxes, 'box', currentPage, pageSize, category);
                
                // If there's only one page, just send the embed without pagination
                if (totalPages <= 1) {
                    return interaction.editReply({ embeds: [embed] });
                }
                
                // Create pagination buttons
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_page')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true), // Disabled on first page
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(totalPages <= 1) // Disabled if there's only one page
                    );
                
                const message = await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
                
                // Create collector for pagination
                const collector = message.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 300000 // 5 minutes
                });
                
                collector.on('collect', async i => {
                    if (i.customId === 'prev_page') {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (i.customId === 'next_page') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    }
                    
                    const { embed } = createLeaderboardEmbed(boxes, 'box', currentPage, pageSize, category);
                    
                    // Update the row with appropriate button states
                    row.components[0].setDisabled(currentPage === 0);
                    row.components[1].setDisabled(currentPage === totalPages - 1);
                    
                    await i.update({
                        embeds: [embed],
                        components: [row]
                    });
                });
                
                collector.on('end', async () => {
                    try {
                        // Disable all buttons when the collector ends
                        row.components.forEach(component => component.setDisabled(true));
                        await interaction.editReply({
                            embeds: [embed],
                            components: [row]
                        });
                    } catch (error) {
                        console.error('Error updating message after collector end:', error);
                    }
                });
            } 
            else if (subcommand === 'creators') {
                const creators = await getAllCreatorsWithRatings();
                
                if (!creators || creators.length === 0) {
                    return interaction.editReply('No rated creators found.');
                }
                
                // Initial page
                let currentPage = 0;
                const { embed, totalPages } = createLeaderboardEmbed(creators, 'creator', currentPage, pageSize, category);
                
                // If there's only one page, just send the embed without pagination
                if (totalPages <= 1) {
                    return interaction.editReply({ embeds: [embed] });
                }
                
                // Create pagination buttons
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_page')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true), // Disabled on first page
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(totalPages <= 1) // Disabled if there's only one page
                    );
                
                const message = await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
                
                // Create collector for pagination
                const collector = message.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 300000 // 5 minutes
                });
                
                collector.on('collect', async i => {
                    if (i.customId === 'prev_page') {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (i.customId === 'next_page') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    }
                    
                    const { embed } = createLeaderboardEmbed(creators, 'creator', currentPage, pageSize, category);
                    
                    // Update the row with appropriate button states
                    row.components[0].setDisabled(currentPage === 0);
                    row.components[1].setDisabled(currentPage === totalPages - 1);
                    
                    await i.update({
                        embeds: [embed],
                        components: [row]
                    });
                });
                
                collector.on('end', async () => {
                    try {
                        // Disable all buttons when the collector ends
                        row.components.forEach(component => component.setDisabled(true));
                        await interaction.editReply({
                            embeds: [embed],
                            components: [row]
                        });
                    } catch (error) {
                        console.error('Error updating message after collector end:', error);
                    }
                });
            }
            else if (subcommand === 'featured') {
                let users = leaderboardCache.get("featuredUsers");

                if (!users) {
                    users = await getFeaturedHacksLeaderboard(interaction.client);
                    leaderboardCache.set("featuredUsers", users)
                }

                if (!users || users.length === 0) {
                    return interaction.editReply('No featured hacks found.');
                }

                const embed = createFeaturedLeaderboardEmbed(users);
                return interaction.editReply({ embeds: [embed] });
            }
            else if (subcommand === 'issues') {
                const stats = await IssueTrackerDB.aggregate([
                    { $lookup: {
                        from: 'configs',
                        let: { userID: '$userID' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $or: [
                                            { $in: ['$$userID', '$creators'] },
                                            { $in: ['$$userID', '$admins'] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: 'config'
                    } },
                    { $match: {
                        config: { $ne: [] }
                    } },
                    { $group: {
                        _id: '$issue',
                        count: { $sum: 1 },
                        lastSeen: { $max: '$timestamp' }
                    } },
                    { $sort: { count: -1 } },
                    { $limit: 15 }
                ]);

                if (stats.length === 0) {
                    await interaction.followUp({
                        content: 'No issue data available from trusted users.',
                        ephemeral: true
                    });
                    return;
                }

                const leaderboardText = stats.map((stat, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    const lastSeenDate = new Date(stat.lastSeen).toLocaleDateString();
                    return `${medal} **${stat._id}** - ${stat.count} time${stat.count > 1 ? 's' : ''} (${lastSeenDate})`;
                }).join('\n');

                await interaction.followUp({
                    content: `**🏆 Most Common Issues Leaderboard**\n\n${leaderboardText}`,
                    ephemeral: false
                });
            }

        } catch (error) {
            console.error('Error executing leaderboard command:', error);
            return interaction.editReply('There was an error executing the leaderboard command.');
        }
    }
};