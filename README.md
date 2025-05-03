## Hack Pack Help Bot
This is a bot designed to references or debugging steps I commonly use so that I don't have to constantly search for code files, links, or type repetitive things out when I'm on mobile.

You can add this bot to your account so that you can use its commands anywhere by clicking [this link](https://discord.com/oauth2/authorize?client_id=1261392544152027206).

If you are determined to self-host it for some reason, first install the libraries needed (`npm install`). Then create the file envs.json at the project root. Paste in this json and fill it out:
```json
{
    "token": "<your bot token>",
    "clientId": "<your bot ID>",
    "owner": "<your ID>",
    "GeminiKey": "<your Gemini API key>"
}
```
Then run `./Modules/registerCommands.js` once to search through the help files and register commands for your bot. If you add more lookup categories, you will need to rerun this command. Run `index.js` to start the bot. See `./Modules/HackPackHelpBot.service` for auto starting on boot (paths will need to be modified).

---

## Features

`/lookup <topic>`: Lookup saved messages under various categories.

`/flowchart`: Pull up custom flowcharts for debuggin.

`/help`: Walk a user through a flowchart step-by-step

Pinging this bot replies with Mark Robot.

This bot tries to use Gemini to answer questions based on loaded help messages, and replies if it believes the answer is helpful. 

---

You can join the Official Hack Pack Discord [here](https://mee6.xyz/i/RAMmVgdtYZ).
