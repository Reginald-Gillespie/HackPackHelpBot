const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { getPathToFlowchart, JSONCparse } = require('../modules/flowcharter');
const { postProcessForDiscord, getQuestionAndAnswers } = require('../modules/mermaidParse');
const LRUCache = require("lru-cache").LRUCache;
const ms = require("ms")
const stripJsonComments = require('strip-json-comments');
const fs = require("fs");
const { getChartOptions } = require('../modules/utils');

const helpHistoryCache = new LRUCache({ ttl: ms("1h") })

module.exports = {
    helpHistoryCache,
    
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

        const who = cmd.options.getUser("who") || cmd.user;

        var [mermaidPath, error] = await getPathToFlowchart(chart, true);
        if (error) {
            cmd.reply({ content: error, ephemeral: true });
            return; // Ensure we exit if there's an error.
        }

        let mermaidJSON;
        try {
            mermaidJSON = JSONCparse((await fs.promises.readFile(mermaidPath)).toString());
        } catch {
            return cmd.reply({ content: "Sorry, this chart has malformed JSON.", ephemeral: true });
        }
        const [questionData, answersArray] = getQuestionAndAnswers(mermaidJSON)

        // Store so we know what to go back to
        helpHistoryCache.set(who.id, [[questionData, answersArray, cmd.id]]);
        // TODO: this should also be keyed by the message the embed is on's ID

        const templateColor = parseInt(mermaidJSON.config?.color?.replaceAll("#", "") || "dd8836", 16)

        const [flowchart, _] = await getPathToFlowchart(chart)
        const flowchartAttachment = new AttachmentBuilder(flowchart, { name: 'flowchart.png' });

        const embed = new EmbedBuilder()
            .setColor(templateColor)
            .setTitle(chartData.title)
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
            files: [flowchartAttachment], 
            allowedMentions: { users: [ who.id ] }
        });
    }
};