process.env=require("./env.json");
var client;
const {Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, ActivityType, PermissionFlagsBits, DMChannel, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType,AuditLogEvent, StringSelectMenuBuilder, StringSelectMenuOptionBuilder}=require("discord.js");
const fs=require("fs");
const cmds = require("./commands.json");
const subtopics = fs.readdirSync("./GeneralTopicStore");
const { getDescription, getHelpMessageTitlesArray, getHelpMessageBySubjectTitle, getFileContent } = require("./helpFileParse")
const Fuse = require('fuse.js');
const fuseOptions = {
    includeScore: true,
    keys: ['title']
};

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


// The meat of the code
client.on("interactionCreate", async cmd => {
    console.log(cmd?.member?.user?.username || cmd);
    
    // Autocomplete interactions are requesting what to suggest to the user to put in a command's string option
    if (cmd.isAutocomplete()) {
        const subtopic = cmd.options.getSubcommand();
        const helpFile = getFileContent(subtopic);
        var helpMessagesTitles = getHelpMessageTitlesArray(helpFile)

        // Now we're going to filter our suggestions by similar the things are to what they've typed so far
        const typedSoFar = cmd.options.getFocused() || "";
        if (typedSoFar) { // only refine if they've started typing
            const fuse = new Fuse(helpMessagesTitles.map(title => ({ title })), fuseOptions);            
            const scoredResults = fuse.search(typedSoFar).sort((a, b) => a.score - b.score);
            helpMessagesTitles = scoredResults.map(entry => entry.item.title);
        }
        
        // We need to format the filtered results as a JSON object
        const autocompletes = [];
        helpMessagesTitles.forEach( title => {
            autocompletes.push({
                name: title, // What is shown to the user
                value: title // What is actually entered
            })
        })

        // TODO: I don't actually know if there is a limit here. Probably 25, limit reply to that much

        cmd.respond(autocompletes);
    }

    // Other interactions are commands
    else {
        switch(cmd.commandName) {
            case "lookup":
                const subtopic = cmd.options.getSubcommand();
                const messageTopic = cmd.options.getString("title");

                // Lookup response to this query
                const reply = getHelpMessageBySubjectTitle(subtopic, messageTopic);
                
                cmd.reply(reply);
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
