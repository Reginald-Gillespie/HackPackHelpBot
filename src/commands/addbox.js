const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require('discord.js');
const { BoxData, ConfigDB } = require('../modules/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addbox')
        .setDescription('Add or edit a CrunchLabs box in the database (Admin only)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The name of the box (unique identifier)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('creator')
                .setDescription('Name of the creator. Provide an empty string to clear the field.')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('creator-id')
                .setDescription('Discord ID of the creator. Provide an empty string to clear.')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description for the box. Provide an empty string to clear.')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The box URL. Provide an empty string to clear.')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('display_name')
                .setDescription('The box name to display.')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('Custom emoji for the box (e.g., <:name:id> or just id). Provide an empty string to clear.')
                .setRequired(false)),

    async execute(interaction) {
        try {
            // Check if user is an admin
            const config = await ConfigDB.findOne().lean();
            const isAdmin = config?.admins?.includes(interaction.user.id);

            if (!isAdmin) {
                return interaction.reply({
                    content: "Only admins can use this command.",
                    ephemeral: true
                });
            }

            // Get options
            const boxName = interaction.options.getString('name');
            // For optional fields, getString returns the value, null if not provided, or "" if user input an empty string.
            const creator = interaction.options.getString('creator');
            const creatorId = interaction.options.getString('creator-id');
            const boxDescription = interaction.options.getString('description');
            const boxURL = interaction.options.getString('url');
            const displayName = interaction.options.getString('display_name');
            const boxEmoji = interaction.options.getString('emoji');

            const existingBox = await BoxData.findOne({ boxName }).lean();
            const isEdit = !!existingBox;
            let finalBoxDataForEmbed; // To store the data for the confirmation embed

            if (isEdit) {
                // Update existing box
                const updateFields = {};
                // Add field to updateFields only if the option was explicitly provided by the user
                // interaction.options.getString('option_name') returns null if the option was NOT used.
                // If it was used (even with an empty string), it's not null.
                if (interaction.options.getString('creator') !== null) updateFields.creator = creator;
                if (interaction.options.getString('creator-id') !== null) updateFields.creatorId = creatorId;
                if (interaction.options.getString('description') !== null) updateFields.boxDescription = boxDescription;
                if (interaction.options.getString('url') !== null) updateFields.boxURL = boxURL;
                if (interaction.options.getString('display_name') !== null) updateFields.displayName = displayName;
                if (interaction.options.getString('emoji') !== null) updateFields.boxEmoji = boxEmoji;
                
                if (Object.keys(updateFields).length > 0) {
                    await BoxData.updateOne({ boxName }, { $set: updateFields });
                }
                
                // Fetch the updated document to show in the embed
                finalBoxDataForEmbed = await BoxData.findOne({ boxName }).lean();

            } else {
                // Create new box
                const newBoxDocumentData = { boxName }; // Name is always required
                // Add other fields only if they were provided (not null)
                if (creator !== null) newBoxDocumentData.creator = creator;
                if (creatorId !== null) newBoxDocumentData.creatorId = creatorId;
                if (boxDescription !== null) newBoxDocumentData.boxDescription = boxDescription;
                if (boxURL !== null) newBoxDocumentData.boxURL = boxURL;
                if (displayName !== null) newBoxDocumentData.displayName = displayName;
                if (boxEmoji !== null) newBoxDocumentData.boxEmoji = boxEmoji;
                
                const newBox = new BoxData(newBoxDocumentData);
                await newBox.save();
                finalBoxDataForEmbed = newBox.toObject(); // Get plain object for the embed
            }

            // Create confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setTitle(isEdit ? 'Box Updated Successfully' : 'Box Added Successfully')
                .setDescription(`The box "**${finalBoxDataForEmbed.boxName}**" has been ${isEdit ? 'updated in' : 'added to'} the database.`)
                .setColor(isEdit ? 0xFFA500 : 0x00FF00);

            // Add fields to embed reflecting the current state from the database.
            // Using '|| N/A' to show N/A if field is null, undefined, or an empty string.
            confirmEmbed.addFields(
                { name: 'Display Name', value: finalBoxDataForEmbed.displayName || 'N/A' },
                { name: 'Creator', value: finalBoxDataForEmbed.creator || 'N/A', inline: true },
                { name: 'Creator ID', value: finalBoxDataForEmbed.creatorId || 'N/A', inline: true },
                { name: 'Emoji', value: finalBoxDataForEmbed.boxEmoji || 'N/A', inline: true }, // Shows custom emoji string or ID
                { name: 'Box URL', value: finalBoxDataForEmbed.boxURL || 'N/A' },
                { name: 'Description', value: finalBoxDataForEmbed.boxDescription || 'No description provided' }
            );

            await interaction.reply({
                embeds: [confirmEmbed],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in addbox command:', error);
            const replyPayload = {
                content: 'Please make sure to specify all required fields.',
                ephemeral: true
            };
            // Ensure we don't try to reply again if already replied or deferred
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyPayload);
            } else {
                await interaction.reply(replyPayload);
            }
        }
    }
};