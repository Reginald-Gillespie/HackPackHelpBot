const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const utils = require('../modules/utils');
const { ConfigDB } = require("../modules/database");

module.exports = {
    data: new SlashCommandBuilder().setName("edit").setDescription("Edit an existing Help Message")
        .addStringOption(option =>
            option.setName("subtopic").setDescription("The category this Help Message fits under").setAutocomplete(true).setRequired(true)
        )
        .addStringOption(option =>
            option.setName("title").setDescription("The Help Message to edit").setAutocomplete(true).setRequired(true)
        ),
    async execute(cmd) {
        if (!(await utils.isCreator(cmd.member?.user?.id))) {
            return cmd.reply({ content: `You are not authorized to edit messages.`, ephemeral: true });

        }
        const createSubtopic = cmd.options.getString("subtopic");

        const config = await ConfigDB.findOne();
        const subtopics = config.allowedHelpMessageCategories;

        if (!subtopics.includes(createSubtopic)) {
            return cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId("editModal")
            .setTitle(`"Edit a Help Message"`);

        const title = new TextInputBuilder()
            .setCustomId("T-") // we embed more data here later
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


        const titleToEdit = cmd.options.getString("title").match(/[\s\w\/&\(\)]/g).join("");
        title.setValue(titleToEdit);
        title.setCustomId("T-" + titleToEdit)


        if (!(await utils.getHelpMessageTitlesArray(createSubtopic)).includes(titleToEdit)) {
            cmd.reply({ content: "No Help Message exists with that title.", ephemeral: true })
            return;
        }

        const messageContent = await utils.getHelpMessageBySubjectTitle(createSubtopic, titleToEdit);
        message.setValue(messageContent);


        const categoryRow = new ActionRowBuilder().addComponents(category);
        const titleRow = new ActionRowBuilder().addComponents(title);
        const messageRow = new ActionRowBuilder().addComponents(message);
        modal.addComponents(categoryRow, titleRow, messageRow);

        await cmd.showModal(modal);
    }
};