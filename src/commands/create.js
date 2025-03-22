const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const utils = require('../modules/utils');

module.exports = {
    data: new SlashCommandBuilder().setName("create").setDescription("Create new Help Message to store in the bot")
        .addStringOption(option =>
            option.setName("subtopic").setDescription("The category this Help Message fits under").setAutocomplete(true).setRequired(true)
        ),
    async execute(cmd, storage) {
        const isEditing = false;

        if (!utils.isCreator(cmd.member?.user?.id)) {
            return cmd.reply({ content: `You are not authorized to create messages.`, ephemeral: true });
        }

        const createSubtopic = cmd.options.getString("subtopic");
        const subtopics = Object.keys(storage.helpMessages);
        if (!subtopics.includes(createSubtopic)) {
            return cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId("createModal")
            .setTitle(`"Create a new Help Message"`);

        const title = new TextInputBuilder()
            .setCustomId("T-")
            .setLabel("Title")
            .setPlaceholder("Turret Remove Guide Card")
            .setMaxLength(49)
            .setStyle(TextInputStyle.Short);

        const category = new TextInputBuilder()
            .setCustomId("S-" + createSubtopic)
            .setLabel("Subtopic")
            .setPlaceholder("ide")
            .setValue(createSubtopic)
            .setStyle(TextInputStyle.Short);

        const message = new TextInputBuilder()
            .setCustomId("Message")
            .setLabel("Message")
            .setPlaceholder("## You can use *Markdown*")
            .setStyle(TextInputStyle.Paragraph);

        const categoryRow = new ActionRowBuilder().addComponents(category);
        const titleRow = new ActionRowBuilder().addComponents(title);
        const messageRow = new ActionRowBuilder().addComponents(message);
        modal.addComponents(categoryRow, titleRow, messageRow);

        await cmd.showModal(modal);
    }
};