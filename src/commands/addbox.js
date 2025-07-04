const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require('discord.js');
const { BoxData, ConfigDB } = require('../modules/database');

// Data about box feilds you can specify

/**
 * @typedef {Object} FieldDefinition
 * @property {string} name - The option name for the slash command.
 * @property {string} description - Description for the slash command option.
 * @property {boolean} required - Whether the option is required.
 * @property {string} dbField - The field name in the database.
 * @property {string} embedName - The field name to display in the embed.
 * @property {boolean} embedInline - Whether the embed field is inline.
 * @property {string} embedFallback - Fallback value for the embed if the field is missing.
 */
/** @type {FieldDefinition[]} */
const FIELD_DEFINITIONS = [
    // Box name is hardcoded as it is the field used to lookup docs.
    {
        name: 'creator',
        dbField: 'creator',
        description: 'Name of the creator. Provide an empty string to clear the field.',
        required: false,
        embedName: 'Creator',
        embedInline: true,
        embedFallback: 'N/A'
    },
    {
        name: 'creator-id',
        dbField: 'creatorId',
        description: 'Discord ID of the creator. Provide an empty string to clear.',
        required: false,
        embedName: 'Creator ID',
        embedInline: true,
        embedFallback: 'N/A'
    },
    {
        name: 'description',
        dbField: 'boxDescription',
        description: 'Description for the box. Provide an empty string to clear.',
        required: false,
        embedName: 'Description',
        embedInline: false,
        embedFallback: 'No description provided'
    },
    {
        name: 'url',
        dbField: 'boxURL',
        description: 'The box URL. Provide an empty string to clear.',
        required: false,
        embedName: 'Box URL',
        embedInline: false,
        embedFallback: 'N/A'
    },
    {
        name: 'display-name',
        dbField: 'displayName',
        description: 'The box name to display.',
        required: false,
        embedName: 'Display Name',
        embedInline: false,
        embedFallback: 'N/A'
    },
    {
        name: 'emoji',
        dbField: 'boxEmoji',
        description: 'Custom emoji for the box (e.g., <:name:id> or just id). Provide an empty string to clear.',
        required: false,
        embedName: 'Emoji',
        embedInline: true,
        embedFallback: 'N/A'
    },
    {
        name: 'hacks-channel',
        dbField: 'hacksChannel',
        description: 'The channel hacks for this box are posted under.',
        required: false,
        embedName: 'Hacks Channel',
        embedInline: false,
        embedFallback: 'N/A'
    },
    {
        name: 'featured-hacks-channel',
        dbField: 'featuredHacksChannel',
        description: 'The channel featured hacks for this box are posted under.',
        required: false,
        embedName: 'Hacks Channel',
        embedInline: false,
        embedFallback: 'N/A'
    },
    {
        name: 'featured-hacks-tag',
        dbField: 'featuredHacksTag',
        description: 'The ID of the tag for this box in the featured hacks channel.',
        required: false,
        embedName: 'Hacks Channel',
        embedInline: false,
        embedFallback: 'N/A'
    },
    {
        name: 'role-id',
        dbField: 'roleId',
        description: 'The ID of the role for this box.',
        required: false,
        embedName: 'Hacks Channel',
        embedInline: false,
        embedFallback: 'N/A'
    }
];

module.exports = {
    data: (() => {
        const builder = new SlashCommandBuilder()
            .setName('addbox')
            .setDescription('Add or edit a CrunchLabs box in the database (Admin only)')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('The name of the box (unique identifier)')
                    .setRequired(true));

        // Dynamically add all field options
        FIELD_DEFINITIONS.forEach(field => {
            builder.addStringOption(option =>
                option.setName(field.name)
                    .setDescription(field.description)
                    .setRequired(field.required));
        });

        return builder;
    })(),

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

            // Get the required name field
            const boxName = interaction.options.getString('name');

            const existingBox = await BoxData.findOne({ boxName }).lean();
            const isEdit = !!existingBox;
            let finalBoxDataForEmbed;

            if (isEdit) {
                // Update existing box
                const updateFields = {};

                // Process each field dynamically
                FIELD_DEFINITIONS.forEach(field => {
                    const value = interaction.options.getString(field.name);
                    if (value !== null) { // Only update if option was provided
                        updateFields[field.dbField] = value;
                    }
                });

                if (Object.keys(updateFields).length > 0) {
                    await BoxData.updateOne({ boxName }, { $set: updateFields });
                }

                // Fetch the updated document to show in the embed
                finalBoxDataForEmbed = await BoxData.findOne({ boxName }).lean();

            } else {
                // Create new box
                const newBoxDocumentData = { boxName }; // Name is always required

                // Process each field dynamically
                FIELD_DEFINITIONS.forEach(field => {
                    const value = interaction.options.getString(field.name);
                    if (value !== null) {
                        newBoxDocumentData[field.dbField] = value;
                    }
                });

                const newBox = new BoxData(newBoxDocumentData);
                await newBox.save();
                finalBoxDataForEmbed = newBox.toObject();
            }

            // Create confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setTitle(isEdit ? 'Box Updated Successfully' : 'Box Added Successfully')
                .setDescription(`The box "**${finalBoxDataForEmbed.boxName}**" has been ${isEdit ? 'updated in' : 'added to'} the database.`)
                .setColor(isEdit ? 0xFFA500 : 0x00FF00);

            // Add fields to embed dynamically
            FIELD_DEFINITIONS.forEach(field => {
                confirmEmbed.addFields({
                    name: field.embedName,
                    value: finalBoxDataForEmbed[field.dbField] || field.embedFallback,
                    inline: field.embedInline
                });
            });

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
                await interaction.reply({ 
                    ...replyPayload, 
                    allowedMentions: { parse: [] }
                });
            }
        }
    }
};