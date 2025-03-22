const utils = require('../modules/utils');
const { Events, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { postProcessForDiscord, getQuestionAndAnswers } = require("../modules/mermaidParse")
const Fuse = require('fuse.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(cmd, client, storage) {
        if (cmd.isCommand()) {
            const command = client.commands.get(cmd.commandName);
            if (!command) return;
            try {
                await command.execute(cmd, storage);
            } catch (error) {
                console.error(error);
                await cmd.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        } else if (cmd.isButton()) {
           //Button code, no changes required
            const currentButtons = cmd.message.components[0];
            const thisButton = utils.findButtonOfId(cmd.message.components, cmd.customId)
            const jsonButton = currentButtons.components[0];
            const context = JSON.parse(jsonButton.customId.split("|")[1])
            const customId = cmd.customId.split("|")[0];
            const interactionId = (cmd.message.embeds[1]?.footer || cmd.message.embeds[0]?.footer).text.split(" ")[1];

            if (cmd.user.id !== context.id) {
                return cmd.reply({ content: "This flowchart is not for you, you can run /help to start your own", ephemeral: true })
            }

            var [mermaidPath, error] = await utils.getPathToFlowchart(context.chart, true);
            const mermaidJSON = require(mermaidPath)

            let questionData, answersArray;

            if (customId === "Back") {
                const history = storage.cache[context.id]?.helpHistory;
                if (!history || !history.length > 1) return cmd.reply({ content: "There is no history to go back to. Please start a new command.", ephemeral: true })
                if (history.slice(-1)[0][2] !== interactionId) return cmd.reply({ content: "There is no history to go back to. Please start a new command.", ephemeral: true })

                history.pop();
                let uid;
                [questionData, answersArray, uid] = history.slice(-1)[0];
            }
            else {
                [questionData, answersArray] = getQuestionAndAnswers(mermaidJSON, context.questionID, customId);
                storage.cache[context.id]?.helpHistory?.push([questionData, answersArray, interactionId])
            }

            const message = await cmd.message.fetch();
            const hasAnswerEmbed = message.embeds.length > 1;
            const questionEmbed = message.embeds[hasAnswerEmbed ? 1 : 0];
            let questionField = questionEmbed.fields[2];
            const question = questionField.value;
            let answerEmbed = hasAnswerEmbed ? message.embeds[0] : null;

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

            if (questionData?.questionID !== "Title") buttons.unshift(
                new ButtonBuilder()
                    .setCustomId("Back")
                    .setLabel("Back")
                    .setStyle(ButtonStyle.Secondary)
            )
            if (buttons[0]) {
                buttons[0].data.custom_id += "|" + JSON.stringify({
                    id: context.id,
                    questionID: questionData?.questionID,
                    chart: context.chart,
                })
            }
            const rows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
            }

            if (!answerEmbed) {
                answerEmbed = new EmbedBuilder()
                    .setColor(0)
                    .setTitle(`Recorded answers`)
                    .setFields([])
            }
            answerEmbed.data.fields.push({ name: `Q: ${question}`, value: `> ${thisButton.data.label}` })
            answerEmbed.data.fields = answerEmbed.data.fields.slice(-25);
            questionField.value = postProcessForDiscord(questionData?.question, cmd.guild);

            questionEmbedBuild = EmbedBuilder.from(questionEmbed)
            questionEmbedBuild.setThumbnail("attachment://flowchart.png");

            await message.edit({
                embeds: [answerEmbed, questionEmbedBuild],
                components: rows,
            });
            await cmd.deferUpdate();
            return;
        } else if (cmd.isModalSubmit()) {
            switch (cmd.customId) {
                case "editModal":
                case "createModal":
                    const isEditing = cmd.customId == "editModal";

                    const modalFields = cmd.fields.fields.map(field => field.customId);
                    const subtopicFieldID = modalFields.filter(field => field.startsWith("S-"))[0];
                    const titleFieldID = modalFields.filter(field => field.startsWith("T-"))[0];

                    const message = cmd.fields.getTextInputValue('Message');
                    const title = cmd.fields.getTextInputValue(titleFieldID);
                    const subtopic = cmd.fields.getTextInputValue(subtopicFieldID);
                    const subtopics = Object.keys(storage.helpMessages);

                    const formerSubtopic = subtopicFieldID.split("-").slice(1).join("-") || subtopic;
                    const formerTitle = titleFieldID.split("-").slice(1).join("-") || title;

                    if (!subtopics.includes(subtopic)) {
                        cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                        break;
                    }

                    const tilesInNewLocation = utils.getHelpMessageTitlesArray(subtopic);
                    if (
                        (tilesInNewLocation.includes(title) && !isEditing) ||
                        (tilesInNewLocation.includes(title) && isEditing && formerSubtopic != subtopic) ||
                        (tilesInNewLocation.includes(title) && isEditing && formerSubtopic == subtopic && title != formerTitle)
                    ) {
                        cmd.reply({ content: "A Help Message already exists with that title in that location.", ephemeral: true })
                        break;
                    }

                    if (isEditing) utils.editHelpMessage(subtopic, title, message, formerTitle, formerSubtopic)
                    else utils.appendHelpMessage(subtopic, title, message);

                    cmd.reply({ content: `${isEditing ? "This" : "Your"} Help Message has been ${isEditing ? "edited" : "added"}, thanks!`, ephemeral: true })
                    break;
            }
        } else if (cmd.isAutocomplete()) {
            const field = cmd.options.getFocused(true);
            const typedSoFar = field.value;
            const subtopics = Object.keys(storage.helpMessages);

            switch (field.name) {
                case "title":
                    // Use getSubcommand() safely:
                    var subtopic = cmd.options.getSubcommand(false);

                    if (!subtopic) {
                        subtopic = cmd.options.getString('subtopic') || "";
                        if (!subtopics.includes(subtopic)) {
                            cmd.respond(utils.arrayToAutocorrect(["Subtopic not found"]));
                            return; // Early return is important!
                        }
                    }


                    var helpMessagesTitles = utils.getHelpMessageTitlesArray(subtopic);

                    if (typedSoFar) {
                        helpMessagesTitles = utils.sortByMatch(helpMessagesTitles, typedSoFar); //Simplified
                    }

                    cmd.respond(utils.arrayToAutocorrect(helpMessagesTitles));
                    break;

                case "subtopic":
                    const options = subtopics.filter(subtopic => subtopic.startsWith(typedSoFar));
                    cmd.respond(utils.arrayToAutocorrect(options))
                    break;

                case "chart":
                    const chartOptions = utils.getChartOptions();
                    const matching = utils.sortByMatch(chartOptions, typedSoFar);
                    cmd.respond(utils.arrayToAutocorrect(matching))
                    break;
            }
        }
    }
};