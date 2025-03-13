
// File: bot.js
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const config = require('../config.js');
const Database = require('../utils/Database.js');
const { Slash, Events, Button, Modal }  = require('../handlers/handle.js');


module.exports = {
    Sigma: class Sigma extends Client {
        constructor() {
            super({
                allowedMentions: {
                    parse: ["roles", "users", "everyone"],
                    repliedUser: false
                },
                shards: 'auto',
                intents: [
                    GatewayIntentBits.Guilds, 
                    GatewayIntentBits.GuildMembers, 
                    GatewayIntentBits.GuildIntegrations, 
                    GatewayIntentBits.GuildVoiceStates, 
                    GatewayIntentBits.GuildMessages, 
                    GatewayIntentBits.GuildMessageReactions, 
                    GatewayIntentBits.GuildMessageTyping, 
                    GatewayIntentBits.DirectMessages, 
                    GatewayIntentBits.DirectMessageReactions, 
                    GatewayIntentBits.MessageContent
                ],
            });
            
            this.commands = new Collection()
            this.slashCommands = new Collection()
            this.commandaliases = new Collection()
            this.config = config;
            this.db = new Database();
            this.modLog = require('../utils/modLog.js').modLog;
            this.translate = require('../utils/translate.js').trsl;

            process.on("unhandledRejection", e => {
                console.log(e)
            })
            process.on("uncaughtException", e => {
                console.log(e)
            })
            process.on("uncaughtExceptionMonitor", e => {
                console.log(e)
            })
 
 
        }
        connect() {
            if(this.config.status === 'GLOBAL'){
                super.login(this.config.token).then(() => {
                    Slash(this, this.id);
                    Events(this);
                    Button(this);
                    Modal(this);
                    this.db.connect();
                })
            } else {
                super.login(this.config.betatoken).then(() => {
                    Slash(this)
                    Events(this)
                    Button(this);
                    Modal(this);
                    this.db.connect();
                })
            }
        }
    }
}
















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: index.js
const { Sigma } = require('./src/structures/bot.js');
const client = new Sigma();

client.connect();
module.exports = client;

















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: messageCreate.js
const { Events, ChannelType} = require("discord.js")

