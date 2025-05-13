const { SlashCommandBuilder } = require('discord.js');
const utils = require('../modules/utils');
const { ConfigDB, dropAllReleventIndexes } = require('../modules/database');

module.exports = {
    data: new SlashCommandBuilder().setName("admin").setDescription("Quick access admin options")
        .addStringOption(option =>
            option.setName("choice").setDescription("Admin command").addChoices(
                { name: "Whitelist ID", value: "Whitelist ID" },
                { name: "Unwhitelist ID", value: "Unwhitelist ID" },
                { name: "Adminize ID", value: "Adminize ID" },
                { name: "Unadminize ID", value: "Unadminize ID" },
                { name: "AI Pings Killswitch", value: "AI Pings Killswitch" },
                { name: "AI AutoHelp Killswitch", value: "AI AutoHelp Killswitch" },
                { name: "Dup Notif Killswitch", value: "Dup Notif Killswitch" },
                { name: "Whitelist Tag", value: "Whitelist Tag" },
                { name: "Blacklist Tag", value: "Blacklist Tag" },
                { name: "Restart", value: "Restart" },
                { name: "Drop Indexes", value: "Drop Indexes" },
            ).setRequired(true)
        )
        .addStringOption(option =>
            option.setName("input").setDescription("Command input, if needed").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("private").setDescription("Make response ephemeral").setRequired(false)
        ),

    async execute(cmd) {

        const ephemeral = cmd.options.getBoolean("private");
        const adminInput = cmd.options.getString("input");
        const adminChoice = cmd.options.getString("choice");

        if (!(await utils.isCreator(cmd.user.id))) {
            return cmd.reply({ content: "You are not authorized to run this command", ephemeral })
        }

        let config = await ConfigDB.findOne({});

        switch (adminChoice) {
            case "Adminize ID":
            case "Whitelist ID":
                var type = adminChoice == "Adminize ID" ? "admins" : "creators"
                if (!adminInput.match(/^\d+$/)) {
                    return cmd.reply({ content: "This command expects a discord ID of the user", ephemeral })
                }
                let newUsers = config[type].concat(adminInput);
                newUsers = [...new Set(newUsers)] // filter duplicates
                config[type] = newUsers;
                // return 
                cmd.reply({ content: "This user has been whitelisted", ephemeral })
                break;

            case "Unadminize ID":
            case "Unwhitelist ID":
                var type = adminChoice == "Unadminize ID" ? "admins" : "creators"
                config[type] = config[type].filter(element => element !== adminInput);
                // config = await ConfigDB.findOneAndUpdate({}, {
                //     $pull: { [type]: adminInput }
                // })
                // return 
                cmd.reply({ content: "This user has been removed from the whitelisted", ephemeral })
                break;

            case "AI Pings Killswitch":
                config.AIPings = !config.AIPings;
                cmd.reply({ content: `AI ping responses have been ${config.AIPings ? "enabled" : "disabled"}`, ephemeral })
                break;

            case "AI AutoHelp Killswitch":
                config.AIAutoHelp = adminInput ? adminInput : false;
                cmd.reply({ content: `AI AutoHelp has been ${adminInput ? `set to guild ${adminInput}` : `disabled`}`, ephemeral })
                break;

            case "AI Tagger Killswitch":
                config.autoTagger = !config.autoTagger;
                cmd.reply({ content: `AI auto tagger has been ${config.autoTagger ? "enabled" : "disabled"}`, ephemeral })
                break;
                
            case "Dup Notif Killswitch":
                config.dupeNotifs = !config.dupeNotifs;
                cmd.reply({ content: `Duplicate question notifs have been ${config.dupeNotifs ? "enabled" : "disabled"}`, ephemeral })
                break;

            case "Blacklist Tag":
                config.allowedTags.splice(config.allowedTags.indexOf(adminInput), 1);
                cmd.reply({ content: "Tag has been removed", ephemeral });
                break;
                
            case "Whitelist Tag":
                if (!config.allowedTags.includes(adminInput)) {
                    config.allowedTags.push(adminInput);
                    cmd.reply({ content: "Tag has been added", ephemeral });
                }   
                else cmd.reply({ content: "This tag is already whitelisted.", ephemeral });
                break;

            case "Restart":
                if (ephemeral) {
                    await cmd.reply({ content: "Restarting...", ephemeral: true });
                    config.restartData = null; // Don't try to update ephemeral messages
                } else {
                    const message = await cmd.reply({ content: "Restarting...", ephemeral: false, withResponse: true });
                    config.restartData = {
                        restartedAt: Date.now(),
                        channelId: cmd.channel.id,
                        messageId: message.id || message.interaction?.responseMessageId
                    };
                }
                console.log("Restarting...")
                await config.save();
                process.exit(0);

            case "Drop Indexes":
                await dropAllReleventIndexes()
                return cmd.reply({ content: "Done", ephemeral });
        }

        config.save();
    }
};