// commands/croissants.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

            await guild.members.fetch();
            await guild.roles.fetch();

            const stats = (await Promise.all(
                factions.map(async (faction) => {
                    const role = await guild.roles.fetch(faction.roleId);
                    if (!role) return null;
                    return [faction.emoji, faction.name.trim(), role.members.size];
                })
            )).filter(Boolean);

            const embed = new EmbedBuilder()
                .setTitle('🥐 Faction Stats')
                .setColor('#D2B48C') // Light brown

            for (const stat of stats) {
                const [emoji, name, size] = stat;
                embed.addFields({
                    name: `${emoji} ${name}`,
                    value: `${size} member${size==1?"":"s"}`,
                    inline: true
                });
            }

            await interaction.reply({
                embeds: [embed],
                ephemeral: false
            });
        }
    }
};