module.exports = {
	name: Events.MessageCreate,
	execute: async(message) => {

    if (message.channel.type === ChannelType.DM ) return;

/**
 * Leaving this here in case you want to make prefix commands
 */
 }
};

















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: interactionCreate.js
 module.exports = {
	name: 'interactionCreate',
	execute: async(interaction, client) => {
		if (!interaction.isChatInputCommand()) return;
		const command = client.commands.get(interaction.commandName)
		
		 if (!command) {
			console.log(`No command matching ${interaction.commandName} was found.`);
			return null;
		}
        await command.execute(interaction, client)
		 },
  }
  
















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: translate.js
const googleTranslate  = require("google-translate")("AIzaSyBA0uDqjAIXv_-bYrfvVwS-JjiVeKC3lz4")
const iso6391 = require('iso-639-1');
const { EmbedBuilder } = require('discord.js');
module.exports = {
    trsl: async function(interaction, embedColor, text, targetLanguage) {
        let languageCode;
        if (targetLanguage.length > 3 ){
             languageCode = iso6391.getCode(targetLanguage);
            } else {
                languageCode = targetLanguage;
            }
    
  try {
     await googleTranslate.translate(text, languageCode, function(err, translation) {
       const embed =  new EmbedBuilder()
        .setTitle("Translation Result")
        .setDescription(`**Original Text:**\n> ${text}\n\n**Translated Text:** \n> ${translation.translatedText}`)
        .setFooter({ text: `Target Language: (${targetLanguage})`})
        .setColor(embedColor);
        interaction.reply({embeds: [embed]})
    });
  } catch (error) {
    console.error('Translation error:', error);
    return null;
  }
}
}
















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: ping.js
const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Pong!")
    ,
    async execute(interaction, client) {

     interaction.reply({content: `Pong 🏓`,  ephemeral: true})
await client.modLog(
  interaction,
  `Command executed by ${interaction.user} \n Reason: No reason at all its just ping to show you how mod logs will work.`,
);
    }
 };

















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: ban.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('ban a user from the guild')
    .addUserOption(option =>
        option
        .setName('user')
        .setDescription('Mention a user')
        .setRequired(true)
    )
    .addStringOption(option =>
        option
        .setName('reason')
        .setDescription('Provide a reason')
        .setRequired(false)
    )
    ,
    async execute(interaction, client) {
        let colorb = await client.db.get(`embedcolor_${interaction.guild.id}`)
        let embedColor = colorb;
        if (!colorb) embedColor = 0x00ffff;
        const member = interaction.options.getMember('user');
        let reason = interaction.options.getString('reason');
        if (!reason) {
            reason = 'No reason was provided';
        };

        if (!interaction.guild.members.me.permissions.has([PermissionFlagsBits.BanMembers])) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setTitle("***You don't have the permission to do that!***")
                    .setColor(0xcc0000)
                ]
            });
        }

        if (!interaction.member.permissions.has([PermissionFlagsBits.BanMembers]))
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xcc0000)
                    .setTitle("***You don't have the permission to do that!***")
                ]
            });


        if (interaction.user.id === member) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setDescription(`***Hey ${interaction.author.username} you can't ban yourself!***`)
                    .setColor(embedColor)
                ]
            });
        }
        try {

            await member.ban({ reason: `${reason}` });
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setDescription(`***${member} has been banned permamently.***`)
                    .setColor(embedColor)
                ]
            })


            if (!reason) reason = 'No reason was provided';
            return client.modLog(
                interaction, `<@${interaction.user.id}> banned ${member.id} | ${member.user.username}. \n Reason: ${reason}`);

        } catch (e) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setTitle("***I can't find this user or I cant ban this user.***")
                    .setColor(0xfff700)
                ]
            })
        }
      }
 };

















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: modLog.js
const Database = require('./Database.js');
const { EmbedBuilder } = require('discord.js');
const database = new Database();
module.exports = {
    modLog: async function(i, text) {
        if (i, text) {
          try {

            /**
             * Define the mod log channel
             */
            let channel = await database.get(`modlog_${i.guild.id}`);
            const modChannel = i.guild.channels.cache.get(channel);
            if (!modChannel) return null;

            /**
             * Custom guild embed color
             */
            let colorb = await database.get(`embedcolor_${i.guild.id}`)
            let embedColor = colorb;
            if (!colorb) embedColor = 0x00ffff;
            
            /** 
             * Send Mod Log
            */
            if (channel) {
              var embed = new EmbedBuilder();
              embed.setTitle("Moderation Logs");
              embed.setDescription(`${text} \n <t:${(Date.now() / 1000) | 0}:R>`);
              embed.setColor(embedColor);
              await modChannel.send({ embeds: [embed] })
              .catch((e) => {
                 console.error(e)
                 });
            }
          } catch (e) {
            console.error(e);
          }
        }
          },
};
















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: Database.js
const mongoose = require('mongoose');
const mongoUrl = require('../config.js').mongourl;
const { ChalkAdvanced } = require('chalk-advanced');

const dataSchema = new mongoose.Schema({
  key: String,
  value: mongoose.Schema.Types.Mixed
});

const Data = mongoose.model('Data', dataSchema);

class Database {
  constructor() {
    this.db = mongoose.connection;
    this.db.on('error', console.error.bind(console, 'MongoDB connection error:'));
  }
  

  async connect() {
    if (mongoose.connection.readyState === 0) {
      try {
        console.log(`${ChalkAdvanced.blue('Database: ')} ${ChalkAdvanced.gray('>')} ${ChalkAdvanced.yellow('connecting...')}`);
        await mongoose.connect(mongoUrl, {
          useNewUrlParser: true,
          useUnifiedTopology: true
        });
        console.log(`${ChalkAdvanced.blue('Database: ')} ${ChalkAdvanced.gray('>')} ${ChalkAdvanced.green('Successfully connected')}`);
      } catch (err) {
        console.error(err);
      }
    } else {
      console.log('Already connected to database.');
    }
  }

  async disconnect() {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
        console.log(`${ChalkAdvanced.blue('Database: ')} ${ChalkAdvanced.gray('>')} ${ChalkAdvanced.red('has been disconnected')}`);
      } catch (err) {
        console.error(err);
      }
    } else {
      console.log('Already disconnected from database.');
    }
  }

  async set(key, value) {
    const existingData = await Data.findOne({ key: key }).exec();
    if (existingData) {
      existingData.value = value;
      await existingData.save();
    } else {
      const newData = new Data({
        key: key,
        value: value
      });
      await newData.save();
    }
  }

  async get(key) {
    const data = await Data.findOne({ key: key }).exec();
    if (data) {
      return data.value;
    } else {
      return undefined;
    }
  }

  async add(key, value) {
    const data = await Data.findOne({ key: key }).exec();
    if (data) {
      data.value += value;
      await data.save();
    } else {
      const newData = new Data({
        key: key,
        value: value
      });
      await newData.save();
    }
  }

  async delete(key) {
    await Data.findOneAndDelete({ key: key }).exec();
  }

  async push(key, value) {
    const data = await Data.findOne({ key: key }).exec();
    if (data) {
      data.value.push(value);
      await data.save();
    } else {
      const newData = new Data({
        key: key,
        value: [value]
      });
      await newData.save();
    }
  }

  async pull(key, value) {
    const data = await Data.findOne({ key: key }).exec();
    if (data) {
      data.value.pull(value);
      await data.save();
    }
  }

  async has(key) {
    const data = await Data.findOne({ key: key }).exec();
    if (data) {
      return true;
    } else {
      return false;
    }
  }
}

