const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { BoxData, BoxReviews } = require('../modules/database');
const { getEmojiRatingFromNum, rankingData } = require('./rate');

const CRITERIA = rankingData.map(r => r.key);
const RATING_WEIGHTS = Object.fromEntries(rankingData.map(r => [r.key, r.weight]))

// Calculate the weighted average rating of a box or creator
async function calculateAverageRatings(reviews) {
    if (!reviews || reviews.length === 0) return null;

    // Initialize counters for each criterion
    const criterionSums = {};
    const criterionCounts = {};

    CRITERIA.forEach(criterion => {
        criterionSums[criterion] = 0;
        criterionCounts[criterion] = 0;
    });

    // Sum up all ratings
    reviews.forEach(review => {
        CRITERIA.forEach(criterion => {
            if (review[criterion]) {
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
        if (criterionCounts[criterion] > 0) {
            averages[criterion] = criterionSums[criterion] / criterionCounts[criterion];
            weightedSum += averages[criterion] * RATING_WEIGHTS[criterion];
            totalWeight += RATING_WEIGHTS[criterion];
        } else {
            averages[criterion] = 0;
        }
    });

    // Calculate overall weighted average
    averages.Overall = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return averages;
}

// Get box ratings from database
async function getBoxRatings(boxName) {
    try {
        const reviews = await BoxReviews.find({ boxName }).lean();
        return calculateAverageRatings(reviews);
    } catch (error) {
        console.error('Error fetching box ratings:', error);
        return null;
    }
}

// Get creator ratings by averaging all their box ratings
async function getCreatorRatings(creator) {
    try {
        // Get all boxes by this creator
        const creatorBoxes = await BoxData.find({ creator }).lean();
        if (!creatorBoxes || creatorBoxes.length === 0) return null;

        // Get all reviews for these boxes
        const allReviews = [];
        for (const box of creatorBoxes) {
            const boxReviews = await BoxReviews.find({ boxName: box.boxName }).lean();
            allReviews.push(...boxReviews);
        }

        return {
            ratings: await calculateAverageRatings(allReviews),
            boxCount: creatorBoxes.length,
            reviewCount: allReviews.length
        };
    } catch (error) {
        console.error('Error fetching creator ratings:', error);
        return null;
    }
}

// Create an embed for box rankings
function createBoxRankingEmbed(boxName, ratings, box) {
    if (!ratings) {
        return new EmbedBuilder()
            .setTitle(`Ratings for ${boxName}`)
            .setDescription('No ratings found for this box.')
            .setColor(0x00AE86);
    }

    const embed = new EmbedBuilder()
        .setTitle(`Ratings for ${boxName}`)
        .setColor(0x00AE86);

    if (box && box.boxURL) {
        embed.setURL(box.boxURL);
    }

    if (box && box.boxDescription) {
        embed.setDescription(box.boxDescription);
    }

    let ratingsDescription = '';
    
    // Add Overall rating first
    const overallRating = ratings.Overall.toFixed(1);
    ratingsDescription += `## Overall:\n${overallRating} ${getEmojiRatingFromNum(ratings.Overall)}\n\n`;
    
    // Add each criterion
    CRITERIA.forEach(criterion => {
        const rating = ratings[criterion]?.toFixed(1) || '0.0';
        ratingsDescription += `**${criterion}**:\n${rating} ${getEmojiRatingFromNum(ratings[criterion])}\n\n`;
    });

    embed.setDescription((box && box.boxDescription ? box.boxDescription + '\n\n' : '') + ratingsDescription);
    
    if (box && box.creator) {
        embed.setFooter({ text: `Created by ${box.creator}` });
    }

    return embed;
}

// Create an embed for creator rankings
function createCreatorRankingEmbed(creatorName, creatorData) {
    if (!creatorData || !creatorData.ratings) {
        return new EmbedBuilder()
            .setTitle(`Ratings for ${creatorName}`)
            .setDescription('No ratings found for this creator.')
            .setColor(0x00AE86);
    }

    const ratings = creatorData.ratings;
    
    const embed = new EmbedBuilder()
        .setTitle(`Ratings for ${creatorName}`)
        .setColor(0x00AE86);

    let ratingsDescription = `Creator of ${creatorData.boxCount} boxes with ${creatorData.reviewCount} total reviews\n\n`;
    
    // Add Overall rating first
    const overallRating = ratings.Overall.toFixed(1);
    ratingsDescription += `## Overall:\n${overallRating} ${getEmojiRatingFromNum(ratings.Overall)}\n\n`;
    
    // Add each criterion
    CRITERIA.forEach(criterion => {
        const rating = ratings[criterion]?.toFixed(1) || '0.0';
        ratingsDescription += `**${criterion}**:\n${rating} ${getEmojiRatingFromNum(ratings[criterion])}\n\n`;
    });

    embed.setDescription(ratingsDescription);
    
    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rankings')
        .setDescription('View rankings for boxes or creators')
        .addSubcommand(subcommand =>
            subcommand
                .setName('box')
                .setDescription('View ratings for a specific box')
                .addStringOption(option =>
                    option.setName('box_name')
                        .setDescription('The name of the box')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('creator')
                .setDescription('View ratings for a specific creator')
                .addStringOption(option =>
                    option.setName('creator_name')
                        .setDescription('The name of the creator')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'box') {
                const boxName = interaction.options.getString('box_name');
                const box = await BoxData.findOne({ boxName }).lean();
                
                if (!box) {
                    return interaction.editReply(`Box "${boxName}" not found.`);
                }
                
                const ratings = await getBoxRatings(boxName);
                const embed = createBoxRankingEmbed(boxName, ratings, box);
                
                return interaction.editReply({ embeds: [embed] });
            } 
            else if (subcommand === 'creator') {
                let creatorName = interaction.options.getString('creator_name');
                const box = await BoxData.findOne({ creator: creatorName }).lean();
                
                if (!box) {
                    return interaction.editReply(`Creator "${creatorName}" not found.`);
                }
                
                const creatorData = await getCreatorRatings(box.creator);
                const embed = createCreatorRankingEmbed(creatorName, creatorData);
                
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error executing rankings command:', error);
            return interaction.editReply('There was an error executing the rankings command.');
        }
    }
};
