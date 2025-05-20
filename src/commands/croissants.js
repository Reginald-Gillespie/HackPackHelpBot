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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('members')
                .setDescription('List members of a specific faction')
                .addStringOption(option =>
                    option
                        .setName('faction')
                        .setDescription('Faction name')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        ),

    /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        const guild = interaction.guild;

        if (subcommand === 'stats') {
            const factions = await Factions.find();

            if (!factions.length) {
                return interaction.reply({ content: 'No factions found in the database.', ephemeral: true });
            }

            // Load cache for acurate member counts
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
                    value: `${size} member${size == 1 ? "" : "s"}`,
                    inline: true
                });
            }

            await interaction.reply({
                embeds: [embed],
                ephemeral: false
            });
        }

        if (subcommand === 'members') {
            const factionName = interaction.options.getString('faction').trim();
            const faction = await Factions.findOne({ name: factionName });

            if (!faction) {
                return interaction.reply({ content: `Faction not found.`, ephemeral: true });
            }

            const role = await guild.roles.fetch(faction.roleId);
            if (!role) {
                return interaction.reply({ content: `Role for faction not found.`, ephemeral: true });
            }

            await guild.members.fetch(); // Ensure member cache is populated

            const memberList = role.members.map(member => `<@${member.id}>`).sort();
            const chunks = [];

            for (let i = 0; i < memberList.length; i += 30) {
                chunks.push(memberList.slice(i, i + 30).join('\n'));
            }

            const embed = new EmbedBuilder()
                .setTitle(`${faction.emoji} Members of ${faction.name}`)
                .setColor('#D2B48C')
                .setDescription(memberList.length ? chunks[0] : 'No members in this faction.');

            await interaction.reply({
                embeds: [embed],
                ephemeral: false,
                allowedMentions: []
            });
        }
    }
};
