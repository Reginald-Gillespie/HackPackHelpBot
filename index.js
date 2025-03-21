// TODO:
// Cache fs.readFileSync calls
// Check for message under current name before adding / moving
// If I want to add per-user storage, storage create messages from users if they are failed and insert them as starting point when they run create again.
// Lots of other limiting char counts
// Command to upload photos from photo database of different parts of each box?
// Allow admin who create a message with a non-already-created-topic to do so... but only after adding delete command ig
// ToDo: support moving a help message cross-topic

require("./setEnvs")
const NodeCache = require( "node-cache" );
const {Client, Events, ActionRowBuilder, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ComponentType } = require("discord.js");
const { GoogleGenerativeAI, FunctionCallingMode, SchemaType } = require("@google/generative-ai");
const fs = require("fs");
const { get } = require('https');
const { getChartOptions, getPathToFlowchart } = require("./flowcharter")
const { getQuestionAndAnswers, postProcessForDiscord } = require("./mermaidParse")
const Fuse = require('fuse.js');
const path = require("path")
const Storage = require("./storage");
const { distance: levenshtein } = require('fastest-levenshtein')
const fuseOptions = {
    includeScore: true,
    keys: ['title']
};

let storage = new Storage();
global.storage = storage; // Make it easier to modularize

const AutoReplyAI = require("./AutoReplyAI")
const MarkRobot = require("./markRobot");
storage.cache.markRobotInstances = {}; // Non-persistent cache for /mark-robot command
storage.cache.markRobotPingsCache = {}; // Same, but for channel pings and replies
storage.cache.repeatQuestions = {} // {id: [{message: <hash>, channelID, repeats: 1}, ...]}
let repeatQuestions = storage.cache.repeatQuestions; // shorter reference to the above

// Initialize helpMessages if it doesn't exist
storage.helpMessages = storage.helpMessages || {};

// Register client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: Object.keys(Partials).map(a=>Partials[a])
});


//#region functions
global.isHelpRequest = function(message) { // Technically this should be in a utils file
    // Identify if a message is a request for help using rough criteria.
    message = message.toLowerCase().replace("'", "");
    return (
        // Required flags
        message.length >= 20
    ) && (
        // Must contain one of these:
        /\?/iu.test(message) ||
        /anyone know/iu.test(message) ||
        /\bhow\b/iu.test(message) ||
        /\bwhy\b/iu.test(message) ||
        /problem/iu.test(message) ||
        /will not/iu.test(message) ||
        /\bwont/iu.test(message) ||
        /\bisnt/iu.test(message) ||
        /is not/iu.test(message) ||
        // /it was/iu.test(message) ||
        // /does/iu.test(message) ||
        /^does/iu.test(message) ||
        /\bhelp\b/iu.test(message)
    )
}
function areTheSame(msg1, msg2) {
    const threshold = 0.85;

    msg1 = msg1.slice(0, 1000);
    msg2 = msg2.slice(0, 1000);

    const edits = levenshtein(msg1, msg2)
    const similarity = 1 - edits/Math.max(msg1.length + msg2.length)

    return similarity > threshold
}
function markRobotMessagePostProcess(message, guild) {
    // Post-process message snowflakes for MarkRobot
    message = message.replace(/<@!?(\d+)>/g, (match, userId) => {
        if (userId === client.user.id) {
            // return "@Mark-Robot";
            // Due to what seems to be an idiotic whitelist process, best to keep messages as uniform as possible
            // *cough* *cough* which entirely defeates the purpose of using an LLM in the first place.
            // You might as well query an FAQ database or even better if you want to be high tech, use a CSV-FAQ-Matching ML algorithm.
            return "";
        }
        const user = guild.members.cache.get(userId); // Fetch the user from the guild
        return user ? `@${user.user.username}` : match; // Replace with username if found
    });
    message = message.trim()
    return message;
}
function isCreator(userID) {
    return storage?.creators.includes(userID) || storage?.admins.includes(userID)
}
function sortByMatch(items, text) {
    if (!text) return items;
    const fuse = new Fuse(items.map(title => ({ title })), fuseOptions);
    const scoredResults = fuse.search(text)
        .filter(result => result.score <= 2) // Roughly similar-ish
        .sort((a, b) => a.score - b.score);
    return scoredResults.map(entry => entry.item.title);
}
function arrayToAutocorrect(array) {
    const choices = array.map(choice => {
        return {
            "name": choice,
            "value": choice
        }
    });
    return choices.slice(0, 25); // Discord limit is 25 responses
}
async function downloadFile(fileUrl, downloadPath) {
    return new Promise((resolve, reject) => {
        // Ensure the download path exists
        const fullPath = path.resolve(downloadPath);

        // Create a write stream
        const file = fs.createWriteStream(fullPath);

        // Download the file
        get(fileUrl, (response) => {
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve(fullPath);
            });
        }).on('error', (err) => {
            file.close();
            reject(err);
        });
    });
}
function findButtonOfId(actionRows, ID) {
    for (const actionRow of actionRows) {
        // Find a button within the components of the action row
        const button = actionRow.components.find(
          component => component.type === ComponentType.Button && component.customId === ID
        );
        if (button) return button
    }
    return null
}

