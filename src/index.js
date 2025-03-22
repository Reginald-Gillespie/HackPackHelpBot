require("./modules/setEnvs");
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Storage = require('./modules/storage');

const client = global.client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: Object.keys(Partials).map(a => Partials[a])
});

const storage = global.storage = new Storage(); // Keep global for now
storage.cache.markRobotInstances = {};
storage.cache.markRobotPingsCache = {};
storage.cache.repeatQuestions = {}

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

// Load events
const eventsPath = path.join(__dirname, 'events');
fs.readdirSync(eventsPath).filter(file => file.endsWith('.js')).forEach(file => {
    const event = require(path.join(eventsPath, file));
    client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args, client, storage));
});

client.login(process.env.token);

const handleException = (e) => console.log(e);
process.on('unhandledRejection', handleException);
process.on('unhandledException', handleException);