const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getPathToFlowchart, isChartCached } = require('../modules/flowcharter');
const utils = require('../modules/utils');

module.exports = {
    data: new SlashCommandBuilder().setName("flowchart").setDescription("Lookup the latest flowcharts for any box")
        .addStringOption(option =>
            option.setName("chart").setDescription("The chart to bring up").setAutocomplete(true).setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("attach-html").setDescription("Send the chart HTML with the response").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("override-cache").setDescription("Recreate the chart ignoring the cached version").setRequired(false)
        ),
    async execute(cmd) {
        var chart = cmd.options.getString("chart");
        const overrideCacheAttempt = cmd.options.getBoolean("override-cache")
        const overrideCache = overrideCacheAttempt && (await utils.isCreator(cmd.user.id));
        const sendHTML = cmd.options.getBoolean("attach-html")

        // Check if chart is cached before deferring
        const cached = await isChartCached(chart, overrideCache);
        
        if (cached) {
            // Chart is cached, defer normally
            await cmd.deferReply();
        } else {
            // Chart needs rendering, defer with status message
            await cmd.deferReply();
            await cmd.editReply({ content: 'Rendering flowchart, please wait...' });
        }

        var [chartPath, error] = await getPathToFlowchart(chart, false, sendHTML, overrideCache);
        if (error) {
            cmd.editReply({ content: error, ephemeral: true });
            return;
        }

        var response = `Here is the \`${chart}\` chart`;

        if (overrideCacheAttempt != overrideCache) {
            response += ` - cached was not overridden as you are not authorized to do so`
        }

        let files = [
            new AttachmentBuilder(chartPath),
        ]
        if (sendHTML) files.push(new AttachmentBuilder(`./Flowcharts/generated.html`))

        cmd.editReply({
            content: response,
            files: files,
            ephemeral: false
        });
    }
};