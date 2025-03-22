const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { getPathToFlowchart } = require('../modules/flowcharter');
const { postProcessForDiscord, getQuestionAndAnswers } = require('../modules/mermaidParse');

module.exports = {
    data: new SlashCommandBuilder().setName("help").setDescription("Walk a user through the a debugging flowcharts")
        .addStringOption(option =>
            option.setName("chart").setDescription("The chart to walk through").setAutocomplete(true).setRequired(true)
        )
        .addUserOption(option =>
            option.setName("who").setDescription("Select a user who should walk through this chart").setRequired(false)
        ),
    async execute(cmd, storage) {

        if (!cmd.guild) {
            return cmd.reply({ content: "This command only works when the bot is installed in the server", ephemeral: true });
        }

        var chart = cmd.options.getString("chart");;
        const who = cmd.options.getUser("who") || cmd.user;

        var [mermaidPath, error] = await getPathToFlowchart(chart, true); // only fetching mermaid path
        if (error) {
            cmd.reply({ content: error, ephemeral: true });
            return; // Ensure we exit if there's an error.
        }

        let mermaidJSON;
        try {
            mermaidJSON = require(mermaidPath);
        } catch {
            return cmd.reply({ content: "Sorry, this chart has malformed JSON.", ephemeral: true });
        }
        const [questionData, answersArray] = getQuestionAndAnswers(mermaidJSON)

        storage.cache[who.id] = {}
        storage.cache[who.id].helpHistory = []
        storage.cache[who.id]?.helpHistory.push([questionData, answersArray, cmd.id])

        const templateColor = parseInt(mermaidJSON.config?.color?.replaceAll("#", "") || "dd8836", 16)

        const [flowchart, _] = await getPathToFlowchart(chart)
        const flowchartAttachment = new AttachmentBuilder(flowchart, { name: 'flowchart.png' });

        const embed = new EmbedBuilder()
            .setColor(templateColor)
            .setTitle(`Flowchart Walkthrough: \`${chart}\``)
            .setThumbnail(`attachment://flowchart.png`)
            .addFields(
                { name: "Instructions", value: `Please answer these questions:` },
                { name: '\n', value: '\n' },
                { name: "Question:", value: postProcessForDiscord(questionData?.question, cmd.guild) },
                { name: '\n', value: '\n' },
                { name: '\n', value: '\n' },
            )
            .setFooter({ text: `Interaction ${cmd.id}`, iconURL: who.displayAvatarURL() });

        const buttons = [];
        for (let i = 0; i < answersArray.length; i++) {
            const answer = answersArray[i];
            buttons.push(
                new ButtonBuilder()
                    .setCustomId("" + answer)
                    .setLabel("" + answer)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if (buttons[0]) buttons[0].data.custom_id += "|" + JSON.stringify({
            id: who.id,
            questionID: questionData?.questionID,
            chart,
        })

        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        await cmd.reply({
            content: `<@${who.id}>`,
            embeds: [embed],
            components: rows,
            files: [flowchartAttachment]
        });
    }
};