require("./modules/setEnvs");
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ConfigDB, connectedPromise } = require('./modules/database');

const client = global.client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
    ],
    partials: Object.keys(Partials).map(a => Partials[a])
});

// Load commands
(async () => {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        const commandData = await command.data;
        client.commands.set(commandData.name, command);
    }
})();

// Load events
const eventsPath = path.join(__dirname, 'events');
fs.readdirSync(eventsPath).filter(file => file.endsWith('.js')).forEach(file => {
    const event = require(path.join(eventsPath, file));
    client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args, client));
});

connectedPromise.then(() => {
        client.login(process.env.token).then(async _ => {
            // Once we have a sucessful login, then you can register the exception handlers to not crash out.
            const handleException = (e) => console.log(e);
            process.on('unhandledRejection', handleException);
            process.on('unhandledException', handleException);
        })
    })