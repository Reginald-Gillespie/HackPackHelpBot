const { SlashCommandBuilder } = require('discord.js');
const { getPathToFlowchart } = require('../modules/flowcharter');
const { downloadFile } = require('../modules/utils'); // Import downloadFile
const fs = require("fs");
const utils = require('../modules/utils');

module.exports = {
    data: new SlashCommandBuilder().setName("edit_flowchart").setDescription("Edit a a flowchart")
        .addStringOption(option =>
            option.setName("chart").setDescription("The flowchart to edit").setAutocomplete(true).setRequired(true)
        )
        .addAttachmentOption(option =>
            option.setName('file').setDescription('The new mermaid flowchart as a text file').setRequired(false)
        ),
    async execute(cmd) {
        if (!(await utils.isCreator(cmd.user.id))) {
            return cmd.reply({ content: "You are not authorized to use this command", ephemeral: true });
        }
        const fileUpload = cmd.options.getAttachment("file");
        var chart = cmd.options.getString("chart");
        var [chartPath, error] = await getPathToFlowchart(chart, true); // only fetching mermaid path
        if (error) {
            cmd.reply({ content: error, ephemeral: true });
            return;
        }

        if (fileUpload) {
            downloadFile(fileUpload.url, chartPath);
            cmd.reply({
                content: `The chart has been updated`,
                ephemeral: true
            });
        } else {
            let mermaidJSON = fs.readFileSync(chartPath);
            cmd.reply({
                content:
                    `Here is the current \`${chart}\` flowchart`,
                files: [
                    { attachment: mermaidJSON, name: `${chart}.txt` }
                ],
                ephemeral: true
            });
        }
    }
};