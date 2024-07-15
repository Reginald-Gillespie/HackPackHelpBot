// TODO:
// Check for message under current name before adding / moving
// If I want to add per-user storage, storage create messages from users if they are failed and insert them as starting point when they run create again.
// Limit autocomplete reply to max responses
// Lots of other limiting char counts
// Editing Help Message title... (this requires tracking old title, maybe assining an ID to each message to fit char count)
// 


process.env=require("./env.json");
var client;
const {Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, ActivityType, PermissionFlagsBits, DMChannel, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType,AuditLogEvent, StringSelectMenuBuilder, StringSelectMenuOptionBuilder}=require("discord.js");
const fs=require("fs");
const cmds = require("./commands.json");
const { getDescription, getHelpMessageTitlesArray, getHelpMessageBySubjectTitle, getFileContent, appendHelpMessage, editHelpMessage, getSubtopics } = require("./helpFileParse")
const subtopics = getSubtopics();
const Fuse = require('fuse.js');
const fuseOptions = {
    includeScore: true,
    keys: ['title']
};
const MessageCreators = [
    "724416180097384498",  // myself
    "1233957025256570951", // ashbro
    "1229105394849284127", // dan
    "1242930479439544461", // tom
    "703724617583296613",  // mark lol
]; // userIDs of those allowed to create help messages with the bot


//
// If this is to be more widely used than just me and one or two other people, 
//  it should cache files, as well as Fuse instances. 
// If a command is then added to change the help files, clear cache / pull in new files so it is visible right away. 
// Also include a mod command to clear cache (in case files are changed directly)
// 



// 
// Ideas:
// Command to upload photos from photo database of different parts of each box?
// Mark Robot command
// 



// Register client
client = new Client({
    intents: 0,
    partials: Object.keys(Partials).map(a=>Partials[a])
});


// Utility functions
function arrayToAutocorrect(array) {
    return array.map(choice => {
        return {
            "name": choice,
            "value": choice
        }
    });
    // TODO: I don't actually know if there is a limit here. Probably 25, limit reply to that much
}

// The meat of the code
client.on("interactionCreate", async cmd => {
    console.log(cmd?.member?.user?.username || cmd);
    
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

        }
    }

    // Modal submot interactions from creating and editing messages
    else if (cmd.isModalSubmit()) {
        switch(cmd.customId) {
            case "editModal":
            case "createModal":
                const isEditing = cmd.customId == "editModal";

                const title = cmd.fields.getTextInputValue('Title');
                const message = cmd.fields.getTextInputValue('Message');

                // The subtopic may have other data (the previous subtopic if this is an edit) embeded in it after a hyphen ( currentSTopic-formerSTopic ) 
                const modalFields = cmd.fields.fields.map(field => field.customId);
                const subtopicFieldID = modalFields.filter(field => field.startsWith("Subtopic"))[0];
                const formerSubtopic = subtopicFieldID.split("-")[1];

                // Now we can actually grab the subtopic provided
                const subtopic = cmd.fields.getTextInputValue(subtopicFieldID);
            
                if (!subtopics.includes(subtopic)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }

                if (isEditing) editHelpMessage(subtopic, title, message, formerSubtopic)
                else appendHelpMessage(subtopic, title, message);

                cmd.reply({ content: "Your Help Message has been added, thanks!", ephemeral: true })
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
                    .setCustomId("Title")
                    .setLabel("Title")
                    .setPlaceholder("Turret Remove Guide Card")
                    .setStyle(TextInputStyle.Short);

                const category = new TextInputBuilder()
                    .setCustomId("Subtopic-"+createSubtopic) // We embed the subtopic in the ID in case it's changed so we can know which file the message came from (if moving from one stopic to another)
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
                    const titleToEdit = cmd.options.getString("title");
                    title.setValue(titleToEdit);

                    // Confirm it is a valid title
                    console.log(getHelpMessageTitlesArray(createSubtopic));
                    console.log(createSubtopic);
                    console.log(titleToEdit);
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
