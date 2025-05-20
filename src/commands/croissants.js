// commands/croissants.js
const { SlashCommandBuilder } = require('discord.js');
const { Factions } = require('../modules/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('croissants')
        .setDescription('Croissants main command')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show faction stats')
        ),
    
    /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'stats') {
            const guild = interaction.guild;
            const factions = await Factions.find();

            if (!factions.length) {
                return interaction.reply({ content: 'No factions found in the database.', ephemeral: true });
            }

            // Update stats for all roles... might be a better way but best I know
            await guild.members.fetch();
            await guild.roles.fetch();

            const stats = await Promise.all(
                factions.map(async (faction) => {
                    const role = await guild.roles.fetch(faction.roleId);
                    // const role = guild.roles.cache.get(faction.roleId);
                    if (!role) return `${faction.emoji} **${faction.name}**: Role not found`;
                    return `${faction.emoji} **${faction.name}**: ${role.members.size} members`;
                })
            );

            await interaction.reply({
                content: `**Faction Stats:**\n${stats.join('\n')}`,
                ephemeral: false
            });
        }
    }
};
