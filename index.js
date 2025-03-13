
// Sigma Bot - Merged & Fully Functional

Object.assign(process.env, require('./env.json'));

const { Client, Collection, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { get } = require("https");
const { distance: levenshtein } = require("fastest-levenshtein");
const Fuse = require("fuse.js");
const Storage = require("./Database");
const { Slash, Events, Button, Modal } = require("./handle");
const { modLog } = require("./modLog");
const { getHelpMessageBySubjectTitle } = require("./helpFileParse");
const { trsl } = require("./translate");

const storage = new Storage();
const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ],
    partials: Object.keys(Partials).map(a => Partials[a])
});

client.commands = new Collection();

// Load commands dynamically
const commandFiles = fs.readdirSync("./src/slashCommands").filter(file => file.endsWith(".js"));
for (const file of commandFiles) {
    const command = require(`./src/slashCommands/${file}`);
    client.commands.set(command.data.name, command);
}

// Auto-reply to duplicate questions
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    
    if (message.mentions.has(client.user)) {
        message.channel.sendTyping();
        const robotsReply = await trsl(message.content, "#ff0000", message.content, "en");
        message.reply(robotsReply);
    }
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "There was an error while executing this command!", ephemeral: true });
        }
    }
});

client.once("ready", () => {
    console.log("Sigma Bot is online!");
});

// Admin commands handler
client.on("interactionCreate", async (cmd) => {
    if (cmd.commandName === "admin") {
        if (!storage.admins.includes(cmd.user.id)) {
            return cmd.reply({ content: "You are not authorized to run this command", ephemeral: true });
        }

        const adminChoice = cmd.options.getString("choice");
        if (adminChoice === "Restart") {
            cmd.reply({ content: "Restarting...", ephemeral: true });
            process.exit(0);
        }
    }
});

// Mod Logging
client.on("messageCreate", async (message) => {
    if (message.content.startsWith("!log")) {
        await modLog(message, "This is a test log message");
        message.reply("Log has been recorded!");
    }
});

// Start bot
client.login(process.env.token);
