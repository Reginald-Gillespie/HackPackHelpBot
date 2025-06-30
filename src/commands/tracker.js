const { SlashCommandBuilder } = require('discord.js');
const utils = require('../modules/utils');
const { ConfigDB, IssueTrackerDB } = require('../modules/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Track common issues and display statistics')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add an issue to the tracker')
                .addStringOption(option =>
                    option.setName('issue')
                        .setDescription('The issue that occurred')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View issue statistics')
                .addStringOption(option =>
                    option.setName('issue')
                        .setDescription('The issue that occurred')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rename')
                .setDescription('Rename/merge issues (Admin only)')
                .addStringOption(option =>
                    option.setName('from')
                        .setDescription('Current issue name')
                        .setAutocomplete(true)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('to')
                        .setDescription('New issue name')
                        .setRequired(true))),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        
        if (focusedOption.name === 'issue' || focusedOption.name === 'from') {
            const allIssues = await IssueTrackerDB.distinct('issue');
            const sortedIssues = utils.sortByMatch(allIssues, focusedOption.value);
            
            const choices = sortedIssues.slice(0, 25).map(issue => ({
                name: issue.length > 100 ? issue.substring(0, 97) + '...' : issue,
                value: issue
            }));
            
            await interaction.respond(choices);
        }
    },
    
    /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const config = await ConfigDB.findOne({});
        const userID = interaction.user.id;
        const isTrusted = config.creators?.includes(userID) || config.admins?.includes(userID);
        const isAdmin = config.admins?.includes(userID);

        if (subcommand === 'add') {
            const issue = interaction.options.getString('issue');
            
            // Save to database
            const newEntry = new IssueTrackerDB({
                issue: issue,
                userID: userID,
                timestamp: new Date()
            });
            await newEntry.save();

            if (isTrusted) {
                await interaction.reply({
                    content: `-# Issue recorded: ${issue}`,
                    ephemeral: false
                });
            } else {
                await interaction.reply({
                    content: `Issue added to tracker, but won't affect statistics until you are authorized as a creator.`,
                    ephemeral: true
                });
            }
        }

        else if (subcommand === 'stats') {
            const selectedIssue = interaction.options.getString('issue');

            // Get stats for the specific issue from trusted users only
            const stats = await IssueTrackerDB.aggregate([
                { $match: { issue: selectedIssue } },
                {
                    $lookup: {
                        from: "configs",
                        let: {
                            userID: "$userID"
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $or: [
                                            {
                                                $in: ["$$userID", "$creators"]
                                            },
                                            {
                                                $in: ["$$userID", "$admins"]
                                            }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "config"
                    }
                }, {
                    $match: {
                        config: { $ne: [] }
                    }
                },
                {
                    $group: {
                        _id: '$issue',
                        count: { $sum: 1 },
                    firstSeen: { $min: '$timestamp' },
                    lastSeen: { $max: '$timestamp' },
                    contributors: { $addToSet: '$userID' }
                } }
            ]);

            if (stats.length === 0) {
                await interaction.reply({
                    content: `No statistics available for issue: "${selectedIssue}" from trusted users.`,
                    ephemeral: true
                });
                return;
            }

            const stat = stats[0];
            const firstSeenDate = new Date(stat.firstSeen).toLocaleDateString();
            const lastSeenDate = new Date(stat.lastSeen).toLocaleDateString();

            await interaction.reply({
                content: `**Statistics for: ${selectedIssue}**\n\n` +
                    `📊 **Total Occurrences:** ${stat.count}\n` +
                    `📅 **First Seen:** ${firstSeenDate}\n` +
                    `🕒 **Last Seen:** ${lastSeenDate}`,
                ephemeral: false
            });
        }


        else if (subcommand === 'rename') {
            if (!isAdmin) {
                await interaction.reply({
                    content: 'Only admins can rename issues.',
                    ephemeral: true
                });
                return;
            }

            const fromIssue = interaction.options.getString('from');
            const toIssue = interaction.options.getString('to');

            const result = await IssueTrackerDB.updateMany(
                { issue: fromIssue },
                { $set: { issue: toIssue } }
            );

            if (result.modifiedCount === 0) {
                await interaction.reply({
                    content: `No entries found for issue: "${fromIssue}"`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `Successfully renamed ${result.modifiedCount} entries from "${fromIssue}" to "${toIssue}"`,
                    ephemeral: false
                });
            }
        }
    }
};
