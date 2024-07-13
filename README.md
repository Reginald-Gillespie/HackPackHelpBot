## Hack Pack Help Bot
This is a user-install bot pretty much for the sole purpose of pulling up references or debugging steps I commonly use so that I don't have to constantly search for code files, links, or type repetitive things out when I'm on mobile.

You can add this bot to your account so that you can use its commands anywhere by clicking [this link](https://discord.com/oauth2/authorize?client_id=1261392544152027206).

If you are determined to self-host it for some reason, first install the libraries needed (`npm install`). Then add your bot's info into `env.json.example` and remove the `.example` from the end of the filename. Then run `registerCommands.js` once to search through the help files and register commands for your bot. If you add more command categories (but not just more Messages inside a category), you will need to rerun this command. Then run `index.js` to start the bot.

---

You can join the Hack Pack discord [here](https://discord.gg/gKvCPtbmcg).

