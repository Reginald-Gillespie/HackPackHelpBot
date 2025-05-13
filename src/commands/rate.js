const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    TextInputBuilder,
    ModalBuilder,
    TextInputStyle
} = require('discord.js');
const { BoxData, BoxReviews } = require('../modules/database'); // Assuming these are Mongoose models

// Data about the fields to rank
const rankingData = [
    // {
    //     display: "",     // The name to display about the category
    //     description: "", // Describe what the category means
    //     key: "",         // The key in mongo this is saved under
    //     weight: 1        // The weight given to this field on the leaderboard
    // }
    {
        display: "Overall",
        key: "Overall",
        description: "How would you rate this box overall?",
        weight: 1
    }, {
        display: "Hackability",
        key: "Hackability",
        description: "How would you rate the ability to add on to this bot and modify it?",
        weight: 1
    }, {
        display: "Usability",
        key: "Usability",
        description: "How would you rate the usefulness of this bot?",
        weight: 1
    }, {
        display: "Building",
        key: "Building",
        description: "How easy was it to build this box? Where there too many hard points?",
        weight: 1
    }, {
        display: "Design",
        key: "Design",
        description: "How would you rate the design of this box?",
        weight: 1
    }, {
        display: "Code Cleanliness",
        key: "CodeCleanliness",
        description: "How clean was the code? How easy was it to understand?",
        weight: 1
    }
]

function getEmojiRatingFromNum(rating) {
    // Provided a number 0-5, represent it with 5 emoji slots that most closely represent it
    const stars = [
        [ 0.0, "<:star0_4th:1371856725464060073>" ],
        [ 0.25, "<:star1_4th:1371856712671428730>" ],
        [ 0.5, "<:star2_4th:1371856698721042555>" ],
        [ 0.75, "<:star3_4th:1371856690525245632>" ],
        // [ 1.0, "<:star4_4th:1371856733969973310>" ],
        [ 1.0, ":star:" ] // Needs to use the discord one to fit char lengths
    ]

    let ratingStr = [ ];

    for (var i = 0; i < 5; i++) {
        let ratingSection = Math.min(Math.max(rating - i, 0), 1);
        let closest = stars.reduce((prev, curr) =>
            Math.abs(curr[0] - ratingSection) < Math.abs(prev[0] - ratingSection) ? curr : prev
        )
        ratingStr.push(closest[1]);
    }

    return ratingStr.join('');
}

