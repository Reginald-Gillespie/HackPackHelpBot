const {VotingDB, ConfigDB} = require('../modules/database')
const {SlashCommandBuilder} = require('discord.js')

module.exports = {
    data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote main command')
    .addSubcommand(subcommand =>
        subcommand
        .setName('add')
        .setDescription('vote for a HOH candent')
        .addStringOption(string =>
            string
            .setName('candent')
            .setDescription('choose a candent to vote for')
            .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
        .setName('delete')
        .setDescription('delete a vote from the database (creator and nathan only)')
        .addUserOption(user =>
            user
            .setName('user')
            .setDescription('Specify a users vote to delete')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
        subcommand
        .setName('list')
        .setDescription('list the users who have voted (creator and nathan only)')
    ),

/** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        const config = await ConfigDB.findOne({});
        const isTrusted = config.creators?.includes(interaction.user.id) || config.admins?.includes(interaction.user.id);
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'add') {
            const user = interaction.user.id;
            const exists = await VotingDB.findOne({ userID: user});
            const candent = interaction.options.getString('candent');

            if (exists) {
                interaction.reply({
                    content: 'You have already voted and can not vote again',
                    ephemeral: true
                })
                return;
            }
            const entry = new VotingDB({
                userID: interaction.user.id,
                vote: candent
            });
            await entry.save();

            interaction.reply({
                content: `You have voted for ${candent}. If you made a mistake contact heavyfalcon or nathan immediately`,
                ephemeral: true
            });

            

        } else if (subcommand === 'delete') {
            if (!isTrusted && interaction.user.id != '1333939256003002409') {
                interaction.reply({
                    content: 'You are not authorized to run this command',
                    ephemeral: true
                });
                return;
            }
                const user = interaction.options.getUser('user');
                const exists = await VotingDB.findOneAndDelete({ userID: user.id})
                if (!exists) {
                    interaction.reply({
                        content: 'This user has not voted yet and cant be deleted',
                        ephemeral: true
                    })
                    return;
                }
                interaction.reply({
                    content: `successfully deleted <@!${user.id}>s vote`,
                    ephemeral: true
                });
                


        } else if (subcommand === 'list'){
            if (!isTrusted && interaction.user.id != '1333939256003002409') {
                interaction.reply({
                    content: 'You are not authorized to run this command',
                    ephemeral: true
                });
                return;
            }
            const allEntrys = await VotingDB.find({});
            const e = allEntrys.map(v => `<@!${v.userID}> voted at ${v.timestamp}\n `).join()
            if (allEntrys.length !== 0){
               interaction.reply({content: e, ephemeral:true}); 
            } else {
                interaction.reply({
                    content: 'There are no votes to list',
                    ephemeral:true
                })
            }
            
        }
    }}