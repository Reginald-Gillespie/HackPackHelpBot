process.env=require("./env.json");
var client;
const {Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, ActivityType, PermissionFlagsBits, DMChannel, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType,AuditLogEvent, StringSelectMenuBuilder, StringSelectMenuOptionBuilder}=require("discord.js");
const fs=require("fs");
const cmds = require("./commands.json");
const { getDescription, getHelpMessageTitlesArray, getHelpMessageBySubjectTitle, getFileContent, appendHelpMessage, getSubtopics } = require("./helpFileParse")
const subtopics = getSubtopics();
const Fuse = require('fuse.js');
const fuseOptions = {
    includeScore: true,
    keys: ['title']
};
const MessageCreators = [
    "724416180097384498",  // myself
    "1229105394849284127", // dan
    "1242930479439544461", // tom
    "1233957025256570951", // ashbro

]; // userIDs of those allowed to create help messages with the bot

// 
// If this is to be more widely used than just me and one or two other people, 
//  it should cache files, as well as Fuse instances. 
// If a command is then added to change the help files, clear cache / pull in new files so it is visible right away. 
// Also include a mod command to clear cache (in case files are changed directly)
// 

// 
// Ideas:
// Command to upload photos of different parts of each box?
// Mark Robot command
// 



// Register client
client = new Client({
    intents: 0,
    partials: Object.keys(Partials).map(a=>Partials[a])
});


// Utility functions
function arrayToAutocorrect(array) {
    const autocompletes = [];
    array.forEach( title => {
        autocompletes.push({
            name: title, // What is shown to the user
            value: title // What is actually entered
        })
    })

    // TODO: I don't actually know if there is a limit here. Probably 25, limit reply to that much

    return autocompletes;
}

// The meat of the code
client.on("interactionCreate", async cmd => {
    console.log(cmd?.member?.user?.username || cmd);
    
    // Autocomplete interactions are requesting what to suggest to the user to put in a command's string option
    if (cmd.isAutocomplete()) {
        const typedSoFar = cmd.options.getFocused() || "";

        switch(cmd.commandName) {
            case "lookup":
                const subtopic = cmd.options.getSubcommand();
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
            
            case "create":
                const options = subtopics.filter(subtopic => subtopic.startsWith(typedSoFar));
                cmd.respond(arrayToAutocorrect(options))
                break;
        }
    }

    // Modal submot interactions from creating and editing messages
    else if (cmd.isModalSubmit()) {
        switch(cmd.customId) {
            case "createModal":
                const title = cmd.fields.getTextInputValue('Title');
                const subtopic = cmd.fields.getTextInputValue('Subtopic');
                const message = cmd.fields.getTextInputValue('Message');
            
                if (!subtopics.includes(subtopic)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }

                appendHelpMessage(subtopic, title, message);
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

            case "create":
                // Check authorization
                if (!MessageCreators.includes(cmd.member?.user?.id)) {
                    cmd.reply({ content: "You are not authorized to create messages.", ephemeral: true })
                    break;
                }

                // Check if it's a balid topic
                const messageTopicCreate = cmd.options.getString("subtopic");
                if (!subtopics.includes(messageTopicCreate)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }

                // Create a modal
                const modal = new ModalBuilder()
                    .setCustomId("createModal")
                    .setTitle("Create a new Help Message");
                
                const title = new TextInputBuilder()
                    .setCustomId("Title")
                    .setLabel("Title")
                    .setPlaceholder("Turret Remove Guide Card")
                    .setStyle(TextInputStyle.Short);

                const category = new TextInputBuilder()
                    .setCustomId("Subtopic")
                    .setLabel("Subtopic")
                    .setPlaceholder("ide")
                    .setValue(messageTopicCreate) // this is here in case they need to move it and to be consistant with the edit screen
                    .setStyle(TextInputStyle.Short);

                const message = new TextInputBuilder()
                    .setCustomId("Message")
                    .setLabel("Message")
                    .setPlaceholder("## You can use *Markdown*")
                    .setStyle(TextInputStyle.Paragraph);
        
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
