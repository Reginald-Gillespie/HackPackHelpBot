const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { getPathToFlowchart, JSONCparse, isChartCached } = require('../modules/flowcharter');
const { postProcessForDiscord, getQuestionAndAnswers } = require('../modules/mermaidParse');
const LRUCache = require("lru-cache").LRUCache;
const ms = require("ms")
const stripJsonComments = require('strip-json-comments');
const fs = require("fs");
const { getChartOptions } = require('../modules/utils');

/** @type {LRUCache<string, any[]>} */
const helpHistoryCache = new LRUCache({ ttl: ms("1h"), max: 200 })

/**
 * Send an interactive flowchart to a user
 * @param {Object} options - Options for sending the flowchart
 * @param {string} options.chartFilename - The filename of the chart (without extension)
 * @param {string} options.chartTitle - The title of the chart
 * @param {Object} options.user - The Discord user who will interact with the flowchart
 * @param {Object} options.guild - The Discord guild (server) object
 * @param {string} options.interactionId - Unique ID for this interaction
 * @param {Function} options.reply - Function to send the reply (accepts Discord message options)
 * @returns {Promise<void>}
 */
async function sendFlowchartToUser({ chartFilename, chartTitle, user, guild, interactionId, reply }) {
    var [mermaidPath, error] = await getPathToFlowchart(chartFilename, true);
    if (error) {
        throw new Error(error);
    }

    let mermaidJSON;
    try {
        mermaidJSON = JSONCparse((await fs.promises.readFile(mermaidPath)).toString());
    } catch {
        throw new Error("Sorry, this chart has malformed JSON.");
    }
    const [questionData, answersArray] = getQuestionAndAnswers(mermaidJSON)

    // Store so we know what to go back to
    helpHistoryCache.set(user.id, [[questionData, answersArray, interactionId]]);

    const templateColor = parseInt(mermaidJSON.config?.color?.replaceAll("#", "") || "dd8836", 16)

    const [flowchart, _] = await getPathToFlowchart(chartFilename)
    const flowchartAttachment = new AttachmentBuilder(flowchart, { name: 'flowchart.png' });

    const embed = new EmbedBuilder()
        .setColor(templateColor)
        .setTitle(chartTitle)
        .setThumbnail(`attachment://flowchart.png`)
        .addFields(
            { name: "Instructions", value: `Please answer these questions:` },
            { name: '\n', value: '\n' },
            { name: "Question:", value: postProcessForDiscord(questionData?.question, guild) },
            { name: '\n', value: '\n' },
            { name: '\n', value: '\n' },
        )
        .setFooter({ text: `Interaction ${interactionId}`, iconURL: user.displayAvatarURL() });

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
        id: user.id,
        questionID: questionData?.questionID,
        chart: chartFilename,
    })

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    await reply({
        content: `<@${user.id}>`,
        embeds: [embed],
        components: rows,
        files: [flowchartAttachment], 
        allowedMentions: { users: [ user.id ] }
    });
}

module.exports = {
    helpHistoryCache: helpHistoryCache,
    sendFlowchartToUser,
    
    data: new SlashCommandBuilder().setName("help").setDescription("Walk a user through the a debugging flowcharts")
        .addStringOption(option =>
            option.setName("chart").setDescription("The chart to walk through").setAutocomplete(true).setRequired(true)
        )
        .addUserOption(option =>
            option.setName("who").setDescription("Select a user who should walk through this chart").setRequired(false)
        ),

    async execute(cmd) {
        // Early exit conditions

        // Make sure we have embed message perms
        const fullChannel = await cmd.channel.fetch();
        const myPerms = fullChannel.permissionsFor(client.user);
        if (
            !myPerms?.has(PermissionFlagsBits.EmbedLinks) || 
            !myPerms?.has(PermissionFlagsBits.AttachFiles)
        ) {
            return cmd.reply({ 
                content: "Try this command in another channel.\n-# I don't have permission to send messages and/or embed links in this channel.", 
                ephemeral: false // I want to know when someone hits this to know that they tried 
            });
        }

        // Make sure we're in a server
        if (!cmd.guild) {
            return cmd.reply({ content: "This command only works when the bot is installed in the server", ephemeral: true });
        }

        let chart = cmd.options.getString("chart");
        let chartData = getChartOptions().find(c => c.filename == chart);

        // Check if chart is cached and defer appropriately
        const cached = await isChartCached(chart, false);
        if (cached) {
            await cmd.deferReply();
        } else {
            await cmd.deferReply();
            await cmd.editReply({ content: 'Rendering flowchart, please wait...' });
        }

        const who = cmd.options.getUser("who") || cmd.user;

        try {
            await sendFlowchartToUser({
                chartFilename: chart,
                chartTitle: chartData.title,
                user: who,
                guild: cmd.guild,
                interactionId: cmd.id,
                reply: (options) => cmd.editReply(options)
            });
        } catch (error) {
            console.log("Error in /help command:", error.message);
            return cmd.editReply({ content: "Sorry, there was an error while executing this command.", ephemeral: true });
        }
    }
};