module.exports = Database;

















/**
 * 
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool 
 * 
 */

// File: handle.js
const fs = require("fs");
var AsciiTable = require("ascii-table");
const { ChalkAdvanced } = require('chalk-advanced');
module.exports = {
  Slash: async function (client) {
    /**
     * Dont touch anything if you dont know what you're doing
     */

    let table = new AsciiTable();
    table.setHeading("Commands", "Status");

    let slashCommands = [];
    const commandsFolder = fs.readdirSync("./src/slashCommands");
    for (const folder of commandsFolder) {
      const commandFiles = fs
        .readdirSync(`./src/slashCommands/${folder}`)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const commandFile = require(`../slashCommands/${folder}/${file}`);

        client.commands.set(commandFile.data.name, commandFile);
        slashCommands.push(commandFile.data.toJSON());

        table.addRow(file, "loaded");
        continue;
      }
    }

    client.application.commands.set(slashCommands);

    return console.log(table.toString(), "\n Loaded Commands");
  },

  Events: async function (client) {
    let table = new AsciiTable();
    table.setHeading("Events", "Status").setBorder("|", "=", "0", "0");

    const folders = fs.readdirSync("./src/events/");
    for (const folder of folders) {
      const files = fs
        .readdirSync(`./src/events/${folder}`)
        .filter((file) => file.endsWith(".js"));

      for (const file of files) {
        const event = require(`../events/${folder}/${file}`);

        if (event.rest) {
          if (event.once)
            client.rest.once(event.name, (...args) =>
              event.execute(...args, client)
            );
          else
            client.rest.on(event.name, (...args) =>
              event.execute(...args, client)
            );
        } else {
          if (event.once)
            client.once(event.name, (...args) =>
              event.execute(...args, client)
            );
          else
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        table.addRow(file, "Loaded");
        continue;
      }
    }

    return console.log(table.toString(), "\n Loaded Events");
  },

  Button: async function (client) {
    const buttonsFolder = fs.readdirSync("./src/utils/buttons");
    const buttonsTable = [];

    for (const buttonFile of buttonsFolder) {
      const buttonModule = require(`../utils/buttons/${buttonFile}`);
      const buttonId = buttonModule.customId;
      const buttonLabel = buttonModule.label;

      const interactionCreateHandler = async (interaction) => {
        if (!interaction.isButton()) return;
        if (interaction.customId !== buttonId) return;

        await buttonModule.execute(interaction, client);
      };

      client.on("interactionCreate", interactionCreateHandler);

      buttonsTable.push({
        Button: buttonFile,
        Label: buttonLabel,
        Status: "Loaded",
      });
    }

    console.log(`${ChalkAdvanced.red("Buttons: ")} ${ChalkAdvanced.gray(">")}`);
    console.table(buttonsTable, ["Button", "Label", "Status"]);
  },

  Modal: async function (client) {
    const modalFolder = fs.readdirSync("./src/utils/modals");
    const modalTable = [];

    for (const modalFile of modalFolder) {
      const modalModule = require(`../utils/modals/${modalFile}`);
      const modalId = modalModule.customId;
      const modalTitle = modalModule.title;

      const interactionCreateHandler = async (interaction) => {
        if (!interaction.isModalSubmit()) return;
        if (interaction.customId !== modalId) return;

        await modalModule.execute(interaction, client);
      };

      client.on("interactionCreate", interactionCreateHandler);

      modalTable.push({
        Modal: modalFile,
        Title: modalTitle,
        Status: "Loaded",
      });
    }

    console.log(`${ChalkAdvanced.red("Modals: ")} ${ChalkAdvanced.gray(">")}`);
    console.table(modalTable, ["Modal", "Title", "Status"]);
  },
};

/**
 *
 * This template is made by sigmaxii
 * Sigma Bot aka https://sigmaxii.com is running with this template
 * Free to use without credits
 * Just add sigma bot in your server and we're cool
 *
 */


