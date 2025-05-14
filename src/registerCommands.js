require("./modules/setEnvs")
const { REST, Routes } = require('discord.js');
const fs = require("fs");
const path = require("path");
const { connectedPromise } = require("./modules/database")

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'))
    .filter(file => !file.includes("disabled"));

const registerCommands = async () => {
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        // Await command.data if it's a Promise
        const data = await Promise.resolve(command.data);
        // console.log(data)
        commands.push(data.toJSON());
    }

    const rest = new REST({ version: '9' }).setToken(process.env.token);

    try {
        console.log('Started refreshing application (/) commands.');

        const re = await rest.put(
            Routes.applicationCommands(process.env.clientId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${re.length} commands.`);
    } catch (error) {
        console.error(error);
    } finally {
        process.exit(0);
    }
};

connectedPromise.then(registerCommands)