function getHelpMessageTitlesArray(subtopic) {
    if (!storage.helpMessages[subtopic]) {
        return [];
    }
    return storage.helpMessages[subtopic].map(message => message.title);
}


global.getHelpMessageBySubjectTitle = function(subtopic, title) { // This should also be in a utils file
    if (!storage.helpMessages[subtopic]) {
        return "No Help Messages found for this subtopic.";
    }
    const message = storage.helpMessages[subtopic].find(m => m.title === title);
    return message ? message.message : "No content found for this query";
}


function appendHelpMessage(subtopic, title, message) {
    // Filter fields with regex (keeping only allowed characters)
    subtopic = subtopic.match(/[\w-]/g).join("");
    title = title.match(/[\s\w\/&\(\)]/g).join("");
    message = message.match(/[\x20-\x7E\n]/g).join(""); // ASCII range

    // Trim extra newlines or spaces
    [subtopic, title, message] = [subtopic.trim(), title.trim(), message.trim()];

    const newMessage = {
        title: title,
        message: message
    };

    if (!storage.helpMessages[subtopic]) {
        storage.helpMessages[subtopic] = [];
    }
    storage.helpMessages[subtopic].push(newMessage);
    storage.saveHelps();
    console.log("Message added:", newMessage, "to subtopic:", subtopic);
}


function editHelpMessage(subtopic, title, message, formerTitle, formerSubtopic) {
    // Filter message like adding
    message = message.match(/[\x20-\x7E\n]/g).join("").trim();

    // Remove the old message (if it exists and if the subtopic is different)
    if (formerSubtopic && storage.helpMessages[formerSubtopic]) {
        storage.helpMessages[formerSubtopic] = storage.helpMessages[formerSubtopic].filter(m => m.title !== formerTitle);
    }

    // Add the new/updated message
    if (!storage.helpMessages[subtopic]) {
        storage.helpMessages[subtopic] = [];
    }

    // Check if message exists to update, otherwise add
    const existingMessageIndex = storage.helpMessages[subtopic].findIndex(m => m.title === title);
    if (existingMessageIndex > -1) {
        storage.helpMessages[subtopic][existingMessageIndex] = { title: title, message: message };
    }
    else {
        storage.helpMessages[subtopic].push({title:title, message: message});
    }

    storage.saveHelps();
    console.log("Message edited:", { title: title, message: message }, "in subtopic:", subtopic);
}


//#endregion functions


