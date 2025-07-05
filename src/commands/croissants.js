// commands/croissants.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Factions, StarboardMessage, CroissantEmojiDB, CroissantMessagesDB, ConfigDB } = require('../modules/database');
const { string, cube, count } = require('mathjs');
const messageCreate = require('../events/messageCreate');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('croissants')
        .setDescription('Croissant main command')
        .addSubcommand(subcommand =>
            subcommand
            .setName('stats')
            .setDescription('Shows the amount of croissants you has sent')
            .addStringOption(string =>
                string
                .setName('emoji-name')
                .setDescription('What emoji do you want to look up')
                .setRequired(true)
                .setAutocomplete(true))
            .addUserOption(user =>
                user
                .setName('member')
                .setDescription('Specify a user')
                .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('faction')
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
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('add')
            .setDescription('Add an emoji to the database (creator only)')
            .addStringOption(string =>
                string
                .setName('emoji')
                .setDescription('select emoji to add')
                .setRequired(true))
            .addStringOption(string =>
                string
                .setName('name')
                .setDescription('Name of the Emoji ( Will display in users dropdown)')
                .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('delete')
            .setDescription('delete a emoji from the database')
            .addStringOption(string => 
                string
                .setName('emoji')
                .setDescription('What emoji to delete out of the database')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('delete-messages')
            .setDescription('Deletes all messages in the database from all users that include a specified emoji')
            .addStringOption(string =>
                string
                .setName('emoji')
                .setDescription("What emoji to delete all messages with ( Might not show up in dropdown)")
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('leaderboard')
            .setDescription('Who has send the most croissants')
            .addStringOption(string =>
                string
                .setName('emoji-name')
                .setDescription('What croissant to pull up the leaderboard for')
                .setRequired(false)
                .setAutocomplete(true)
            )
        ),
        

    /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        const config = await ConfigDB.findOne({});
        const isTrusted = config.creators?.includes(interaction.user.id) || config.admins?.includes(interaction.user.id);
        const subcommand = interaction.options.getSubcommand();


        const guild = interaction.guild;

        if (!guild.members) return; // Edge case that can crash it

        if (subcommand === 'stats') {
            const member = interaction.options.getUser('member');
            const emojiText = interaction.options.getString('emoji-name');
            const emojiDB = (await CroissantEmojiDB.findOne({ name: emojiText}).lean());

            if (!emojiDB) {
                interaction.reply({
                    content: 'That emoji does not exist in the database',
                    ephemeral: true
                });
                return;
            }
                const emoji = emojiDB.emoji;
                const allEmoji = await CroissantMessagesDB.find({type:emoji}).sort({count: -1}).lean();
                const ranking = allEmoji.findIndex(entry => entry.userID === (member == null ? interaction.user.id : member.id));
                const result = await CroissantMessagesDB.findOne({
                    
                     userID: member == null
                     ? interaction.user.id
                     : member.id,
                     type: `${emoji}`
                });
                const date = new Date(result.timestamp).toLocaleDateString();
                if (result) {
                    interaction.reply({content: ` ${member == null
                     ? interaction.user
                     : `<@!${member.id}>`} has sent ${result.count} ${emoji} since ${date} and is ranked #${ranking + 1 } in ${emoji}`});
                } else {
                    interaction.reply('No entry found in the database');
                }
                

            

        }else if (subcommand === 'add') {
            if (!isTrusted) {
                interaction.reply({
                    content: 'Only authorized users can add emojis',
                    ephemeral: true
                });
                return;
            }
            const emojiID = interaction.options.getString('emoji');
            const emojiText = interaction.options.getString('name');
            const exists = await CroissantEmojiDB.findOne({
                emoji: emojiID
            });
            //I could have used findOneAndUpdate but I would rather have to use delete then be able to change everything from the add command

            if (exists) {
                interaction.reply({
                    content: 'This emoji is already in the database. Please choose another',
                    ephemeral: true
                });
                return;
            }

            const newEntry = new CroissantEmojiDB({emoji: emojiID, name: emojiText});
            await newEntry.save();

            interaction.reply({ content: `Successfully saved ${emojiID} with text \`${emojiText}\` to the database!`})

        } else if (subcommand === 'delete') {
            if (!isTrusted) {
                interaction.reply({
                    content: 'You are not authorized to run this command',
                    ephemeral: true
                })
                return;
            }
            const emojiName = interaction.options.getString('emoji');

            const entry = await CroissantEmojiDB.findOneAndDelete(
                {emoji: emojiName},
                {upsert: true, new: true}
            )
            if (!entry) {
                interaction.reply({
                    content: 'That emoji does not exist',
                    ephemeral: true
                });
                return;
            }
            interaction.reply(`Successfully deleted \`${emojiName}\` from the database`)
        } else if (subcommand === 'delete-messages') {
            const emoji = interaction.options.getString('emoji');
            await interaction.deferReply();
            const result = await CroissantMessagesDB.deleteMany({ type: emoji });

            if (result.deletedCount === 0) {
                interaction.editReply({
                    content: 'Invalid emoji or no messages found',
                    ephemeral: true
                });
                return;
            }
            

            interaction.editReply({
                content: `Successfully deleted ${result.deletedCount} message(s) for emoji: ${emoji}`,
                ephemeral: true
            });

            
        } else if (subcommand === 'leaderboard') {
            const emojiName = interaction.options.getString('emoji-name');
            if (emojiName === null) {
                

                const top10 = await CroissantMessagesDB.find({}).sort({count: -1}).limit(10).lean();
                let message = `🏆 Top 10 croissanters since \n\n`//INSERT THE DATE THAT THIS CODE IS IMPLEMENTED
                for (let i = 0; i <  top10.length; i++) {
                const userID = top10[i].userID;
                const count = top10[i].count;
                const type = top10[i].type;
                message += `${i + 1}. <@!${userID}> — ${count} ${type}\n`;
            }
            interaction.reply({content: message});

            } else {
            const emojiEntry = await CroissantEmojiDB.findOne({ name: emojiName });

            if (!emojiEntry) {
                interaction.reply({
                    content: 'That is not a valid emoji',
                    ephemeral: true
                });
                return;
            }

            const emoji = emojiEntry.emoji;
            const sorted = await CroissantMessagesDB
                .find({ type: emoji })
                .sort({ count: -1 }) 
                .limit(10)
                .lean();


            if (sorted.length === 0) {
                return interaction.reply({ content: 'No data found for that emoji.', ephemeral: true });
            }

            let message = `🏆 Top 10 croissanters for ${emojiName}:\n\n`;

            for (let i = 0; i < sorted.length; i++) {
                const userID = sorted[i].userID;
                const count = sorted[i].count;
                message += `${i + 1}. <@!${userID}> — ${count} ${emoji}\n`;
            }

            interaction.reply({ content: message });

        }
        } else if (subcommand === 'faction') {
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
                allowedMentions: { parse: [] }
            });
        } else

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
                allowedMentions: { parse: [] }
            });
        }
    }
};