module.exports = {
    rankingData,
    getEmojiRatingFromNum,

    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Rate a CrunchLabs box based on various criteria'),

    async execute(cmd) {

        // return cmd.reply(getEmojiRatingFromNum(4.4));

        await cmd.deferReply({ ephemeral: true });

        try {
            const boxes = await BoxData.find().lean();

            if (!boxes || boxes.length === 0) {
                return cmd.editReply("No boxes found in the database to rate.");
            }

            // Create box select menu options
            const boxOptions = boxes.map((box) => {
                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(box.boxName.substring(0, 100)) // Max 100 chars for label
                    .setValue(box.boxName.substring(0, 100)); // Max 100 chars for value

                if (box.boxEmoji) {
                    try {
                        option.setEmoji(box.boxEmoji);
                    } catch (e) {
                        console.warn(`Invalid emoji for box ${box.boxName}: ${box.boxEmoji}`);
                    }
                }
                return option;
            }).slice(0, 25); // Max 25 options for select menu

            if (boxOptions.length === 0) {
                 return cmd.editReply("No valid boxes could be prepared for rating.");
            }

            const boxSelect = new StringSelectMenuBuilder()
                .setCustomId('select_box_initial')
                .setPlaceholder('Select a box to rate')
                .addOptions(boxOptions);

            const initialEmbed = new EmbedBuilder()
                .setTitle('Hack Pack Rating')
                .setDescription('Please select a box to begin the rating process.')
                .setColor(0x00AE86);

            const initialMessage = await cmd.editReply({
                embeds: [initialEmbed],
                components: [new ActionRowBuilder().addComponents(boxSelect)],
                ephemeral: true,
            });

            const criteria = rankingData.map(r => r.key);
            const totalCriteria = rankingData.length;

            // User-specific state for this interaction instance
            const userRatingsState = {
                userId: cmd.user.id,
                boxName: null,
                ratings: {}, // Stores { key: ratingValueString }
                currentCriterionIndex: 0,
            };

            // Helper function for displaying a criterion question
            async function displayCriterionQuestion(cmpInteraction, state, hasExistingRatingInfo = false) {
                const criterionIndex = state.currentCriterionIndex;
                const { key, display, description } = rankingData[criterionIndex];
                const selectedBox = boxes.find(box => box.boxName === state.boxName);

                if (!selectedBox) {
                    await cmpInteraction.update({ content: 'Error: Selected box not found. Please try again.', embeds: [], components: [] });
                    throw new Error("Selected box not found during displayCriterionQuestion");
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Currently rating: ${selectedBox.boxName}`)
                    .setColor(0x00AE86)
                    .setURL(selectedBox.boxURL || null)
                    .setFooter({ text: `Question ${criterionIndex + 1} of ${totalCriteria}` });

                let ratingsSoFarString = "";
                for (const { key: critKey, display: critLabel } of rankingData) {
                    if (state.ratings[critKey]) {
                        ratingsSoFarString += `**${critLabel}**: ${getEmojiRatingFromNum(state.ratings[critKey])}\n`;
                    }
                }

                if (ratingsSoFarString) {
                    embed.setDescription(
                        'Your Ratings So Far:\n' +
                        ratingsSoFarString.trim() + "\n\n" +
                        `## Category: **${display}**\n${description}`
                    );
                } else {
                    embed.setDescription(`## Category: **${display}**\n${description}`);
                }

                const ratingEmojis = [ "🙁", "😐", "🙂", "😀", "😁" ];
                const ratingOptions = Array.from({ length: 5 }, (_, idx) => {
                    const ratingValue = idx + 1;
                    const stars = '⭐'.repeat(ratingValue);
                    const emoji = ratingEmojis[idx];
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${stars} (${ratingValue})`)
                        .setValue(String(ratingValue))
                        .setEmoji(emoji);
                });

                const ratingMenu = new StringSelectMenuBuilder()
                    .setCustomId(`rate_criterion_${key}`)
                    .setPlaceholder(`Rate ${display}` + (state.ratings[key] ? ` (Current: ${state.ratings[key]} ⭐)` : ''))
                    .addOptions(ratingOptions);

                const components = [new ActionRowBuilder().addComponents(ratingMenu)];
                const actionRowButtons = new ActionRowBuilder();

                if (criterionIndex > 0) {
                    actionRowButtons.addComponents(
                        new ButtonBuilder()
                            .setCustomId('previous_criterion')
                            .setLabel('Back')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                actionRowButtons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('cancel_rating')
                        .setLabel('Cancel Rating')
                        .setStyle(ButtonStyle.Danger)
                );
                if (actionRowButtons.components.length > 0) components.push(actionRowButtons);

                await cmpInteraction.update({
                    embeds: [embed],
                    components: components,
                });
            }

            // Helper function for displaying the submit screen
            async function displaySubmitScreen(cmpInteraction, state) {
                const selectedBox = boxes.find(box => box.boxName === state.boxName);
                if (!selectedBox) {
                    await cmpInteraction.update({ content: 'Error: Selected box not found. Please try again.', embeds: [], components: [] });
                    throw new Error("Selected box not found during displaySubmitScreen");
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Review & Submit: ${selectedBox.boxName}`)
                    // .setDescription(`Please review your ratings before submitting.`)
                    .setColor(0x00AE86)
                    .setURL(selectedBox.boxURL || null);

                const ratingsSummaryFields = criteria.map(criterion => ({
                    name: criterion,
                    value: state.ratings[criterion] ? `${state.ratings[criterion]} ${getEmojiRatingFromNum(state.ratings[criterion])}` : 'Not Rated',
                    inline: true
                }));
                embed.addFields(ratingsSummaryFields);

                // add summary of feedback if already provided
                if (state.textReview) {
                    embed.addFields({
                        name: "Feedback",
                        value: state.textReview.length > 1024
                            ? state.textReview.slice(0, 1021) + "…"
                            : state.textReview
                    });
                }

                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('add_feedback')
                            .setLabel('Add Feedback')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji("✍️"),
                        new ButtonBuilder()
                            .setCustomId('submit_all_ratings')
                            .setLabel('Submit Ratings')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('cancel_rating')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Danger)
                    );

                await cmpInteraction.update({
                    embeds: [embed],
                    components: [actionRow],
                });
            }

            const collector = initialMessage.createMessageComponentCollector({
                filter: i => i.user.id === cmd.user.id,
                time: 300000, // 5 minutes
            });

            collector.on('collect', async (i) => {
                try {
                    if (i.customId === 'add_feedback') {
                        if (!i.isButton()) return;
                        // Build and show the modal
                        const feedbackModal = new ModalBuilder()
                            .setCustomId('feedback_modal')
                            .setTitle('Freeform Feedback')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('textReviewInput')
                                        .setLabel('Your review')
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setPlaceholder('What could this box have improved?')
                                        .setRequired(true)
                                        .setMaxLength(2000)
                                )
                            );
                        await i.showModal(feedbackModal);

                        // Add a modal listener 
                        cmd.client.on('interactionCreate', async interaction => {
                            if (!interaction.isModalSubmit()) return;
                            if (interaction.customId !== 'feedback_modal') return;
                            if (interaction.user.id !== cmd.user.id) {
                                return interaction.reply({ content: "This modal isn't for you!", ephemeral: true });
                            }

                            // grab the long review
                            const textReview = interaction.fields.getTextInputValue('textReviewInput');
                            userRatingsState.textReview = textReview;

                            // re-render the submit screen with feedback shown
                            await displaySubmitScreen(interaction, userRatingsState);
                        });


                        return;
                    } else if (i.customId === 'select_box_initial') {
                        if (!i.isStringSelectMenu()) return;
                        userRatingsState.boxName = i.values[0];
                        userRatingsState.ratings = {};
                        userRatingsState.currentCriterionIndex = 0;

                        const existingRating = await BoxReviews.findOne({
                            boxName: userRatingsState.boxName,
                            reviewer: cmd.user.id
                        }).lean();

                        let hasExisting = false;
                        if (existingRating) {
                            hasExisting = true;
                            criteria.forEach(criterion => {
                                if (existingRating[criterion] !== undefined) {
                                    userRatingsState.ratings[criterion] = existingRating[criterion];
                                }
                            });
                        }
                        await displayCriterionQuestion(i, userRatingsState, hasExisting);

                    } else if (i.customId.startsWith('rate_criterion_')) {
                        if (!i.isStringSelectMenu()) return;
                        const { key, display } = rankingData[userRatingsState.currentCriterionIndex];
                        const expectedCustomId = `rate_criterion_${key}`;

                        if (i.customId !== expectedCustomId) {
                            await i.reply({ content: "There was an issue with your selection. Please try again or cancel.", ephemeral: true });
                            return;
                        }

                        userRatingsState.ratings[key] = i.values[0];
                        userRatingsState.currentCriterionIndex++;

                        if (userRatingsState.currentCriterionIndex < totalCriteria) {
                            await displayCriterionQuestion(i, userRatingsState);
                        } else {
                            await displaySubmitScreen(i, userRatingsState);
                        }
                    } else if (i.customId === 'previous_criterion') {
                        if (!i.isButton()) return;
                        if (userRatingsState.currentCriterionIndex > 0) {
                            userRatingsState.currentCriterionIndex--;
                            await displayCriterionQuestion(i, userRatingsState);
                        } else {
                            await i.reply({ content: "Cannot go back further.", ephemeral: true });
                        }
                    } else if (i.customId === 'submit_all_ratings') {
                        if (!i.isButton()) return;
                        const allRated = rankingData.every(c => userRatingsState.ratings[c.key] !== undefined);
                        if (!allRated) {
                            for (let k = 0; k < totalCriteria; k++) {
                                if (!userRatingsState.ratings[rankingData[k].key]) {
                                    userRatingsState.currentCriterionIndex = k;
                                    await i.deferUpdate();
                                    await displayCriterionQuestion(i, userRatingsState);
                                    await i.followUp({ content: `Please complete all ratings. You missed: **${rankingData[k].display}**.`, ephemeral: true });
                                    return;
                                }
                            }
                        }

                        const ratingsToSave = {};
                        rankingData.forEach(({ key }) => {
                            if (userRatingsState.ratings[key]) {
                                ratingsToSave[key] = parseInt(userRatingsState.ratings[key], 10);
                            }
                        });

                        if (userRatingsState.textReview) {
                            ratingsToSave.textReview = userRatingsState.textReview;
                        }

                        await BoxReviews.findOneAndUpdate(
                            { boxName: userRatingsState.boxName, reviewer: cmd.user.id },
                            { $set: { ...ratingsToSave, reviewerDiscordTag: cmd.user.tag } },
                            { upsert: true, new: true }
                        );

                        const finalEmbed = new EmbedBuilder()
                            .setTitle('Rating Submitted Successfully!')
                            .setDescription(`Your ratings for **${userRatingsState.boxName}** have been saved.`)
                            .setColor(0x00FF00)
                            // .setTimestamp();
                        
                        let summary = "";
                        for (const { key, display } of rankingData) {
                            if (ratingsToSave[key]) {
                                summary += `**${display}**: ${getEmojiRatingFromNum(ratingsToSave[key])}\n`;
                            }
                        }

                        await i.update({ embeds: [finalEmbed], components: [] });
                        collector.stop('submitted');

                    } else if (i.customId === 'cancel_rating') {
                        if (!i.isButton()) return;
                        await i.update({
                            content: 'Rating process has been cancelled. No ratings were saved.',
                            embeds: [],
                            components: []
                        });
                        collector.stop('cancelled');
                    }
                } catch (error) {
                    console.error('Error during collector "collect" event:', error);
                    collector.stop('error');
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.reply({ content: 'An error occurred while processing your action. Please try again.', ephemeral: true });
                        } else {
                            await i.followUp({ content: 'An error occurred while processing your action. Please try again.', ephemeral: true });
                        }
                    } catch (e) {
                        console.error("Failed to send error reply in collector:", e);
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('Rating Session Expired')
                        .setDescription('The rating session has expired due to inactivity. Your partial ratings (if any) were not saved.')
                        .setColor(0xFF0000);
                    try {
                        await cmd.editReply({ embeds: [timeoutEmbed], components: [] });
                    } catch (e) {
                        console.warn("Failed to edit message on collector timeout:", e.message);
                    }
                } else if (reason === 'error') {
                     try {
                        await cmd.editReply({ content: 'The rating session ended due to an internal error. Please try again.', embeds:[], components: [] });
                    } catch (e) {
                        console.warn("Failed to edit message on collector error end:", e.message);
                    }
                }
            });

        } catch (error) {
            console.error('Error in rate command execute:', error);
            if (cmd.deferred || cmd.replied) {
                await cmd.editReply('There was an error initiating the rating process. Please try again later.');
            } else {
                // This case should ideally not be reached if deferReply is always called first
                await cmd.reply({content: 'There was an error initiating the rating process. Please try again later.', ephemeral: true});
            }
        }
    }
};