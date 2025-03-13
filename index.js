Object.assign(process.env, require('./env.json'));
var client;
const { Client, ActionRowBuilder, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ComponentType, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { get } = require('https');
const { getDescription, getHelpMessageTitlesArray, getHelpMessageBySubjectTitle, getFileContent, appendHelpMessage, editHelpMessage, getSubtopics } = require("./helpFileParse");
const { getChartOptions, getPathToFlowchart } = require("./flowcharter");
const { getQuestionAndAnswers, postProcessForDiscord } = require("./mermaidParse");
const subtopics = getSubtopics();
const Fuse = require('fuse.js');
const Storage = require("./storage");
const { distance: levenshtein } = require('fastest-levenshtein');

let storage = new Storage();
client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ],
    partials: Object.keys(Partials).map(a=>Partials[a])
});

//#region Support Command Data
const SUPPORT_PACKS = {
    "Domino": {
        "Calibration Issue": "Try resetting the sensor alignment and ensure the domino track is clear.",
        "Motor Malfunction": "Check the wiring and battery connection. Replace motor if needed.",
        "Bluetooth Not Connecting": "Restart the device and ensure it's in pairing mode."
    },
    "IR TURRET": {
        "Not Detecting Targets": "Ensure the IR sensor is clean and properly aligned.",
        "Slow Movement": "Check motor power and adjust sensitivity settings.",
        "Connection Issues": "Reconnect to the control software and verify settings."
    },
    "Label Maker": {
        "Paper Jamming": "Open the label slot and clear any stuck paper.",
        "Printing Faint": "Replace or clean the thermal head.",
        "Not Powering On": "Ensure battery or power cable is properly connected."
    },
    "Laser Tag": {
        "Gun Not Firing": "Check battery levels and reload the game software.",
        "Vest Not Registering Hits": "Ensure the IR sensor is not obstructed.",
        "Pairing Issues": "Reset both gun and vest, then re-pair."
    },
    "Self Balance": {
        "Not Staying Upright": "Recalibrate the gyroscope and ensure a level surface.",
        "Wheel Misalignment": "Check for loose bolts and tighten if necessary.",
        "Bluetooth Not Connecting": "Restart the device and ensure the app is up-to-date."
    }
};

// Function to save support logs
const saveSupportLog = (boxType, issue, solution) => {
    const filePath = path.join(__dirname, 'support_logs.json');
    let logs = [];

    if (fs.existsSync(filePath)) {
        logs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    logs.push({ boxType, issue, solution, timestamp: new Date().toISOString() });

    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf-8');
};

//#endregion

//#region Functions
function areTheSame(msg1, msg2) {
    const threshold = 0.85;
    msg1 = msg1.slice(0, 1000);
    msg2 = msg2.slice(0, 1000);
    const edits = levenshtein(msg1, msg2);
    const similarity = 1 - edits / Math.max(msg1.length + msg2.length);
    return similarity > threshold;
}

function sortByMatch(items, text) {
    if (!text) return items;
    const fuse = new Fuse(items.map(title => ({ title })), {
        includeScore: true,
        keys: ['title']
    });
    return fuse.search(text).sort((a, b) => a.score - b.score).map(entry => entry.item.title);
}
//#endregion

//#region Command Registration
client.commands = new Map();

// Support Command
client.commands.set("support", {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("Get troubleshooting help for common issues")
        .addStringOption(option =>
            option.setName("box")
                .setDescription("Select the affected device")
                .setRequired(true)
                .addChoices(
                    { name: "Domino", value: "Domino" },
                    { name: "IR TURRET", value: "IR TURRET" },
                    { name: "Label Maker", value: "Label Maker" },
                    { name: "Laser Tag", value: "Laser Tag" },
                    { name: "Self Balance", value: "Self Balance" }
                )
        ),
    async execute(interaction) {
        const selectedBox = interaction.options.getString("box");
        const issues = SUPPORT_PACKS[selectedBox];

        if (!issues) {
            return interaction.reply({ content: "No troubleshooting information found for this device.", ephemeral: true });
        }

        const options = Object.keys(issues).map(issue =>
            new StringSelectMenuOptionBuilder()
                .setLabel(issue)
                .setDescription("Click to view solution")
                .setValue(issue)
        );

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("support_issue_select")
            .setPlaceholder("Choose an issue")
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle(`Support for ${selectedBox}`)
            .setDescription("Select an issue from the dropdown below to get troubleshooting help.")
            .setColor("Green");

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        client.on("interactionCreate", async (menuInteraction) => {
            if (!menuInteraction.isStringSelectMenu() || menuInteraction.customId !== "support_issue_select") return;

            const selectedIssue = menuInteraction.values[0];
            const solution = SUPPORT_PACKS[selectedBox][selectedIssue];

            const responseEmbed = new EmbedBuilder()
                .setTitle(selectedIssue)
                .setDescription(solution)
                .setColor("Blue");

            await menuInteraction.reply({ embeds: [responseEmbed], ephemeral: true });

            // Log the support request
            saveSupportLog(selectedBox, selectedIssue, solution);
        });
    }
});

//#endregion

//#region Event Listeners
client.on("interactionCreate", async interaction => {
    if (!interaction.isCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "There was an error executing that command!", ephemeral: true });
    }
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.mentions.has(client.user)) {
        message.channel.sendTyping();
        return message.reply("Hello! How can I assist you?");
    }
});

client.once("ready", async () => {
    console.log("Bot is online!");
});

// Error Handling
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

//#endregion

client.login(process.env.token);
