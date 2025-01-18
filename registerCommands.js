// Helper file to manage discord settings and stuff

process.env = require("./env.json");
const { REST, Routes, PermissionFlagsBits, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, ChannelType } = require('discord.js');
const fs = require("fs");
const { getDescription, getHelpMessageTitlesArray, getFileContent } = require("./helpFileParse")

// Command registration stuff
const Context_UserOnly = [2]
const Integration_UserOnly = [1]
const extraInfo = { // makes these commands useable too users who install the bot in any server
	"lookup": { "contexts": [0,1,2], "integration_types": [0,1] },
	"create": { "contexts": [0,1,2], "integration_types": [0,1] },
	"edit": { "contexts": [0,1,2], "integration_types": [0,1] },
	"mark-robot": { "contexts": [0,1,2], "integration_types": [0,1] },
	"edit_flowchart": { "contexts": [0,1,2], "integration_types": [0,1] },
	"flowchart": { "contexts": [0,1,2], "integration_types": [0,1] },
	"admin": { "contexts": [0,1,2], "integration_types": [0,1] },
	"help": { "contexts": [0,1,2], "integration_types": [0,1] },
};

// Gather files and metadata
const subtopics = fs.readdirSync("./GeneralTopicStore");
const subtopicDescriptions = {};
const helpMessagesList = {}; // {'filename': ['how to do x', 'how to do y']}
subtopics.forEach( file => { // Read file and parse out topic descriptions for commands
	const fileContent = getFileContent(file);
	subtopicDescriptions[file] = getDescription(fileContent);
	helpMessagesList[file] = getHelpMessageTitlesArray(fileContent)
})

// Build a lookup command for each topic file
var lookupCommand = new SlashCommandBuilder().setName("lookup").setDescription("Lookup Command");
subtopics.forEach(topic => {
	lookupCommand.addSubcommand(command =>
		command.setName(topic).setDescription(subtopicDescriptions[topic]).addStringOption(option=>
			option.setName("title").setDescription("The Help Message to lookup").setAutocomplete(true).setRequired(true)
		)
	)	
})

let createOption = o => ({"name":o,"value":o});

// Create other commands
var adminCommand = new SlashCommandBuilder().setName("admin").setDescription("Quick access admin options")
	.addStringOption(option=>
		option.setName("choice").setDescription("Admin command").addChoices(
			createOption("Whitelist ID"),
			createOption("Unwhitelist ID"),
			createOption("Adminize ID"),
			createOption("Unadminize ID"),
			createOption("AI Pings Killswitch"),
			createOption("Dup Notif Killswitch"),
			createOption("Restart"),
		).setRequired(true)
	)
	.addStringOption(option=>
		option.setName("input").setDescription("Command input, if needed").setRequired(false)
	)
	.addBooleanOption(option=>
		option.setName("private").setDescription("Make response ephemeral").setRequired(false)
	)


var createCommand = new SlashCommandBuilder().setName("create").setDescription("Create new Help Message to store in the bot")
	.addStringOption(option=>
		option.setName("subtopic").setDescription("The category this Help Message fits under").setAutocomplete(true).setRequired(true)
	)

var editCommand = new SlashCommandBuilder().setName("edit").setDescription("Edit an existing Help Message")
	.addStringOption(option=>
		option.setName("subtopic").setDescription("The category this Help Message fits under").setAutocomplete(true).setRequired(true)
	)
	.addStringOption(option=>
		option.setName("title").setDescription("The Help Message to edit").setAutocomplete(true).setRequired(true)
	)

var editFlowchartCommand = new SlashCommandBuilder().setName("edit_flowchart").setDescription("Edit a a flowchart")
	.addStringOption(option=>
		option.setName("chart").setDescription("The flowchart to edit").setAutocomplete(true).setRequired(true)
	)
	.addAttachmentOption(option =>
        option.setName('file').setDescription('The new mermaid flowchart as a text file').setRequired(false)
	)

var flowchartCommand = new SlashCommandBuilder().setName("flowchart").setDescription("Lookup the latest flowcharts for any box")
	.addStringOption(option=>
		option.setName("chart").setDescription("The chart to bring up").setAutocomplete(true).setRequired(true)
	)
	.addBooleanOption(option=>
		option.setName("attach-html").setDescription("Send the chart HTML with the response").setRequired(false)
	)
	.addBooleanOption(option=>
		option.setName("override-cache").setDescription("Recreate the chart ignoring the cached version").setRequired(false)
	)

var helpCommand = new SlashCommandBuilder().setName("help").setDescription("Walk a user through the a debugging flowcharts")
	.addStringOption(option=>
		option.setName("chart").setDescription("The chart to walk through").setAutocomplete(true).setRequired(true)
	)
	.addUserOption(option=>
		option.setName("who").setDescription("Select a user who should walk through this chart").setRequired(false)
	)

var markRobot = new SlashCommandBuilder().setName("mark-robot").setDescription("Chat with Mark Robot!")
	.addStringOption(option=>
		option.setName("message").setDescription("What to ask Mark Robot").setRequired(true)
	)
	.addBooleanOption(option=>
		option.setName("clear").setDescription("Start a new conversation").setRequired(false)
	)

// Build commands, assign registration info, register 
const commands = [
	adminCommand,
	lookupCommand,
	createCommand,
	editCommand,
	editFlowchartCommand,
	flowchartCommand,
	helpCommand,
	markRobot
].map(command => Object.assign(command.toJSON(), extraInfo[command.toJSON().name]));




// The following code was stolen from a friend (so that's why it doesn't have comments and isn't readable -s)
const rest = new REST({ version: '9' }).setToken(process.env.token);
var comms = {};
rest.put(Routes.applicationCommands(process.env.clientId), { body: commands }).then(d => {
	d.forEach(c => {
		comms[c.name] = {
			mention: `</${c.name}:${c.id}>`,
			id: c.id,
			name: c.name,
			description: c.description,
			contexts: c.contexts,
			integration_types: c.integration_types,
			type: c.type,
			default_member_permissions: c.default_member_permissions
		};
		if (c.hasOwnProperty("options")) {
			c.options.forEach(o => {
				if (o.type === 1) {
					comms[c.name][o.name] = {
						mention: `</${c.name} ${o.name}:${c.id}>`,
						id: c.id,
						name: o.name,
						description: o.description,
						contexts: c.contexts,
						integration_types: c.integration_types,
						type: o.type,
						default_member_permissions: c.default_member_permissions
					};
				}
			});
		}
	});
	fs.writeFileSync("./commands.json", JSON.stringify(comms));
	console.log("Updated commands on Discord and wrote commands to ./commands.json");
}).catch(console.error);