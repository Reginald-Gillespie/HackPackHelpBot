const { SlashCommandBuilder } = require('discord.js');
const utils = require('../modules/utils');
const { ConfigDB, IssueTrackerDB, fixerDB} = require('../modules/database');

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
                        .setRequired(true)))
        .addSubcommandGroup(subcommandgroup =>
            subcommandgroup
                .setName('fixer')
                .setDescription('Info about mistakes fixer made during a live builds')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add a mistake fixer made during a live builds')
                        .addStringOption(string =>
                            string
                            .setName('box')
                            .setDescription('Name of the box that fixer messed up on')
                            .setRequired(true))
                        .addStringOption(string =>
                            string
                            .setName('mistake')
                            .setDescription('Name of the mistake that fixer made')
                            .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                    .setName('delete')
                    .setDescription('Delete a mistake from the database (Admin only)')
                    .addStringOption(string =>
                        string
                        .setName('box')
                        .setDescription('box of the mistake that needs to be deleted')
                        .setRequired(true))
                    .addStringOption(string =>
                        string
                        .setName('mistake')
                        .setDescription('name of the mistake that needs to be deleted')
                        .setRequired(true))
                    .addStringOption(string =>
                        string
                        .setName('amount')
                        .setDescription('amount of the mistake to delete (leave blank for all)')
                        .setRequired(false)))
                .addSubcommand(subcommand =>
                    subcommand
                    .setName('stats')
                    .setDescription('All mistakes fixer has made on a box')
                    .addStringOption(string =>
                        string
                        .setName('box')
                        .setDescription('Name of the box you want to see stats of')
                        .setRequired(true)
                    )
                )
            ),

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
        const subcommandgroup = interaction.options.getSubcommandGroup();
        const config = await ConfigDB.findOne({});
        const userID = interaction.user.id;
        const isTrusted = config.creators?.includes(userID) || config.admins?.includes(userID);
        const isAdmin = config.admins?.includes(userID);
        const boxes = [
        "turret",
        "domino",
        "label",
        "sandy",
        "laser",
        "balance",
        "dealr",
        "plant"
    ];

        if (subcommand === 'add' && subcommandgroup !== 'fixer') {
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

        else if (subcommand === 'stats' && subcommandgroup !== 'fixer') {
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
        } else if (subcommandgroup === 'fixer') {

            if (subcommand === 'add') {

    if (!isTrusted) {
        await interaction.reply({
            content: 'Only trusted users can add mistakes. Try asking a trusted user to add the mistake!',
            ephemeral: true
        });
        return;
    }
    
    const boxText = interaction.options.getString('box');
    const mistakeText = interaction.options.getString('mistake');

    if (!boxes.includes(boxText)) {
        interaction.reply({
            content: `\`${boxText}\` is not a valid box. Please spesify one of these valid boxes: \`turret, domino, label, sandy, laser, balance, dealr, or plant\``,
            ephemeral: true
        })
        return;
    }

        await interaction.deferReply({ ephemeral:true })

    const existing = await fixerDB.findOne({
        mistake: mistakeText,
        box: boxText
    });

    if (!existing) {

        const newEntry = new fixerDB({
            mistake: mistakeText,
            box: boxText,
            count: 1
        });
        await newEntry.save();
        
        await interaction.editReply({ 
            content: `Added \`${mistakeText}\` to box \`${boxText}\`.  <@187446096258269185> made a mistake!`
        });

    } else {
        existing.count += 1;
        await existing.save();

                await interaction.editReply({
                    content: `incremented count from \`${mistakeText}\` on box \`${boxText}\`. Total: \`${existing.count}\`.  <@187446096258269185> made a mistake!`
                });
    }
            } else if (subcommand === 'delete') {
                if (!isAdmin) {
                    interaction.reply({
                        content:'This command is for admins only',
                        ephemeral:true
                    })
                    return;
                }

                const boxText = interaction.options.getString('box');
                const mistakeText = interaction.options.getString('mistake');
                const amount = interaction.options.getString('amount');

                await interaction.deferReply({ ephemeral:true });

                const existing = await fixerDB.findOne({
                    mistake: mistakeText,
                    box: boxText
                })
                if (!existing) {
                    interaction.editReply({
                        content: `Could not find \`${mistakeText}\` for box \`${boxText}\` make sure you are using one of the following box names; \`turret, domino, label, sandy, laser, balance, dealr, or plant.\``,
                        ephemeral:true
                    })
                    return;
                }
                if (amount == null){
                await fixerDB.deleteOne(existing);
                interaction.editReply({
                    content: `sucsessfully deleted \`${mistakeText}\` for box \`${boxText}\``,
                    ephemeral: true
                })
                } else if (Number(existing.count) <= amount) {
                    await fixerDB.deleteOne(existing);
                    interaction.editReply({
                    content: `sucsessfully deleted \`${mistakeText}\` for box \`${boxText}\``,
                    ephemeral: true
                    })

                    
                } else {
                    let DBcount = Number(amount);

                    existing.count = existing.count - DBcount;
                    existing.save();
                    interaction.editReply({
                        content: `Deleted \`${amount}\` of \`${mistakeText}\` for box \`${boxText}\``,
                        ephemeral:true
                    })
                    return;
                }
                
            } else if (subcommand === 'stats') {
                const boxText = interaction.options.getString('box')
                
                if (boxes.includes(boxText)) {

                    await interaction.deferReply();

                    const mistakes = await fixerDB.find({
                        box: boxText
                    }).sort({count: -1});

                    let message = `All mistakes fixer made for box \`${boxText}\` \n`

                    mistakes.forEach((mistake, index) => {
                        if (mistake.count == 1) {
                            message += `${index + 1}.   \`${mistake.mistake}\` happened 1 time \n`
                        } else {
                             message += `${index + 1}.   \`${mistake.mistake}\` happened ${mistake.count} times \n`
                        }
                        
                });
                    
                    interaction.editReply({
                        content: message,
                        ephemeral:false
                    });
                    
                } else {
                    interaction.reply({
                        content: `\`${boxText}\` is not a valid box. Please spesify one of these valid boxes: \`turret, domino, label, sandy, laser, balance, dealr, or plant\``,
                        ephemeral: true
                    })
                    return;
                }
            }
        } 
    }
}
