// commands/croissants.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Factions } = require('../modules/database');
const { StarboardMessage } = require('../modules/database');

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

            await guild.members.fetch();
            await guild.roles.fetch();

            // Map emoji to faction info
            const factionMap = new Map(); // emoji => { name, roleId }
            const factionStats = new Map(); // emoji => { name, emoji, memberCount, starCount }

            for (const faction of factions) {
                const role = await guild.roles.fetch(faction.roleId);
                if (!role) continue;

                factionMap.set(faction.emoji, { name: faction.name.trim(), roleId: faction.roleId });
                factionStats.set(faction.emoji, {
                    name: faction.name.trim(),
                    emoji: faction.emoji,
                    memberCount: role.members.size,
                    starCount: 0
                });
            }

            // Fetch all starboard messages and count stars per faction emoji
            const starMsgs = await StarboardMessage.find();

            for (const msg of starMsgs) {
                const emoji = msg.emoji;
                if (factionStats.has(emoji)) {
                    factionStats.get(emoji).starCount++;
                }
            }

            // Build embed
            const embed = new EmbedBuilder()
                .setTitle('🥐 Faction Stats')
                .setColor('#D2B48C');

            for (const { name, emoji, memberCount, starCount } of factionStats.values()) {
                embed.addFields({
                    name: `${emoji} ${name}`,
                    value: `${memberCount} member${memberCount === 1 ? '' : 's'}\n:pushpin: ${starCount} starboard${starCount === 1 ? '' : 's'}`,
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