//#region Handlers
// Most non-message handlers
client.on("interactionCreate", async cmd => {
    // Buttons for flowchart walkthrough
    if (cmd.isButton()) {
        // Extract JSON from first button in the row
        const currentButtons = cmd.message.components[0];
        const thisButton = findButtonOfId(cmd.message.components, cmd.customId)
        const jsonButton = currentButtons.components[0];
        const context = JSON.parse(jsonButton.customId.split("|")[1])
        const customId = cmd.customId.split("|")[0]; // do this for all buttons just because
        const interactionId = (cmd.message.embeds[1]?.footer || cmd.message.embeds[0]?.footer).text.split(" ")[1];

        if (cmd.user.id !== context.id) {
            return cmd.reply({content: "This flowchart is not for you, you can run /help to start your own", ephemeral: true})
        }

        // Follow the flowchart
        var [mermaidPath, error] = await getPathToFlowchart(context.chart, true);
        const mermaidJSON = require(mermaidPath)

        let questionData, answersArray;

        // Check if this was the back button
        if (customId === "Back") {
            // Check if we have previous data
            const history = storage.cache[context.id]?.helpHistory;
            if (!history || !history.length > 1) return cmd.reply({content: "There is no history to go back to. Please start a new command.", ephemeral: true})

            // Make sure this history is for this interaction
            if (history.slice(-1)[0][2] !== interactionId) return cmd.reply({content: "There is no history to go back to. Please start a new command.", ephemeral: true})

            history.pop(); // Remove the current page

            let uid;
            [questionData, answersArray, uid] = history.slice(-1)[0];
        }
        else {
            [ questionData, answersArray ] = getQuestionAndAnswers(mermaidJSON, context.questionID, customId);

            // Pack new data to history cache
            storage.cache[context.id]?.helpHistory?.push([questionData, answersArray, interactionId])
        }

        // Fetch the embed to update
        const message = await cmd.message.fetch();
        const hasAnswerEmbed = message.embeds.length > 1;
        const questionEmbed = message.embeds[hasAnswerEmbed ? 1 : 0];
        let questionField = questionEmbed.fields[2];
        const question = questionField.value; //.match(/```(.+?)```/)?.[1] || "[Error parsing question]"
        let answerEmbed = hasAnswerEmbed ? message.embeds[0] : null;

        // Buttons - pack answers into row
        const buttons = [];
        for (let i = 0; i < answersArray.length; i++) {
            const answer = answersArray[i];
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(""+answer)
                    .setLabel(""+answer)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        // Inject back button if this isn't the starting page
        if (questionData?.questionID !== "Title") buttons.unshift(
            new ButtonBuilder()
                .setCustomId("Back")
                .setLabel("Back")
                .setStyle(ButtonStyle.Secondary)
        )
        if (buttons[0]) {
            // This might not be defined if there are no more answers
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

        // Create answer embed template if it does not exist
        if (!answerEmbed) {
            answerEmbed = new EmbedBuilder()
                .setColor(0)
                .setTitle(`Recorded answers`)
                .setFields([])
        }

        // Add the recorded answers to the answer embed
        answerEmbed.data.fields.push({ name: `Q: ${question}`, value: `> ${thisButton.data.label}` })
        answerEmbed.data.fields = answerEmbed.data.fields.slice(-25); // Make sure we don't hit the discord limit

        // Pack question back into question embed
        questionField.value = postProcessForDiscord(questionData?.question, cmd.guild);

        // The flowchart is already attached if we don't change the `files` param, we just need to reinsert the embed in the thumbnail
        questionEmbedBuild = EmbedBuilder.from(questionEmbed)
        questionEmbedBuild.setThumbnail("attachment://flowchart.png");

        await message.edit({
            embeds: [ answerEmbed, questionEmbedBuild ],
            // files: [ flowchartAttachment ],
            components: rows,
        });
        await cmd.deferUpdate();
        return;
    }

    // Autocomplete interactions are requesting what to suggest to the user to put in a command's string option
    if (cmd.isAutocomplete()) {
        const field = cmd.options.getFocused(true);
        const typedSoFar = field.value;
        const subtopics = Object.keys(storage.helpMessages);

        switch(field.name) { // we base the switch off what the the felid is, either a topic autocomplete or a title autocomplete
            case "title":
                var subtopic = cmd.options.getSubcommand(false);

                // If this is an edit command, we need to extract the subtopic from the subtopic field since it doesn't use subcommands
                if (!subtopic) {
                    subtopic = cmd.options.getString('subtopic') || "";
                    if (!subtopics.includes(subtopic)) {
                        cmd.respond(arrayToAutocorrect(["Subtopic not found"]));
                        break;
                    }
                }

                var helpMessagesTitles = getHelpMessageTitlesArray(subtopic)

                // Now we're going to filter our suggestions by similar the things are to what they've typed so far
                if (typedSoFar) { // only refine if they've started typing
                    const fuse = new Fuse(helpMessagesTitles.map(title => ({ title })), fuseOptions);
                    const scoredResults = fuse.search(typedSoFar).sort((a, b) => a.score - b.score);
                    helpMessagesTitles = scoredResults.map(entry => entry.item.title);
                }

                cmd.respond(arrayToAutocorrect(helpMessagesTitles));
                break;

            case "subtopic":
                const options = subtopics.filter(subtopic => subtopic.startsWith(typedSoFar));
                cmd.respond(arrayToAutocorrect(options))
                break;

            case "chart":
                const chartOptions = getChartOptions();
                const matching = sortByMatch(chartOptions, typedSoFar);
                cmd.respond(arrayToAutocorrect(matching))
                break
        }
    }

    // Modal submit interactions from creating and editing messages
    else if (cmd.isModalSubmit()) {
        switch(cmd.customId) {
            case "editModal":
            case "createModal":
                const isEditing = cmd.customId == "editModal";

                // Some fields have embeded data, so extract that ( fieldName-data )
                const modalFields = cmd.fields.fields.map(field => field.customId);
                const subtopicFieldID = modalFields.filter(field => field.startsWith("S-"))[0];
                const titleFieldID = modalFields.filter(field => field.startsWith("T-"))[0];

                const message = cmd.fields.getTextInputValue('Message');
                const title = cmd.fields.getTextInputValue(titleFieldID);
                const subtopic = cmd.fields.getTextInputValue(subtopicFieldID);
                const subtopics = Object.keys(storage.helpMessages);


                // Embeded data from fields, default to the current values if not specified
                const formerSubtopic = subtopicFieldID.split("-").slice(1).join("-") || subtopic;
                const formerTitle = titleFieldID.split("-").slice(1).join("-") || title;

                // Make sure topic exists
                if (!subtopics.includes(subtopic)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }

                // Make sure the title does not already exist (unless it's an edit AND it's going into the same file)
                const tilesInNewLocation = getHelpMessageTitlesArray(subtopic);
                if (
                    // If this title already exists where we're trying to put it and we are create a new post
                    (tilesInNewLocation.includes(title) && !isEditing) ||
                    // Or if we're editing, and the subtopic changed
                    (tilesInNewLocation.includes(title) && isEditing && formerSubtopic != subtopic) ||
                    // Or if we're editing, the subtopic did not changed, but the name has (possibly mimicking another entry)
                    (tilesInNewLocation.includes(title) && isEditing && formerSubtopic == subtopic && title != formerTitle)
                ) {
                    cmd.reply({ content: "A Help Message already exists with that title in that location.", ephemeral: true })
                    break;
                }

                // Add / edit message
                if (isEditing) editHelpMessage(subtopic, title, message, formerTitle, formerSubtopic)
                else appendHelpMessage(subtopic, title, message);

                cmd.reply({ content: `${isEditing ? "This" : "Your"} Help Message has been ${isEditing ? "edited" : "added"}, thanks!`, ephemeral: true })
                break;
        }
    }

    // Command interactions
    else {
        switch(cmd.commandName) {
            case "admin":
                const ephemeral = cmd.options.getBoolean("private");

                if (cmd.user.id !== process.env.owner && !storage?.admins?.includes(cmd.user.id)) {
                    return cmd.reply({content:"You are not authorized to run this command", ephemeral})
                }

                const adminInput = cmd.options.getString("input");
                const adminChoice = cmd.options.getString("choice");

                switch (adminChoice) {
                    case "Adminize ID":
                    case "Whitelist ID":
                        var type = adminChoice == "Adminize ID" ? "admins" : "creators"
                        if (!adminInput.match(/^\d+$/)) {
                            return cmd.reply({content:"This command expects a discord ID of the user", ephemeral})
                        }
                        let newUsers = (storage?.[type] || []).concat(adminInput);
                        newUsers = [...new Set(newUsers)] // filter duplicates
                        storage[type] = newUsers;
                        return cmd.reply({content:"This user has been whitelisted", ephemeral})

                    case "Unadminize ID":
                    case "Unwhitelist ID":
                        var type = adminChoice == "Unadminize ID" ? "admins" : "creators"
                        storage[type] = (storage?.[type] || []).filter(element => element !== item);
                        return cmd.reply({content:"This user has been removed from the whitelisted", ephemeral})

                    case "AI Pings Killswitch":
                        storage.AIPings = !storage.AIPings;
                        return cmd.reply({content:`AI ping responses have been ${storage.AIPings ? "enabled" : "disabled"}`, ephemeral})

                    case "AI AutoHelp Killswitch":
                        storage.AIAutoHelp = adminInput ? adminInput : false;
                        return cmd.reply({content:`AI AutoHelp has been ${adminInput ? `set to guild ${adminInput}` : `disabled`}`, ephemeral})

                    case "Dup Notif Killswitch":
                        storage.dupeNotifs = !storage.dupeNotifs;
                        return cmd.reply({content:`Duplicate question notifs have been ${storage.dupeNotifs ? "enabled" : "disabled"}`, ephemeral})

                    case "Restart":
                        if (ephemeral) {
                            await cmd.reply({ content: "Restarting...", ephemeral: true });
                            storage.restartData = null; // Don't try to update ephemeral messages
                        } else {
                            // For non-ephemeral messages, we need to send and store the message data
                            const message = await cmd.reply({ content: "Restarting...", ephemeral: false, withResponse: true });
                            storage.restartData = {
                                restartedAt: Date.now(),
                                channelId: cmd.channel.id,
                                messageId: message.id || message.interaction?.responseMessageId
                            };
                        }
                        console.log("Restarting...")
                        process.exit(0);
                }
                break

            case "help":
                // This command only works if it is installed in the server
                if (!cmd.guild) {
                    return cmd.reply({ content: "This command only works when the bot is installed in the server", ephemeral: true });
                }

                var chart = cmd.options.getString("chart");;
                const who = cmd.options.getUser("who") || cmd.user;

                var [mermaidPath, error] = await getPathToFlowchart(chart, true); // only fetching mermaid path
                if (error) {
                    cmd.reply({ content: error, ephemeral: true });
                    break
                }

                // Parse out the first question
                let mermaidJSON;
                try {
                    mermaidJSON = require(mermaidPath);
                } catch {
                    return cmd.reply({ content: "Sorry, this chart has malformed JSON.", ephemeral: true });
                }
                const [questionData, answersArray] = getQuestionAndAnswers(mermaidJSON)

                // Pack current data to history cache
                storage.cache[who.id] = {}
                storage.cache[who.id].helpHistory = []
                storage.cache[who.id]?.helpHistory.push([questionData, answersArray, cmd.id])

                // Now for building the embed
                const templateColor = parseInt(mermaidJSON.config?.color?.replaceAll("#", "") || "dd8836", 16)

                const [ flowchart, _ ] = await getPathToFlowchart(chart)
                const flowchartAttachment = new AttachmentBuilder(flowchart, { name: 'flowchart.png' });

                const embed = new EmbedBuilder()
                    .setColor(templateColor)
                    .setTitle(`Flowchart Walkthrough: \`${chart}\``)
                    .setThumbnail(`attachment://flowchart.png`)
                    .addFields(
                        // Instructions
                        { name: "Instructions", value: `Please answer these questions:` },
                        { name: '\n', value: '\n' },
                        // Question
                        { name: "Question:", value: postProcessForDiscord(questionData?.question, cmd.guild) },
                        { name: '\n', value: '\n' },
                        { name: '\n', value: '\n' },
                    )
                    .setFooter({ text: `Interaction ${cmd.id}`, iconURL: who.displayAvatarURL() });


                // Parse buttons - Each button's ID will be the AnswerID
                //                 The first button's ID will always always have "|<content>",
                //                 where content is a json payload of userID and questionID
                const buttons = [];
                for (let i = 0; i < answersArray.length; i++) {
                    const answer = answersArray[i];
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(""+answer)
                            .setLabel(""+answer)
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                // Inject the JSON data into the first button ID
                if (buttons[0]) buttons[0].data.custom_id += "|" + JSON.stringify({
                    id: who.id,
                    questionID: questionData?.questionID,
                    chart,
                })

                // Cool concept of spreading it here but doesn't work when we hit a reply with only one button...
                // buttons.map(buttonData => {
                //     buttonData.custom_id += "|"
                //     const availableSpace = 100 - buttonData.custom_id.length;
                //     buttonData.custom_id += context.slice(0, availableSpace)
                //     context = context.slice(availableSpace);
                // })

                // Split buttons into rows of 5 (discord max)
                const rows = [];
                for (let i = 0; i < buttons.length; i += 5) {
                    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
                }

                // Send
                await cmd.reply({
                    content: `<@${who.id}>`,
                    embeds: [embed],
                    components: rows,
                    files: [ flowchartAttachment ]
                });

                break;

            case "lookup":
                const subtopic = cmd.options.getSubcommand();
                const messageTopic = cmd.options.getString("title");

                // Lookup response to this query
                const reply = getHelpMessageBySubjectTitle(subtopic, messageTopic);

                cmd.reply({ content: reply, ephemeral: true });
                break;

            case "flowchart":
                await cmd.deferReply(); // Puppeteer can take a while, this gives us much longer to respond
                var chart = cmd.options.getString("chart");
                const overrideCacheAttempt = cmd.options.getBoolean("override-cache")
                const overrideCache = overrideCacheAttempt && isCreator(cmd.user.id);
                const sendHTML = cmd.options.getBoolean("attach-html")

                var [chartPath, error] = await getPathToFlowchart(chart, false, sendHTML, overrideCache);
                if (error) {
                    cmd.followUp({ content: error, ephemeral: true });
                    break;
                }

                var response = `Here is the \`${chart}\` chart`;
                // Add message if user tried to flush cache without perms
                if (overrideCacheAttempt != overrideCache) {
                    response += ` - cached was not overridden as you are not authorized to do so`
                }

                let files = [
                    new AttachmentBuilder(chartPath),
                ]
                if (sendHTML) files.push( new AttachmentBuilder(`./Flowcharts/generated.html`) ) // ideally the path would be determined by flowcharter.js, oh well

                cmd.followUp({
                    content: response,
                    files: files,
                    ephemeral: false
                });
                break;

            case "edit_flowchart":
                if (!isCreator(cmd.user.id)) {
                    return cmd.reply({ content: "You are not authorized to use this command", ephemeral: true });
                }
                const fileUpload = cmd.options.getAttachment("file");
                var chart = cmd.options.getString("chart");
                var [chartPath, error] = await getPathToFlowchart(chart, true); // only fetching mermaid path
                if (error) {
                    cmd.reply({ content: error, ephemeral: true });
                    break;
                }

                // If we have the file, we use it - otherwise, send the user the current file
                if (fileUpload) {
                    // // Error catching ideas, but might take more in depth function editing. Might be unecessary with the new processing method
                    // cmd.deferReply({ ephemeral: true });
                    // let hadError = false;
                    // try {
                    //     downloadFile(fileUpload.url, chartPath)
                    //     var [chartPath, error] = await getPathToFlowchart(chart, false, sendHTML, overrideCache);
                    //     if (error) hadError = true;
                    // } catch {
                    //     hadError = true;
                    // }

                    downloadFile(fileUpload.url, chartPath);
                    cmd.reply({
                        content: `The chart has been updated`, 
                        ephemeral: true
                    });
                } else {
                    let mermaidJSON = fs.readFileSync(chartPath);
                    // let mermaidJSON = require(chartPath);
                    cmd.reply({
                        content: 
                            `Here is the current \`${chart}\` flowchart`,
                            // + `## Flowchart must follow these rules:` +
                            // `1. Every "Question" has either:` +
                            // `   a. Named lines as options, going to the next questions` +
                            // `   b. Unnamed lines going to the next options, which each have a single link to the next question` +
                            // `2. All nodes must have IDs`,
                        files: [ 
                            new AttachmentBuilder(mermaidJSON, { name: `${chart}.txt` })
                        ],
                        ephemeral: true
                    });
                }
                break;

            case "edit": //both edit and create open basically the same modals
            case "create":
                const isEditing = cmd.commandName == "edit";

                // Check authorization
                if (!isCreator(cmd.member?.user?.id)) {
                    cmd.reply({ content: `You are not authorized to ${isEditing ? "edit" : "create"} messages.`, ephemeral: true })
                    break;
                }

                // Check if it's a valid topic
                const createSubtopic = cmd.options.getString("subtopic");
                const subtopics = Object.keys(storage.helpMessages);
                if (!subtopics.includes(createSubtopic)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }

                // Create a modal
                const modal = new ModalBuilder()
                    .setCustomId(isEditing ? "editModal" : "createModal")
                    .setTitle(`"${isEditing ? "Edit a" : "Create a new"} Help Message"`);
                
                const title = new TextInputBuilder()
                    .setCustomId("T-") // we embed more data here later if editing
                    .setLabel("Title")
                    .setPlaceholder("Turret Remove Guide Card")
                    .setMaxLength(49)
                    .setStyle(TextInputStyle.Short);

                const category = new TextInputBuilder()
                    .setCustomId("S-"+createSubtopic) // We embed the subtopic in the ID in case it's changed so we can know which file the message came from (if moving from one stopic to another)
                    .setLabel("Subtopic")
                    .setPlaceholder("ide")
                    .setValue(createSubtopic)
                    .setStyle(TextInputStyle.Short);

                const message = new TextInputBuilder()
                    .setCustomId("Message")
                    .setLabel("Message")
                    .setPlaceholder("## You can use *Markdown*")
                    .setStyle(TextInputStyle.Paragraph);

                // If we're editing, lookup and set the values of each field so they don't have to be reentered to edit
                if (isEditing) {
                    // Fill title field
                    const titleToEdit = cmd.options.getString("title").match(/[\s\w\/&\(\)]/g).join(""); // Filter out special characters before using as custom ID - TODO this would be better placed in helpFileParse to keep regexes togetehr
                    title.setValue(titleToEdit);
                    title.setCustomId("T-"+titleToEdit)

                    // Confirm it is a valid title
                    if (!getHelpMessageTitlesArray(createSubtopic).includes(titleToEdit)) {
                        cmd.reply({ content: "No Help Message exists with that title.", ephemeral: true })
                        break;
                    }

                    // Fill in message feild with current version
                    const messageContent = getHelpMessageBySubjectTitle(createSubtopic, titleToEdit);
                    message.setValue(messageContent);
                }
        
                const categoryRow = new ActionRowBuilder().addComponents(category);
                const titleRow = new ActionRowBuilder().addComponents(title);
                const messageRow = new ActionRowBuilder().addComponents(message);
                modal.addComponents(categoryRow, titleRow, messageRow);
        
                await cmd.showModal(modal);
                break;

            case "mark-robot":
                // Mark Robot takes a few seconds so we can't reply right away
                await cmd.deferReply({ ephemeral: true });

                const userID = cmd.member.user.id;

                const robotMessage = cmd.options.getString("message");
                const shouldClear = cmd.options.getBoolean("clear") || false;

                // Create a Robot instance for this user if they don't have one already
                if (shouldClear || !storage.cache.markRobotInstances[userID]) {
                    storage.cache.markRobotInstances[userID] = new MarkRobot({"useDevVersion":true});
                }

                // Get response from Mark Robot
                var response = await storage.cache.markRobotInstances[userID].message(robotMessage);

                cmd.editReply(response);
                break;
        }
    }
})

// Message handlers for Mark RoBot pings + auto AI
client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // Ignore bot messages

    // Fetch replied to message if it wasn't already fetched
    let repliedMessage = message.referenceData; // just where I want to store it
    if (!repliedMessage && message.reference) {
        repliedMessage = message.referenceData = await message.channel.messages.fetch(message.reference.messageId)
    }

    ////// Mark Robot pings
    if (message.mentions.has(client.user)) {
        // Check if we've disabled RoBot
        if (!storage.AIPings && !storage?.admins.includes(message.author.id)) return;

        message.channel.sendTyping()

        // If the bot said something that was replied to, make sure it is in this user's bot history 
        //   (if they are replying to a message from someone else, we inject it into the history so that RoBot sees it)
        let repliedToAuthor, repliedToMessage;
        if (message.reference) {
            repliedToMessage = markRobotMessagePostProcess(repliedMessage.content, message.guild);
            // post-process usernames for mark robot
            if (repliedMessage.author.id === client.user.id) {
                repliedToAuthor = "you"
            } else {
                repliedToAuthor = repliedMessage.author.username;
            }
        }

        const messageContentForRobot = markRobotMessagePostProcess(message.content, message.guild);

        // Grab / create history - history is reset every new channel you talk to him in
        let userHistory = storage.cache.markRobotPingsCache[message.author.id] || { 
            lastChatLoc: "", 
            markRobot: new MarkRobot({"useDevVersion":true}) 
        };

        if (message.channelId !== userHistory.lastChatLoc)
            userHistory = { 
                lastChatLoc: "", 
                markRobot: new MarkRobot({"useDevVersion":true}) 
            };

        // Get RoBot's reply
        const robotsReply = await userHistory.markRobot.message(messageContentForRobot, repliedToMessage, repliedToAuthor)

        // Store for the cases where we lose the reference
        storage.cache.markRobotPingsCache[message.author.id] = userHistory

        // Finally, send RoBot reply
        message.reply(robotsReply);
    }

    ////// AutoReply AI
    AutoReplyAI.messageHandler(message);

    ////// Repeat messages notices
    const authorID = message.author.id;
    repeatQuestions[authorID] = repeatQuestions[authorID] || [] //{message: "", channelID: 0, repeats: 0}

    // Find/create message
    let existingQuestion = repeatQuestions[authorID].find(q => areTheSame(message.content, q.message));
    if (existingQuestion) {
        if (existingQuestion.channelID !== message.channel.id && existingQuestion.guildId == message.guildId) {
            // If this is a different channel, increment it
            existingQuestion.repeats += 1;
        }
        existingQuestion.channelID = message.channel.id
        existingQuestion.guildId = message.guildId
    } else {
        existingQuestion = { 
            guildId: message.guildId,
            message: message.content, 
            channelID: message.channelId, 
            repeats: 1,
            originalLink: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}` 
        }
        repeatQuestions[authorID].push(existingQuestion);
    }
    
    // Only keep the latest 3 messages from each user to check if duplicated
    if (repeatQuestions[authorID].length > 3) {
        repeatQuestions[authorID].shift();
    }

    // Now, if this message meets specific conditions, we'll reference the original one.
    const normalizedContent = message.content.toLowerCase().replace("'", "");
    if (
        storage.dupeNotifs &&
        existingQuestion.guildId == message.guildId &&
        existingQuestion.repeats > 1 &&
        message.content.length >= 30 &&
        isHelpRequest(normalizedContent)
    ) {
        try {
            // Make sure the original wasn't deleted before commenting
            const originalChannelId = existingQuestion.originalLink.split('/')[5];
            const originalChannel = await client.channels.fetch(originalChannelId);
            const originalMessage = await originalChannel.messages.fetch(existingQuestion.originalLink.split('/').pop());
            if (originalMessage) {
                message.reply(`-#  <:info:1330047959806771210> This appears to be a duplicate question. The original question was asked here ${existingQuestion.originalLink}`);
            }
        } catch (error) {
            // If the original message was deleted, set this message as the original
            existingQuestion.repeats = 1;
            existingQuestion.originalLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
        }
    }
});

