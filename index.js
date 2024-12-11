// TODO:
// Check for message under current name before adding / moving
// If I want to add per-user storage, storage create messages from users if they are failed and insert them as starting point when they run create again.
// Lots of other limiting char counts
// Command to upload photos from photo database of different parts of each box?
// 

process.env = require("./env.json");
var client;
const {Client, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Partials } = require("discord.js");
const fs = require("fs");
const { getDescription, getHelpMessageTitlesArray, getHelpMessageBySubjectTitle, getFileContent, appendHelpMessage, editHelpMessage, getSubtopics } = require("./helpFileParse")
const { getChartOptions, getPathToFlowchart } = require("./flowcharter")
const subtopics = getSubtopics();
const Fuse = require('fuse.js');
const fuseOptions = {
    includeScore: true,
    keys: ['title']
};
function sortByMatch(items, text) {
    if (!text) return items;
    const fuse = new Fuse(items.map(title => ({ title })), fuseOptions);            
    const scoredResults = fuse.search(text)
        .filter(result => result.score <= 2) // Roughly similar-ish
        .sort((a, b) => a.score - b.score);
    return scoredResults.map(entry => entry.item.title);
}


const MessageCreators = [// TODO: port to whitelist file with /whitelist devadmin command
    "724416180097384498",  // myself
    "1233957025256570951", // ashbro
    "1242941939662323774", // HeavyFalcon
    "1229105394849284127", // dan
    "1242930479439544461", // tom
    "703724617583296613",  // mark lol
]; // userIDs of those allowed to create help messages with the bot
const MarkRobot = require("./markRobot")
const markRobotInstances = {}; // Technically it would be good to clean old convos every week or so



//
// If this is to be more widely used than just me and one or two other people, 
//  it should cache files, as well as Fuse instances. 
// If a command is then added to change the help files, clear cache / pull in new files so it is visible right away. 
// Also include a mod command to clear cache (in case files are changed directly)
// 


// Register client
client = new Client({
    intents: 0,
    partials: Object.keys(Partials).map(a=>Partials[a])
});


// Utility functions
function arrayToAutocorrect(array) {
    const choices = array.map(choice => {
        return {
            "name": choice,
            "value": choice
        }
    });
    return choices.slice(0, 25); // Discord limit is 25 responses
}

// The meat of the code
var lastUser = "";
client.on("interactionCreate", async cmd => {
    const username = cmd?.member?.user?.username;
    if (username !== lastUser) {
        console.log(username);
        lastUser = username;
    }
    
    // Autocomplete interactions are requesting what to suggest to the user to put in a command's string option
    if (cmd.isAutocomplete()) {
        const field = cmd.options.getFocused(true);
        const typedSoFar = field.value;

        switch(field.name) { // we base the switch off what the the feild is, either a topic autocomplete or a title autocomplete
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

                const helpFile = getFileContent(subtopic);
                var helpMessagesTitles = getHelpMessageTitlesArray(helpFile)

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

    // Modal submot interactions from creating and editing messages
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

                // Embeded data from fields, default to the current values if not specified
                const formerSubtopic = subtopicFieldID.split("-").slice(1).join("-") || subtopic;
                const formerTitle = titleFieldID.split("-").slice(1).join("-") || title;
            
                // Make sure topic exists
                if (!subtopics.includes(subtopic)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }
                
                // Make sure the title does not already exist (unless it's an edit AND it's going into the same file)
                // TODO: cleanup logic when it isn't 11:30 PM lol
                const tilesInNewLocation = getHelpMessageTitlesArray(getFileContent(subtopic));
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
            case "lookup":
                const subtopic = cmd.options.getSubcommand();
                const messageTopic = cmd.options.getString("title");

                // Lookup response to this query
                const reply = getHelpMessageBySubjectTitle(subtopic, messageTopic);
                
                cmd.reply({ content: reply, ephemeral: true });
                break;

            case "edit": //both edit and create are similar enough
            case "create":
                const isEditing = cmd.commandName == "edit";

                // Check authorization
                if (!MessageCreators.includes(cmd.member?.user?.id)) {
                    cmd.reply({ content: `You are not authorized to ${isEditing ? "edit" : "create"} messages.`, ephemeral: true })
                    break;
                }

                // Check if it's a valid topic
                const createSubtopic = cmd.options.getString("subtopic");
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
                    if (!getHelpMessageTitlesArray(getFileContent(createSubtopic)).includes(titleToEdit)) {
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
                if (shouldClear || !markRobotInstances[userID]) {
                    markRobotInstances[userID] = new MarkRobot();
                }

                // Get response from Mark Robot
                var response = await markRobotInstances[userID].message(robotMessage);

                // cmd.reply({ content: response, ephemeral: true });
                cmd.editReply(response);
                break;
        }
    }
})



// Other listeners
client.once("ready",async ()=>{
    console.log("Ready");
})


// Error handling (async crashes in discord.js threads can still crash it)
function handleException(e) {
    console.log(e);
}
process.on('unhandledRejection', handleException);
process.on('unhandledException', handleException);

// Start
client.login(process.env.token);
