module.exports = {
    name: 'ready',
    once: true, // Important: This event should only fire once.
    async execute(client) { // Pass in client and storage
        console.log(`Logged in as ${client.user.tag}`);

        try {
            const restartUpdateThreshold = 20000;
            const rebootData = storage.restartData;

            if (!rebootData) {
                beta && console.log("No reboot data")
                return;
            }

            const { restartedAt, channelId, messageId } = rebootData;
            const timeSinceRebootCommand = Date.now() - restartedAt;
            console.log(`Last restarted ${timeSinceRebootCommand / 1000} seconds ago`);

            if (messageId && timeSinceRebootCommand < restartUpdateThreshold) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (!channel) {
                        console.log("Channel not found");
                        return;
                    }

                    const message = await channel.messages.fetch(messageId || "0");
                    if (!message) {
                        console.log("Message not found");
                        return;
                    }

                    await message.edit({
                        content: `Restarting... done - took ${(timeSinceRebootCommand / 1000).toFixed(2)} seconds`
                    });

                } catch (error) {
                    console.error("Error updating restart message:", error);
                }
            } else {
                console.log("Restart message is too old")
            }
            storage.restartData = null;
        } catch (error) {
            console.error("Error in ready event:", error);
        }
    }
};