// Other listeners
client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    try {
        const restartUpdateThreshold = 20000;
        const rebootData = storage.restartData;
        
        if (!rebootData) return;
        
        const { restartedAt, channelId, messageId } = rebootData;
        const timeSinceRebootCommand = Date.now() - restartedAt;
        console.log(`Last restarted ${timeSinceRebootCommand/1000} seconds ago`);
        
        if (messageId && timeSinceRebootCommand < restartUpdateThreshold) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (!channel) {
                    console.log("Channel not found");
                    return;
                }
                
                const message = await channel.messages.fetch(messageId || "0");
                if (!message) {
                    console.log("Message not found");
                    return;
                }
                
                await message.edit({
                    content: `Restarting... done - took ${(timeSinceRebootCommand/1000).toFixed(2)} seconds`
                });                
                
            } catch (error) {
                console.error("Error updating restart message:", error);
            }
        } else {
            console.log("Restart message is too old")
        }

        // Clear restart data after booting
        storage.restartData = null;
    } catch (error) {
        console.error("Error in ready event:", error);
    }
});

// Handle message reactions for help message creators/admins
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Fetch partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
        }
    }

    if (['❌', '👎', ":x:", ":thumbsdown:"].includes(reaction.emoji.name)) {
        // Check if message is from the bot
        if (reaction.message.author.id !== client.user.id) return;

        // Check if reactor is creator/admin
        if (!isCreator(user.id) && !storage?.admins?.includes(user.id)) return;

        // If those conditions are met, delete the message.
        try {
            await reaction.message.delete();
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
});


//#endregion Handlers

// Error handling (async crashes in discord.js threads can still crash it)
const handleException = (e) => console.log(e); // TODO: notify myself through webhooks
process.on('unhandledRejection', handleException);
process.on('unhandledException', handleException);

// Start
client.login(process.env.token);
