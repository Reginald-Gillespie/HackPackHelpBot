const { SlashCommandBuilder } = require('discord.js');
const utils = require('../modules/utils');
const { ConfigDB, dropAllReleventIndexes } = require('../modules/database');

const ADMIN_COMMANDS = {
    "whitelist-id": {
        requiresAdmin: true,
        name: "Whitelist ID",
        description: "Add a user ID to the creators whitelist",
        inputType: "user_id",
        inputDescription: "Discord user ID to whitelist",
        execute: async (config, input) => {
            if (!input?.match(/^\d+$/)) {
                return "This command expects a valid Discord user ID";
            }
            let newUsers = config.creators.concat(input);
            newUsers = [...new Set(newUsers)]; // filter duplicates
            config.creators = newUsers;
            return "User has been whitelisted as creator";
        }
    },
    "unwhitelist-id": {
        requiresAdmin: true,
        name: "Unwhitelist ID",
        description: "Remove a user ID from the creators whitelist",
        inputType: "user_id",
        inputDescription: "Discord user ID to remove from whitelist",
        execute: async (config, input) => {
            config.creators = config.creators.filter(element => element !== input);
            return "User has been removed from the creators whitelist";
        }
    },
    "adminize-id": {
        name: "Adminize ID",
        description: "Add a user ID to the admins list",
        inputType: "user_id",
        inputDescription: "Discord user ID to make admin",
        requiresAdmin: true,
        execute: async (config, input) => {
            if (!input?.match(/^\d+$/)) {
                return "This command expects a valid Discord user ID";
            }
            let newUsers = config.admins.concat(input);
            newUsers = [...new Set(newUsers)]; // filter duplicates
            config.admins = newUsers;
            return "User has been added to admins";
        }
    },
    "unadminize-id": {
        name: "Unadminize ID",
        description: "Remove a user ID from the admins list",
        inputType: "user_id",
        inputDescription: "Discord user ID to remove from admins",
        requiresAdmin: true,
        execute: async (config, input) => {
            config.admins = config.admins.filter(element => element !== input);
            return "User has been removed from admins";
        }
    },
    "view-creators": {
        name: "View Creators",
        description: "View all whitelisted creators",
        inputType: "none",
        execute: async (config) => {
            if (config.creators.length === 0) {
                return "No creators are currently whitelisted";
            }
            return `Whitelisted creators (${config.creators.length}):\n${config.creators.map(id => `• <@${id}> (${id})`).join('\n')}`;
        }
    },
    "view-admins": {
        requiresAdmin: true,
        name: "View Admins",
        description: "View all admin users",
        inputType: "none",
        execute: async (config) => {
            if (config.admins.length === 0) {
                return "No admins are currently set";
            }
            return `Admin users (${config.admins.length}):\n${config.admins.map(id => `• <@${id}> (${id})`).join('\n')}`;
        }
    },
    "ai-pings-killswitch": {
        name: "AI Pings Killswitch",
        description: "Toggle AI ping responses on/off",
        inputType: "none",
        execute: async (config) => {
            config.AIPings = !config.AIPings;
            return `AI ping responses have been ${config.AIPings ? "enabled" : "disabled"}`;
        }
    },
    "ai-autohelp-killswitch": {
        name: "AI AutoHelp Killswitch",
        description: "Set AI AutoHelp guild or disable it",
        inputType: "guild_id_or_false",
        inputDescription: "Guild ID to enable AutoHelp for, or 'false' to disable",
        execute: async (config, input) => {
            if (input === "false" || input === false) {
                config.AIAutoHelp = false;
                return "AI AutoHelp has been disabled";
            } else if (input?.match(/^\d+$/)) {
                config.AIAutoHelp = input;
                return `AI AutoHelp has been set to guild ${input}`;
            } else {
                return "Input must be a guild ID or 'false' to disable";
            }
        }
    },
    "ai-tagger-killswitch": {
        name: "AI Tagger Killswitch",
        description: "Toggle AI auto tagger on/off",
        inputType: "none",
        execute: async (config) => {
            config.autoTagger = !config.autoTagger;
            return `AI auto tagger has been ${config.autoTagger ? "enabled" : "disabled"}`;
        }
    },
    "dup-notif-killswitch": {
        name: "Dup Notif Killswitch",
        description: "Toggle duplicate notification system on/off",
        inputType: "none",
        execute: async (config) => {
            config.dupeNotifs = !config.dupeNotifs;
            return `Duplicate question notifications have been ${config.dupeNotifs ? "enabled" : "disabled"}`;
        }
    },
    "whitelist-tag": {
        name: "Whitelist Tag",
        description: "Add a tag to the allowed tags list",
        inputType: "tag_name",
        inputDescription: "Tag name to whitelist",
        execute: async (config, input) => {
            if (!input) {
                return "Tag name is required";
            }
            if (!config.allowedTags.includes(input)) {
                config.allowedTags.push(input);
                return "Tag has been added to whitelist";
            } else {
                return "This tag is already whitelisted";
            }
        }
    },
    "blacklist-tag": {
        name: "Blacklist Tag",
        description: "Remove a tag from the allowed tags list",
        inputType: "existing_tag",
        inputDescription: "Tag name to remove from whitelist",
        execute: async (config, input) => {
            const index = config.allowedTags.indexOf(input);
            if (index > -1) {
                config.allowedTags.splice(index, 1);
                return "Tag has been removed from whitelist";
            } else {
                return "Tag was not found in whitelist";
            }
        }
    },
    "restart": {
        requiresAdmin: true,
        name: "Restart",
        description: "Restart the bot",
        inputType: "none",
        execute: async (config, input, cmd) => {
            const ephemeral = cmd.options.getBoolean("private");

            if (ephemeral) {
                await cmd.reply({ content: "Restarting...", ephemeral: true });
                config.restartData = null; // Don't try to update ephemeral messages
            } else {
                const message = await cmd.reply({ 
                    content: "Restarting...", 
                    ephemeral: false, 
                    fetchReply: true, 
                    allowedMentions: { parse: [] } 
                });
                
                config.restartData = {
                    restartedAt: Date.now(),
                    channelId: cmd.channel.id,
                    messageId: message.id
                };
            }

            console.log("Restarting...");
            await config.save();
            process.exit(0);
        }
    },
    "drop-indexes": {
        requiresAdmin: true,
        name: "Drop Indexes",
        description: "Drop all relevant database indexes",
        inputType: "none",
        execute: async () => {
            await dropAllReleventIndexes();
            return "Database indexes have been dropped";
        }
    }
};