// File: set.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Configure events!")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modlogs")
        .setDescription("Setup modlogs!")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Enter modlog channel for this guild")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("embedcolor")
        .setDescription("Setup custom bot embed color for this guild")
        .addStringOption((option) =>
          option
            .setName("color")
            .setDescription("Enter a color for the embeds. e.x. #ff0000")
            .setRequired(true)
        )
    ),

  async execute(interaction, client) {
    switch (interaction.options.getSubcommand()) {
      case "moglogs":
      default: {
        let colorb = await client.db.get(`embedcolor_${interaction.guild.id}`);
        let embedColor = colorb;
        if (!colorb) embedColor = 0x00ffff;

        let channel = interaction.options.getChannel("channel");

        if (
          !interaction.guild.members.me.permissions.has([
            PermissionFlagsBits.ManageChannels,
          ])
        )
          return interaction.reply({
            content:
              "**You Do Not Have The Required Permissions! - [MANAGE_CHANNELS]**",
          });

        if (!interaction.member.permissions.has("MANAGE_CHANNELS"))
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xcc0000)
                .setTitle("***You don't have the permission to do that!***"),
            ],
          });

        if (!channel) {
          let b = await client.db.get(`modlog_${interaction.guild.id}`);
          let channelName = interaction.guild.channels.cache.get(b);
          try {
            if (interaction.guild.channels.cache.has(b)) {
              return interaction.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(
                      `**Moderation log channe is already set in: \`${channelName.name}\`!**`
                    ),
                ],
              });
            }
          } catch (e) {
            console.log(e);
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xfff700)
                  .setTitle(
                    "**Please Enter A Valid Channel Name or ID To Set!**"
                  ),
              ],
            });
          }
        }

        if (channel.type != ChannelType.GuildText)
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xfff700)
                .setTitle("**Please enter a text channel!**"),
            ],
          });

        try {
          let a = await client.db.get(`modlog_${interaction.guild.id}`);

          if (channel.id === a) {
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(embedColor)
                  .setTitle(
                    "**This channel is already set as mod log channel.**"
                  ),
              ],
            });
          } else {
            client.guilds.cache
              .get(interaction.guild.id)
              .channels.cache.get(channel.id)
              .send({
                embeds: [
                  new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle("**Mod Log channel has been set succesfully**"),
                ],
              });
            client.db.set(`modlog_${interaction.guild.id}`, channel.id);

            interaction.reply({
              content: `${channel.name}`,
              embeds: [
                new EmbedBuilder()
                  .setColor(embedColor)
                  .setTitle(
                    `**Modlog Channel Has Been Set Successfully in \`${channel.name}\`!**`
                  ),
              ],
            });
          }
        } catch (e) {
          return interaction.reply({
            content:
              "**Error - `Missing Permissions Or Channel Is Not A Text Channel!`** " +
              e,
          });
        }
        break;
      }
      case "embedcolor": {
        let colorb = await client.db.get(`embedcolor_${interaction.guild.id}`);
        let embedColor = colorb;
        if (!colorb) embedColor = 0x00ffff;
        let color = interaction.options.getString("color");
        var isHexcolor = require("is-hexcolor");
        if (!isHexcolor(color)) {
          const embed2 = new EmbedBuilder()
            .setDescription(
              "Thats not a valid color try using [HEX color](https://g.co/kgs/51SG1x) code \ne.x. #00ffff"
            )
            .setColor(embedColor);
          return interaction.reply({ embeds: [embed2] });
        }
        if (
          !interaction.guild.members.me.permissions.has([
            PermissionFlagsBits.ManageGuild,
          ])
        )
          return interaction.reply({
            content:
              "**I Do Not Have The Required Permissions! - [MANAGE_GUILD]**",
            ephemeral: true,
          });
        if (!interaction.member.permissions.has("MANAGE_GUILD"))
          return interaction.reply({
            content: "***You don't have the permission to do that!***",
            ephemeral: true,
          });

        if (color.length > 7) {
          const embed = new EmbedBuilder()
            .setDescription(
              "Thats not a valid color try using [HEX color](https://g.co/kgs/51SG1x) code \ne.x. #00ffff"
            )
            .setColor(embedColor);
          return interaction.reply({ embeds: [embed] });
        }

        try {
          let b = await client.db.get(`embedcolor_${interaction.guild.id}`);
          if (color === b) {
            return interaction.reply({
              content: `**Embed color is already set set as: ${color}!**`,
              ephemeral: true,
            });
          } else {
            client.db.set(`embedcolor_${interaction.guild.id}`, color);

            interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(color)
                  .setDescription(
                    `***Embed color ha been set succesfully to ${color}!***`
                  ),
              ],
              ephemeral: true,
            });
          }
        } catch (e) {
          console.log(e);
        }
        break;
      }
    }
  },
};

