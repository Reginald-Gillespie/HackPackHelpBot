process.env = require("./env.json");
const { REST, Routes, PermissionFlagsBits, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, ChannelType } = require('discord.js');
const fs = require("fs");
const { getDescription, getHelpMessageTitlesArray, getFileContent } = require("./helpFileParse")

// Command registration stuff
const Context_UserOnly = [2]
const Integration_UserOnly = [1]
const extraInfo = {
	"lookup": { "contexts": [0,1,2], "integration_types": [0,1] },
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

// Build the lookup command based on the files we have
var lookupCommand = new SlashCommandBuilder().setName("lookup").setDescription("Lookup Command");
subtopics.forEach(topic => {
	lookupCommand.addSubcommand(command =>
		command.setName(topic).setDescription(subtopicDescriptions[topic]).addStringOption(option=>
			option.setName("title").setDescription("The help message to lookup").setAutocomplete(true).setRequired(true)
		)
	)	
})

// Build commands, assign registration info, register 
const commands = [
	lookupCommand
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