// Autocompletion choices for different input types
const AUTOCOMPLETE_CHOICES = {
    "guild_id_or_false": [
        { name: "Disable (false)", value: "false" },
        { name: "Or a Guild ID...", value: "" }
    ],
    "user_id": [
        { name: "Input User ID", value: "" }
    ],
    "boolean": [
        { name: "True", value: "true" },
        { name: "False", value: "false" }
    ],
    "none": [
        { name: "No Input Needed", value: "" },
    ]
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("admin")
        .setDescription("Quick access admin options")
        .addStringOption(option =>
            option.setName("choice")
                .setDescription("Admin command to execute")
                .addChoices(
                    ...Object.entries(ADMIN_COMMANDS).map(([key, cmd]) => ({
                        name: cmd.name,
                        value: key
                    }))
                )
                .setRequired(true)
                .setAutocomplete(false)
        )
        .addStringOption(option =>
            option.setName("input")
                .setDescription("Command input, if needed")
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addBooleanOption(option =>
            option.setName("private")
                .setDescription("Make response ephemeral")
                .setRequired(false)
        ),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'input') {
            const choice = interaction.options.getString('choice');
            const command = ADMIN_COMMANDS[choice];

            if (!command) return;

            let choices = [];

            // Handle different input types for autocompletion
            switch (command.inputType) {
                // Define edge cases
                case "existing_tag":
                    // Get current allowed tags for autocompletion
                    try {
                        const config = await ConfigDB.findOne({});
                        if (config && config.allowedTags) {
                            choices = config.allowedTags
                                .filter(tag => tag.toLowerCase().includes(focusedOption.value.toLowerCase()))
                                .slice(0, 25)
                                .map(tag => ({ name: tag, value: tag }));
                        }
                    } catch (error) {
                        console.error('Error fetching tags for autocomplete:', error);
                    }
                    break;

                // Everything else is a straight reply
                default: 
                    choices = AUTOCOMPLETE_CHOICES[command.inputType];
                    break;
            }

            // Filter choices based on user input
            const filteredChoices = choices.filter(choice =>
                choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );

            await interaction.respond(filteredChoices.slice(0, 25));
        }
    },

    async execute(cmd) {
        const ephemeral = cmd.options.getBoolean("private") ?? false;
        const adminInput = cmd.options.getString("input");
        const adminChoice = cmd.options.getString("choice");

        // Check authorization
        if (!(await utils.isCreator(cmd.user.id))) {
            return cmd.reply({
                content: "You are not authorized to run this command",
                ephemeral: true
            });
        }

        // Get command configuration
        const commandConfig = ADMIN_COMMANDS[adminChoice];
        if (!commandConfig) {
            return cmd.reply({
                content: "Invalid admin command selected",
                ephemeral: true
            });
        }

        if (commandConfig.requiresAdmin && !(await utils.isAdmin(cmd.user.id))) {
            return cmd.reply({
                content: "This command requires higher administrator privileges.",
                ephemeral: true
            });
        }

        // Validate input requirements
        if (
            commandConfig.inputType && 
            !adminInput && 
            commandConfig.inputType !== "none" &&
            commandConfig.inputType !== null
        ) {
            return cmd.reply({
                content: `This command requires input: ${commandConfig.inputDescription}`,
                allowedMentions: { parse: [] },
                ephemeral: true
            });
        }

        // Get current config
        let config = await ConfigDB.findOne({});
        if (!config) {
            return cmd.reply({
                content: "Configuration not found in database",
                ephemeral: true
            });
        }

        const result = await commandConfig.execute(config, adminInput, cmd);
        await config.save();

        await cmd.reply({ 
            content: result, 
            ephemeral,
            allowedMentions: { parse: [] }
        });
    }
};