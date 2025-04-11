const { SlashCommandBuilder } = require('discord.js');
const utils = require('../modules/utils');

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
            ).setRequired(true)
        )
        .addStringOption(option =>
            option.setName("input").setDescription("Command input, if needed").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("private").setDescription("Make response ephemeral").setRequired(false)
        ),
    async execute(cmd, storage) {
        const ephemeral = cmd.options.getBoolean("private");

        if (!utils.isCreator(cmd.user.id)) {
            return cmd.reply({ content: "You are not authorized to run this command", ephemeral })
        }

        const adminInput = cmd.options.getString("input");
        const adminChoice = cmd.options.getString("choice");

        switch (adminChoice) {
            case "Adminize ID":
            case "Whitelist ID":
                var type = adminChoice == "Adminize ID" ? "admins" : "creators"
                if (!adminInput.match(/^\d+$/)) {
                    return cmd.reply({ content: "This command expects a discord ID of the user", ephemeral })
                }
                let newUsers = (storage?.[type] || []).concat(adminInput);
                newUsers = [...new Set(newUsers)] // filter duplicates
                storage[type] = newUsers;
                return cmd.reply({ content: "This user has been whitelisted", ephemeral })

            case "Unadminize ID":
            case "Unwhitelist ID":
                var type = adminChoice == "Unadminize ID" ? "admins" : "creators"
                storage[type] = (storage?.[type] || []).filter(element => element !== adminInput); //adminInput was previously item
                return cmd.reply({ content: "This user has been removed from the whitelisted", ephemeral })

            case "AI Pings Killswitch":
                storage.AIPings = !storage.AIPings;
                return cmd.reply({ content: `AI ping responses have been ${storage.AIPings ? "enabled" : "disabled"}`, ephemeral })

            case "AI AutoHelp Killswitch":
                storage.AIAutoHelp = adminInput ? adminInput : false;
                return cmd.reply({ content: `AI AutoHelp has been ${adminInput ? `set to guild ${adminInput}` : `disabled`}`, ephemeral })

            case "AI Tagger Killswitch":
                storage.autoTagger = !storage.autoTagger;
                return cmd.reply({ content: `AI auto tagger has been ${storage.autoTagger ? "enabled" : "disabled"}`, ephemeral })
                
            case "Dup Notif Killswitch":
                storage.dupeNotifs = !storage.dupeNotifs;
                return cmd.reply({ content: `Duplicate question notifs have been ${storage.dupeNotifs ? "enabled" : "disabled"}`, ephemeral })

            case "Blacklist Tag":
                if (!storage.allowedTags) storage.allowedTags = [];
                storage.allowedTags.splice(storage.allowedTags.indexOf(adminInput), 1);
                storage.savePrivStorage();
                return cmd.reply({ content: "Tag has been removed", ephemeral });
                
            case "Whitelist Tag":
                if (!storage.allowedTags) storage.allowedTags = [];
                if (!storage.allowedTags.includes(adminInput)) {
                    storage.allowedTags.push(adminInput);
                    storage.savePrivStorage();
                    return cmd.reply({ content: "Tag has been added", ephemeral });
                }   
                return cmd.reply({ content: "This tag is already whitelisted.", ephemeral });

            case "Restart":
                if (ephemeral) {
                    await cmd.reply({ content: "Restarting...", ephemeral: true });
                    storage.restartData = null; // Don't try to update ephemeral messages
                } else {
                    const message = await cmd.reply({ content: "Restarting...", ephemeral: false, withResponse: true });
                    storage.restartData = {
                        restartedAt: Date.now(),
                        channelId: cmd.channel.id,
                        messageId: message.id || message.interaction?.responseMessageId
                    };
                }
                console.log("Restarting...")
                process.exit(0);
        }
    }
};