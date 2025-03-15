// TODO:
// Cache fs.readFileSync calls
// Check for message under current name before adding / moving
// If I want to add per-user storage, storage create messages from users if they are failed and insert them as starting point when they run create again.
// Lots of other limiting char counts
// Command to upload photos from photo database of different parts of each box?
// 

Object.assign(process.env, require('./env.json'));
const beta = process.env.beta == "true";

const NodeCache = require( "node-cache" );
const {Client, Events, ActionRowBuilder, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ComponentType } = require("discord.js");
const { GoogleGenerativeAI, FunctionCallingMode, SchemaType } = require("@google/generative-ai");
const fs = require("fs");
const { get } = require('https');
const { getDescription, getHelpMessageTitlesArray, getHelpMessageBySubjectTitle, getFileContent, appendHelpMessage, editHelpMessage, getSubtopics } = require("./helpFileParse")
const { getChartOptions, getPathToFlowchart } = require("./flowcharter")
const { getQuestionAndAnswers, postProcessForDiscord } = require("./mermaidParse")
const subtopics = getSubtopics();
const Fuse = require('fuse.js');
const path = require("path")
const Storage = require("./storage");
const { distance: levenshtein } = require('fastest-levenshtein')
const fuseOptions = {
    includeScore: true,
    keys: ['title']
};

let storage = new Storage();

const MarkRobot = require("./markRobot");
storage.cache.markRobotInstances = {}; // Non-persistent cache for /mark-robot command
storage.cache.markRobotPingsCache = {}; // Same, but for channel pings and replies
storage.cache.repeatQuestions = {} // {id: [{message: <hash>, channelID, repeats: 1}, ...]}
let repeatQuestions = storage.cache.repeatQuestions; // shorter reference to the above 

const tripleBacktick = '```'

// Register client
const client = new Client({
    intents: [ 
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: Object.keys(Partials).map(a=>Partials[a])
});


//#region functions
function isHelpRequest(message) {
    // Identify if a message is a request for help using rough criteria.
    message = message.toLowerCase().replace("'", "");
    return (
        // Required flags
        message.length >= 20
    ) && (
        // Must contain one of these:
        /\?/iu.test(message) ||
        /anyone know/iu.test(message) ||
        /\bhow\b/iu.test(message) ||
        /\bwhy\b/iu.test(message) ||
        /problem/iu.test(message) ||
        /will not/iu.test(message) ||
        /\bwont/iu.test(message) ||
        /\bisnt/iu.test(message) ||
        /is not/iu.test(message) ||
        // /it was/iu.test(message) ||
        // /does/iu.test(message) ||
        /^does/iu.test(message) ||
        /\bhelp\b/iu.test(message)
    )
}
function areTheSame(msg1, msg2) {
    const threshold = 0.85;
    
    msg1 = msg1.slice(0, 1000);
    msg2 = msg2.slice(0, 1000);

    const edits = levenshtein(msg1, msg2)
    const similarity = 1 - edits/Math.max(msg1.length + msg2.length)
    
    return similarity > threshold
}
function markRobotMessagePostProcess(message, guild) {
    // Post-process message snowflakes for MarkRobot
    message = message.replace(/<@!?(\d+)>/g, (match, userId) => {
        if (userId === client.user.id) {
            // return "@Mark-Robot";
            // Due to what seems to be an idiotic whitelist process, best to keep messages as uniform as possible
            // *cough* *cough* which entirely defeates the purpose of using an LLM in the first place.
            // You might as well query an FAQ database or even better if you want to be high tech, use a CSV-FAQ-Matching ML algorithm. 
            return "";
        }
        const user = guild.members.cache.get(userId); // Fetch the user from the guild
        return user ? `@${user.user.username}` : match; // Replace with username if found
    });
    message = message.trim()
    return message;
}
function isCreator(userID) {
    return storage?.creators.includes(userID) || storage?.admins.includes(userID)
}
function sortByMatch(items, text) {
    if (!text) return items;
    const fuse = new Fuse(items.map(title => ({ title })), fuseOptions);            
    const scoredResults = fuse.search(text)
        .filter(result => result.score <= 2) // Roughly similar-ish
        .sort((a, b) => a.score - b.score);
    return scoredResults.map(entry => entry.item.title);
}
function arrayToAutocorrect(array) {
    const choices = array.map(choice => {
        return {
            "name": choice,
            "value": choice
        }
    });
    return choices.slice(0, 25); // Discord limit is 25 responses
}
async function downloadFile(fileUrl, downloadPath) {
    return new Promise((resolve, reject) => {
        // Ensure the download path exists
        const fullPath = path.resolve(downloadPath);

        // Create a write stream
        const file = fs.createWriteStream(fullPath);

        // Download the file
        get(fileUrl, (response) => {
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve(fullPath);
            });
        }).on('error', (err) => {
            file.close();
            reject(err);
        });
    });
}
function findButtonOfId(actionRows, ID) {
    for (const actionRow of actionRows) {
        // Find a button within the components of the action row
        const button = actionRow.components.find(
          component => component.type === ComponentType.Button && component.customId === ID
        );
        if (button) return button
    }
    return null
}
function md5(inputString) {
    // I absolutely love this implimentation
    // https://stackoverflow.com/questions/1655769/fastest-md5-implementation-in-javascript
    var hc="0123456789abcdef";
    function rh(n) {var j,s="";for(j=0;j<=3;j++) s+=hc.charAt((n>>(j*8+4))&0x0F)+hc.charAt((n>>(j*8))&0x0F);return s;}
    function ad(x,y) {var l=(x&0xFFFF)+(y&0xFFFF);var m=(x>>16)+(y>>16)+(l>>16);return (m<<16)|(l&0xFFFF);}
    function rl(n,c)            {return (n<<c)|(n>>>(32-c));}
    function cm(q,a,b,x,s,t)    {return ad(rl(ad(ad(a,q),ad(x,t)),s),b);}
    function ff(a,b,c,d,x,s,t)  {return cm((b&c)|((~b)&d),a,b,x,s,t);}
    function gg(a,b,c,d,x,s,t)  {return cm((b&d)|(c&(~d)),a,b,x,s,t);}
    function hh(a,b,c,d,x,s,t)  {return cm(b^c^d,a,b,x,s,t);}
    function ii(a,b,c,d,x,s,t)  {return cm(c^(b|(~d)),a,b,x,s,t);}
    function sb(x) {
        var i;var nblk=((x.length+8)>>6)+1;var blks=new Array(nblk*16);for(i=0;i<nblk*16;i++) blks[i]=0;
        for(i=0;i<x.length;i++) blks[i>>2]|=x.charCodeAt(i)<<((i%4)*8);
        blks[i>>2]|=0x80<<((i%4)*8);blks[nblk*16-2]=x.length*8;return blks;
    }
    var i,x=sb(""+inputString),a=1732584193,b=-271733879,c=-1732584194,d=271733878,olda,oldb,oldc,oldd;
    for(i=0;i<x.length;i+=16) {olda=a;oldb=b;oldc=c;oldd=d;
        a=ff(a,b,c,d,x[i+ 0], 7, -680876936);d=ff(d,a,b,c,x[i+ 1],12, -389564586);c=ff(c,d,a,b,x[i+ 2],17,  606105819);
        b=ff(b,c,d,a,x[i+ 3],22,-1044525330);a=ff(a,b,c,d,x[i+ 4], 7, -176418897);d=ff(d,a,b,c,x[i+ 5],12, 1200080426);
        c=ff(c,d,a,b,x[i+ 6],17,-1473231341);b=ff(b,c,d,a,x[i+ 7],22,  -45705983);a=ff(a,b,c,d,x[i+ 8], 7, 1770035416);
        d=ff(d,a,b,c,x[i+ 9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,     -42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
        a=ff(a,b,c,d,x[i+12], 7, 1804603682);d=ff(d,a,b,c,x[i+13],12,  -40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);
        b=ff(b,c,d,a,x[i+15],22, 1236535329);a=gg(a,b,c,d,x[i+ 1], 5, -165796510);d=gg(d,a,b,c,x[i+ 6], 9,-1069501632);
        c=gg(c,d,a,b,x[i+11],14,  643717713);b=gg(b,c,d,a,x[i+ 0],20, -373897302);a=gg(a,b,c,d,x[i+ 5], 5, -701558691);
        d=gg(d,a,b,c,x[i+10], 9,   38016083);c=gg(c,d,a,b,x[i+15],14, -660478335);b=gg(b,c,d,a,x[i+ 4],20, -405537848);
        a=gg(a,b,c,d,x[i+ 9], 5,  568446438);d=gg(d,a,b,c,x[i+14], 9,-1019803690);c=gg(c,d,a,b,x[i+ 3],14, -187363961);
        b=gg(b,c,d,a,x[i+ 8],20, 1163531501);a=gg(a,b,c,d,x[i+13], 5,-1444681467);d=gg(d,a,b,c,x[i+ 2], 9,  -51403784);
        c=gg(c,d,a,b,x[i+ 7],14, 1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);a=hh(a,b,c,d,x[i+ 5], 4,    -378558);
        d=hh(d,a,b,c,x[i+ 8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16, 1839030562);b=hh(b,c,d,a,x[i+14],23,  -35309556);
        a=hh(a,b,c,d,x[i+ 1], 4,-1530992060);d=hh(d,a,b,c,x[i+ 4],11, 1272893353);c=hh(c,d,a,b,x[i+ 7],16, -155497632);
        b=hh(b,c,d,a,x[i+10],23,-1094730640);a=hh(a,b,c,d,x[i+13], 4,  681279174);d=hh(d,a,b,c,x[i+ 0],11, -358537222);
        c=hh(c,d,a,b,x[i+ 3],16, -722521979);b=hh(b,c,d,a,x[i+ 6],23,   76029189);a=hh(a,b,c,d,x[i+ 9], 4, -640364487);
        d=hh(d,a,b,c,x[i+12],11, -421815835);c=hh(c,d,a,b,x[i+15],16,  530742520);b=hh(b,c,d,a,x[i+ 2],23, -995338651);
        a=ii(a,b,c,d,x[i+ 0], 6, -198630844);d=ii(d,a,b,c,x[i+ 7],10, 1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);
        b=ii(b,c,d,a,x[i+ 5],21,  -57434055);a=ii(a,b,c,d,x[i+12], 6, 1700485571);d=ii(d,a,b,c,x[i+ 3],10,-1894986606);
        c=ii(c,d,a,b,x[i+10],15,   -1051523);b=ii(b,c,d,a,x[i+ 1],21,-2054922799);a=ii(a,b,c,d,x[i+ 8], 6, 1873313359);
        d=ii(d,a,b,c,x[i+15],10,  -30611744);c=ii(c,d,a,b,x[i+ 6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21, 1309151649);
        a=ii(a,b,c,d,x[i+ 4], 6, -145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+ 2],15,  718787259);
        b=ii(b,c,d,a,x[i+ 9],21, -343485551);a=ad(a,olda);b=ad(b,oldb);c=ad(c,oldc);d=ad(d,oldd);
    }
    return rh(a)+rh(b)+rh(c)+rh(d);
}

//#endregion functions

//#region AutoAI
const autoAICache = new NodeCache( { stdTTL: 3600, checkperiod: 600 } );
// Configure Gemini Flash
const genAI = new GoogleGenerativeAI(process.env.GeminiKey);
let helpMessageList = [];
let geminiModel;
const autoAIResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        "thoughts": {
            description: "Think about which response is the best, or if there is even a best response.",
            type: SchemaType.STRING,
            nullable: false,
        },
        "chosen_response": {
            description: "After thinking, write down your final answer.",
            type: SchemaType.INTEGER,
        },
        "confidence": {
            description: "How confident you are that your answer is relevant, from 1 (fairly confident) to 5 (very confident).",
            type: SchemaType.INTEGER,
        }
    },
    required: [
        "thoughts",
        "chosen_response"
    ],
    propertyOrdering: [
        "thoughts",
        "chosen_response"
    ]
}
const systemPrompt = 
`- You are an advanced AI assistant designed to tie user queries to matching predefined "help messages" (FAQs) when applicable.
- Queries are posted in a large discord server, not every query is related to you. If it does not seem to be related to the FAQs, respond with 0.
- If you are sure that a given FAQ title matches the provided question, use the relevant tool to activate that FAQ using it's number.
- If no FAQ matches, respond with 0.
- If you are not 100% confident that an FAQ would be helpful and relevent, respond with 0. 
- Sometimes some users are helping other users. If one user answers another user's question already, there is no point sending an FAQ so respond with 0.
- Do not extrapolate meaning too far, better to miss a vague question than answer something unrelated.

For more context, you are helping answer questions about Arduino subscription box projects, including:
- IR Turret. This box uses an IR remote to control a 3 axis turret that shoots foam darts.
- Domino Robot. This box is a simple line-following robot that lays down dominos.
- Label Maker. This box moves a pen up and down on a Y motor, and rolls take with the X motor to draw letters.
- Sandy Garden. This box is a small zen sand garden using two stepper motors to move arms moving a magnetic ball in patterns.
- IR Laser Tag. This box has two IR laser tag guns, each connected to a pair of goggles with receivers that dim when you are shot.
- Balance Bot. This is a classic bot that balances on two wheels.

Other categories:
- IDE. These boxes use ae custom branded online IDE to code them. Some people prefer other IDEs like the Arduino IDE, but these take more setup work.
- General. A category for anything that doesn't fit elsewhere.


Here is a list of each FAQ you can select from:
0. No response is a confident match.
{FAQs}`;
// TODO: add walkthrough trigger support, with metadata for channel to activate in
`Here is a list of interactive walkthroughs you can start for the user:
{Walkthroughs}`
const addAutoAIDisclaimer = text => {
    return (
        'I have attempted to automatically answer your question:\n' +
        '\n' +
        // '```\n' +
        // text.replaceAll("```", "\\`\\`\\`") +
        text +
        '\n' +
        // '```\n' +
        `\n-# ⚠️ This response was selected by AI and may be incorrect.`
    )
}

// Tool calling
const autoAIFunctions = {
    runFAQ: async ({ num }, msg) => {
        if (num <= 1) return;
        console.log("Running FAQ number " + num);

        const selectedHelpMessageTitle = helpMessageList[num];
        if (!selectedHelpMessageTitle) return;

        const helpMessage = getHelpMessageBySubjectTitle(selectedHelpMessageTitle.subtopic, selectedHelpMessageTitle.title);
        if (!helpMessage) return;
        
        await msg.reply(addAutoAIDisclaimer(helpMessage));
    }
};

function rebuildHelpTools() {
    let compiledSystemPrompt = systemPrompt;
    // Build FAQs into the prompt
    const faqs = [];
    let index = 1;
    for (const subtopic of subtopics) {
        const helpFile = getFileContent(subtopic);
        const helpMessagesTitles = getHelpMessageTitlesArray(helpFile);
        helpMessagesTitles.forEach((title) => {
            helpMessageList[index] = {title, subtopic};
            faqs.push(`${index}. ${title} | (${subtopic})`);
            index++;
        });
    }
    compiledSystemPrompt = compiledSystemPrompt.replace("{FAQs}", faqs.join("\n"))

    geminiModel = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: compiledSystemPrompt,
        // tools: {
        //     functionDeclarations: autoAITools,
        // },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: autoAIResponseSchema,
        },
        toolConfig: {
            functionCallingConfig: {
                // Only allow function responses
                mode: FunctionCallingMode.ANY
            }
        }
    });
}
rebuildHelpTools() // Initialize

//#endregion AutoAI

//#region Handlers
// Most non-message handlers
client.on("interactionCreate", async cmd => {
    // Buttons for flowchart walkthrough
    if (cmd.isButton()) {
        // Extract JSON from first button in the row
        const currentButtons = cmd.message.components[0];
        const thisButton = findButtonOfId(cmd.message.components, cmd.customId)
        const jsonButton = currentButtons.components[0];
        const context = JSON.parse(jsonButton.customId.split("|")[1])
        const customId = cmd.customId.split("|")[0]; // do this for all buttons just because
        const interactionId = (cmd.message.embeds[1]?.footer || cmd.message.embeds[0]?.footer).text.split(" ")[1];

        if (cmd.user.id !== context.id) {
            return cmd.reply({content: "This flowchart is not for you, you can run /help to start your own", ephemeral: true})
        }

        // Follow the flowchart
        var [mermaidPath, error] = await getPathToFlowchart(context.chart, true);
        const mermaidJSON = require(mermaidPath)

        let questionData, answersArray;

        // Check if this was the back button
        if (customId === "Back") {
            // Check if we have previous data
            const history = storage.cache[context.id]?.helpHistory;
            if (!history || !history.length > 1) return cmd.reply({content: "There is no history to go back to. Please start a new command.", ephemeral: true})
            
            // Make sure this history is for this interaction
            if (history.slice(-1)[0][2] !== interactionId) return cmd.reply({content: "There is no history to go back to. Please start a new command.", ephemeral: true}) 

            history.pop(); // Remove the current page

            let uid;
            [questionData, answersArray, uid] = history.slice(-1)[0];
        }
        else {
            [ questionData, answersArray ] = getQuestionAndAnswers(mermaidJSON, context.questionID, customId);

            // Pack new data to history cache
            storage.cache[context.id]?.helpHistory?.push([questionData, answersArray, interactionId])
        }

        // Fetch the embed to update
        const message = await cmd.message.fetch();
        const hasAnswerEmbed = message.embeds.length > 1;
        const questionEmbed = message.embeds[hasAnswerEmbed ? 1 : 0];
        let questionField = questionEmbed.fields[2];
        const question = questionField.value; //.match(/```(.+?)```/)?.[1] || "[Error parsing question]"
        let answerEmbed = hasAnswerEmbed ? message.embeds[0] : null;

        // Buttons - pack answers into row
        const buttons = [];
        for (let i = 0; i < answersArray.length; i++) {
            const answer = answersArray[i];
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(""+answer)
                    .setLabel(""+answer)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        // Inject back button if this isn't the starting page
        if (questionData?.questionID !== "Title") buttons.unshift(
            new ButtonBuilder()
                .setCustomId("Back")
                .setLabel("Back")
                .setStyle(ButtonStyle.Secondary)
        )
        if (buttons[0]) {
            // This might not be defined if there are no more answers
            buttons[0].data.custom_id += "|" + JSON.stringify({
                id: context.id,
                questionID: questionData?.questionID,
                chart: context.chart,
            })
        }
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        // Create answer embed template if it does not exist
        if (!answerEmbed) {
            answerEmbed = new EmbedBuilder()
                .setColor(0)
                .setTitle(`Recorded answers`)
                .setFields([])
        }
        
        // Add the recorded answers to the answer embed
        answerEmbed.data.fields.push({ name: `Q: ${question}`, value: `> ${thisButton.data.label}` })
        answerEmbed.data.fields = answerEmbed.data.fields.slice(-25); // Make sure we don't hit the discord limit

        // Pack question back into question embed
        questionField.value = postProcessForDiscord(questionData?.question, cmd.guild);

        // The flowchart is already attached if we don't change the `files` param, we just need to reinsert the embed in the thumbnail
        questionEmbedBuild = EmbedBuilder.from(questionEmbed)
        questionEmbedBuild.setThumbnail("attachment://flowchart.png");

        await message.edit({ 
            embeds: [ answerEmbed, questionEmbedBuild ],
            // files: [ flowchartAttachment ],
            components: rows,
        });
        await cmd.deferUpdate();
        return;
    }

    // Autocomplete interactions are requesting what to suggest to the user to put in a command's string option
    if (cmd.isAutocomplete()) {
        const field = cmd.options.getFocused(true);
        const typedSoFar = field.value;

        switch(field.name) { // we base the switch off what the the felid is, either a topic autocomplete or a title autocomplete
            case "title":
                var subtopic = cmd.options.getSubcommand(false);

                // If this is an edit command, we need to extract the subtopic from the subtopic field since it doesn't use subcommands
                if (!subtopic) {
                    subtopic = cmd.options.getString('subtopic') || "";
                    if (!subtopics.includes(subtopic)) {
                        cmd.respond(arrayToAutocorrect(["Subtopic not found"]));
                        break;
                    }
                }

                const helpFile = getFileContent(subtopic);
                var helpMessagesTitles = getHelpMessageTitlesArray(helpFile)

                // Now we're going to filter our suggestions by similar the things are to what they've typed so far
                if (typedSoFar) { // only refine if they've started typing
                    const fuse = new Fuse(helpMessagesTitles.map(title => ({ title })), fuseOptions);            
                    const scoredResults = fuse.search(typedSoFar).sort((a, b) => a.score - b.score);
                    helpMessagesTitles = scoredResults.map(entry => entry.item.title);
                }
                
                cmd.respond(arrayToAutocorrect(helpMessagesTitles));
                break;
            
            case "subtopic":
                const options = subtopics.filter(subtopic => subtopic.startsWith(typedSoFar));
                cmd.respond(arrayToAutocorrect(options))
                break;

            case "chart":
                const chartOptions = getChartOptions();
                const matching = sortByMatch(chartOptions, typedSoFar);
                cmd.respond(arrayToAutocorrect(matching))
                break
        }
    }

    // Modal submit interactions from creating and editing messages
    else if (cmd.isModalSubmit()) {
        switch(cmd.customId) {
            case "editModal":
            case "createModal":
                const isEditing = cmd.customId == "editModal";

                // Some fields have embeded data, so extract that ( fieldName-data ) 
                const modalFields = cmd.fields.fields.map(field => field.customId);
                const subtopicFieldID = modalFields.filter(field => field.startsWith("S-"))[0];
                const titleFieldID = modalFields.filter(field => field.startsWith("T-"))[0];
                
                const message = cmd.fields.getTextInputValue('Message');
                const title = cmd.fields.getTextInputValue(titleFieldID);
                const subtopic = cmd.fields.getTextInputValue(subtopicFieldID);

                // Embeded data from fields, default to the current values if not specified
                const formerSubtopic = subtopicFieldID.split("-").slice(1).join("-") || subtopic;
                const formerTitle = titleFieldID.split("-").slice(1).join("-") || title;
            
                // Make sure topic exists
                if (!subtopics.includes(subtopic)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }
                
                // Make sure the title does not already exist (unless it's an edit AND it's going into the same file)
                // TODO: cleanup logic when it isn't 11:30 PM lol
                const tilesInNewLocation = getHelpMessageTitlesArray(getFileContent(subtopic));
                if (
                    // If this title already exists where we're trying to put it and we are create a new post
                    (tilesInNewLocation.includes(title) && !isEditing) || 
                    // Or if we're editing, and the subtopic changed
                    (tilesInNewLocation.includes(title) && isEditing && formerSubtopic != subtopic) ||
                    // Or if we're editing, the subtopic did not changed, but the name has (possibly mimicking another entry)
                    (tilesInNewLocation.includes(title) && isEditing && formerSubtopic == subtopic && title != formerTitle)
                ) {
                    cmd.reply({ content: "A Help Message already exists with that title in that location.", ephemeral: true })
                    break;
                }

                // Add / edit message
                if (isEditing) editHelpMessage(subtopic, title, message, formerTitle, formerSubtopic)
                else appendHelpMessage(subtopic, title, message);

                cmd.reply({ content: `${isEditing ? "This" : "Your"} Help Message has been ${isEditing ? "edited" : "added"}, thanks!`, ephemeral: true })
                
                // Rebuild the AI using this message
                rebuildHelpTools()
                break;
        }
    }

    // Command interactions
    else {
        switch(cmd.commandName) {
            case "admin":
                const ephemeral = cmd.options.getBoolean("private");
                
                if (cmd.user.id !== process.env.owner && !storage?.admins?.includes(cmd.user.id)) {
                    return cmd.reply({content:"You are not authorized to run this command", ephemeral})
                }

                const adminInput = cmd.options.getString("input");
                const adminChoice = cmd.options.getString("choice");

                switch (adminChoice) {
                    case "Adminize ID":
                    case "Whitelist ID":
                        var type = adminChoice == "Adminize ID" ? "admins" : "creators"
                        if (!adminInput.match(/^\d+$/)) {
                            return cmd.reply({content:"This command expects a discord ID of the user", ephemeral})
                        }
                        let newUsers = (storage?.[type] || []).concat(adminInput);
                        newUsers = [...new Set(newUsers)] // filter duplicates
                        storage[type] = newUsers;
                        return cmd.reply({content:"This user has been whitelisted", ephemeral})
                    
                    case "Unadminize ID":
                    case "Unwhitelist ID":
                        var type = adminChoice == "Unadminize ID" ? "admins" : "creators"
                        storage[type] = (storage?.[type] || []).filter(element => element !== item);
                        return cmd.reply({content:"This user has been removed from the whitelisted", ephemeral})

                    case "AI Pings Killswitch":
                        storage.AIPings = !storage.AIPings;
                        return cmd.reply({content:`AI ping responses have been ${storage.AIPings ? "enabled" : "disabled"}`, ephemeral})

                    case "AI AutoHelp Killswitch":
                        storage.AIAutoHelp = adminInput ? adminInput : false;
                        return cmd.reply({content:`AI AutoHelp has been ${adminInput ? `set to guild ${adminInput}` : `disabled`}`, ephemeral})

                    case "Dup Notif Killswitch":
                        storage.dupeNotifs = !storage.dupeNotifs;
                        return cmd.reply({content:`Duplicate question notifs have been ${storage.dupeNotifs ? "enabled" : "disabled"}`, ephemeral})

                    case "Restart":
                        if (ephemeral) {
                            await cmd.reply({ content: "Restarting...", ephemeral: true });
                            storage.restartData = null; // Don't try to update ephemeral messages
                        } else {
                            // For non-ephemeral messages, we need to send and store the message data
                            const message = await cmd.reply({ content: "Restarting...", ephemeral: false, withResponse: true });
                            storage.restartData = {
                                restartedAt: Date.now(),
                                channelId: cmd.channel.id,
                                messageId: message.id
                            };
                        }
                        console.log("Restarting...")
                        process.exit(0);
                }
                break

            case "help":
                // This command only works if it is installed in the server
                if (!cmd.guild) {
                    return cmd.reply({ content: "This command only works when the bot is installed in the server", ephemeral: true });
                }

                var chart = cmd.options.getString("chart");;
                const who = cmd.options.getUser("who") || cmd.user;

                var [mermaidPath, error] = await getPathToFlowchart(chart, true); // only fetching mermaid path
                if (error) {
                    cmd.reply({ content: error, ephemeral: true });
                    break
                }

                // Parse out the first question
                let mermaidJSON;
                try {
                    mermaidJSON = require(mermaidPath);
                } catch {
                    return cmd.reply({ content: "Sorry, this chart has malformed JSON.", ephemeral: true });
                }
                const [questionData, answersArray] = getQuestionAndAnswers(mermaidJSON)

                // Pack current data to history cache
                storage.cache[who.id] = {}
                storage.cache[who.id].helpHistory = []
                storage.cache[who.id]?.helpHistory.push([questionData, answersArray, cmd.id])

                // Now for building the embed
                const templateColor = parseInt(mermaidJSON.config?.color?.replaceAll("#", "") || "dd8836", 16)

                const [ flowchart, _ ] = await getPathToFlowchart(chart)
                const flowchartAttachment = new AttachmentBuilder(flowchart, { name: 'flowchart.png' });

                const embed = new EmbedBuilder()
                    .setColor(templateColor)
                    .setTitle(`Flowchart Walkthrough: \`${chart}\``)
                    .setThumbnail(`attachment://flowchart.png`)
                    .addFields(
                        // Instructions
                        { name: "Instructions", value: `Please answer these questions:` },
                        { name: '\n', value: '\n' },
                        // Question
                        { name: "Question:", value: postProcessForDiscord(questionData?.question, cmd.guild) },
                        { name: '\n', value: '\n' },
                        { name: '\n', value: '\n' },
                    )
                    .setFooter({ text: `Interaction ${cmd.id}`, iconURL: who.displayAvatarURL() });
                
                
                // Parse buttons - Each button's ID will be the AnswerID
                //                 The first button's ID will always always have "|<content>", 
                //                 where content is a json payload of userID and questionID
                const buttons = [];
                for (let i = 0; i < answersArray.length; i++) {
                    const answer = answersArray[i];
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(""+answer)
                            .setLabel(""+answer)
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                // Inject the JSON data into the first button ID
                if (buttons[0]) buttons[0].data.custom_id += "|" + JSON.stringify({
                    id: who.id,
                    questionID: questionData?.questionID,
                    chart,
                })

                // Cool concept of spreading it here but doesn't work when we hit a reply with only one button...
                // buttons.map(buttonData => {
                //     buttonData.custom_id += "|"
                //     const availableSpace = 100 - buttonData.custom_id.length;
                //     buttonData.custom_id += context.slice(0, availableSpace)
                //     context = context.slice(availableSpace);
                // })

                // Split buttons into rows of 5 (discord max)
                const rows = [];
                for (let i = 0; i < buttons.length; i += 5) {
                    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
                }

                // Send
                await cmd.reply({
                    content: `<@${who.id}>`,
                    embeds: [embed],
                    components: rows,
                    files: [ flowchartAttachment ]
                });
                
                break;
            
            case "lookup":
                const subtopic = cmd.options.getSubcommand();
                const messageTopic = cmd.options.getString("title");

                // Lookup response to this query
                const reply = getHelpMessageBySubjectTitle(subtopic, messageTopic);
                
                cmd.reply({ content: reply, ephemeral: true });
                break;

            case "flowchart":
                await cmd.deferReply(); // Puppeteer can take a while, this gives us much longer to respond
                var chart = cmd.options.getString("chart");
                const overrideCacheAttempt = cmd.options.getBoolean("override-cache")
                const overrideCache = overrideCacheAttempt && isCreator(cmd.user.id);
                const sendHTML = cmd.options.getBoolean("attach-html")

                var [chartPath, error] = await getPathToFlowchart(chart, false, sendHTML, overrideCache);
                if (error) {
                    cmd.followUp({ content: error, ephemeral: true });
                    break
                }

                var response = `Here is the \`${chart}\` chart`;
                // Add message if user tried to flush cache without perms
                if (overrideCacheAttempt != overrideCache) {
                    response += ` - cached was not overridden as you are not authorized to do so`
                }

                let files = [
                    new AttachmentBuilder(chartPath),
                ]
                if (sendHTML) files.push( new AttachmentBuilder(`./Flowcharts/generated.html`) ) // ideally the path would be determined by flowcharter.js, oh well 

                cmd.followUp({
                    content: response, 
                    files: files,
                    ephemeral: false
                });
                break

            case "edit_flowchart":
                if (!isCreator(cmd.user.id)) {
                    return cmd.reply({ content: "You are not authorized to use this command", ephemeral: true });
                }
                const fileUpload = cmd.options.getAttachment("file");
                var chart = cmd.options.getString("chart");
                var [chartPath, error] = await getPathToFlowchart(chart, true); // only fetching mermaid path
                if (error) {
                    cmd.reply({ content: error, ephemeral: true });
                    break
                }

                // If we have the file, we use it - otherwise, send the user the current file
                if (fileUpload) {
                    // // Error catching ideas, but might take more in depth function editing. Might be unecessary with the new processing method
                    // cmd.deferReply({ ephemeral: true });
                    // let hadError = false;
                    // try {
                    //     downloadFile(fileUpload.url, chartPath)
                    //     var [chartPath, error] = await getPathToFlowchart(chart, false, sendHTML, overrideCache);
                    //     if (error) hadError = true;
                    // } catch {
                    //     hadError = true;
                    // }

                    downloadFile(fileUpload.url, chartPath);
                    cmd.reply({
                        content: `The chart has been updated`, 
                        ephemeral: true
                    });
                } else {
                    let mermaidJSON = fs.readFileSync(chartPath);
                    // let mermaidJSON = require(chartPath);
                    cmd.reply({
                        content: 
                            `Here is the current \`${chart}\` flowchart`,
                            // + `## Flowchart must follow these rules:` +
                            // `1. Every "Question" has either:` +
                            // `   a. Named lines as options, going to the next questions` +
                            // `   b. Unnamed lines going to the next options, which each have a single link to the next question` +
                            // `2. All nodes must have IDs`,
                        files: [ 
                            new AttachmentBuilder(mermaidJSON, { name: `${chart}.txt` })
                        ],
                        ephemeral: true
                    });
                }
                break;

            case "edit": //both edit and create open basically the same modals
            case "create":
                const isEditing = cmd.commandName == "edit";

                // Check authorization
                if (!isCreator(cmd.member?.user?.id)) {
                    cmd.reply({ content: `You are not authorized to ${isEditing ? "edit" : "create"} messages.`, ephemeral: true })
                    break;
                }

                // Check if it's a valid topic
                const createSubtopic = cmd.options.getString("subtopic");
                if (!subtopics.includes(createSubtopic)) {
                    cmd.reply({ content: "That is not a valid subtopic.", ephemeral: true })
                    break;
                }

                // Create a modal
                const modal = new ModalBuilder()
                    .setCustomId(isEditing ? "editModal" : "createModal")
                    .setTitle(`"${isEditing ? "Edit a" : "Create a new"} Help Message"`);
                
                const title = new TextInputBuilder()
                    .setCustomId("T-") // we embed more data here later if editing
                    .setLabel("Title")
                    .setPlaceholder("Turret Remove Guide Card")
                    .setMaxLength(49)
                    .setStyle(TextInputStyle.Short);

                const category = new TextInputBuilder()
                    .setCustomId("S-"+createSubtopic) // We embed the subtopic in the ID in case it's changed so we can know which file the message came from (if moving from one stopic to another)
                    .setLabel("Subtopic")
                    .setPlaceholder("ide")
                    .setValue(createSubtopic)
                    .setStyle(TextInputStyle.Short);

                const message = new TextInputBuilder()
                    .setCustomId("Message")
                    .setLabel("Message")
                    .setPlaceholder("## You can use *Markdown*")
                    .setStyle(TextInputStyle.Paragraph);

                // If we're editing, lookup and set the values of each field so they don't have to be reentered to edit
                if (isEditing) {
                    // Fill title field
                    const titleToEdit = cmd.options.getString("title").match(/[\s\w\/&\(\)]/g).join(""); // Filter out special characters before using as custom ID - TODO this would be better placed in helpFileParse to keep regexes togetehr
                    title.setValue(titleToEdit);
                    title.setCustomId("T-"+titleToEdit)

                    // Confirm it is a valid title
                    if (!getHelpMessageTitlesArray(getFileContent(createSubtopic)).includes(titleToEdit)) {
                        cmd.reply({ content: "No Help Message exists with that title.", ephemeral: true })
                        break;
                    }

                    // Fill in message feild with current version
                    const messageContent = getHelpMessageBySubjectTitle(createSubtopic, titleToEdit);
                    message.setValue(messageContent);
                }
        
                const categoryRow = new ActionRowBuilder().addComponents(category);
                const titleRow = new ActionRowBuilder().addComponents(title);
                const messageRow = new ActionRowBuilder().addComponents(message);
                modal.addComponents(categoryRow, titleRow, messageRow);
        
                await cmd.showModal(modal);
                break;

            case "mark-robot":
                // Mark Robot takes a few seconds so we can't reply right away
                await cmd.deferReply({ ephemeral: true });

                const userID = cmd.member.user.id;

                const robotMessage = cmd.options.getString("message");
                const shouldClear = cmd.options.getBoolean("clear") || false;

                // Create a Robot instance for this user if they don't have one already
                if (shouldClear || !storage.cache.markRobotInstances[userID]) {
                    storage.cache.markRobotInstances[userID] = new MarkRobot({"useDevVersion":true});
                }

                // Get response from Mark Robot
                var response = await storage.cache.markRobotInstances[userID].message(robotMessage);

                cmd.editReply(response);
                break;
        }
    }
})

// Message handlers for Mark RoBot pings + auto AI
client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // Ignore bot messages

    // Fetch replied to message, since we use it for a few things
    let repliedMessage;
    if (message.reference) repliedMessage = await message.channel.messages.fetch(message.reference.messageId)

    ////// Mark Robot pings
    if (message.mentions.has(client.user)) {
        // Check if we've disabled RoBot
        if (!storage.AIPings && !storage?.admins.includes(message.author.id)) return;

        message.channel.sendTyping()

        // If the bot said something that was replied to, make sure it is in this user's bot history 
        //   (if they are replying to a message from someone else, we inject it into the history so that RoBot sees it)
        let repliedToAuthor, repliedToMessage;
        if (message.reference) {
            repliedToMessage = markRobotMessagePostProcess(repliedMessage.content, message.guild);
            // post-process usernames for mark robot
            if (repliedMessage.author.id === client.user.id) {
                repliedToAuthor = "you"
            } else {
                repliedToAuthor = repliedMessage.author.username;
            }
        }

        const messageContentForRobot = markRobotMessagePostProcess(message.content, message.guild);

        // Grab / create history - history is reset every new channel you talk to him in
        let userHistory = storage.cache.markRobotPingsCache[message.author.id] || { 
            lastChatLoc: "", 
            markRobot: new MarkRobot({"useDevVersion":true}) 
        };

        if (message.channelId !== userHistory.lastChatLoc)
            userHistory = { 
                lastChatLoc: "", 
                markRobot: new MarkRobot({"useDevVersion":true}) 
            };

        // Get RoBot's reply
        const robotsReply = await userHistory.markRobot.message(messageContentForRobot, repliedToMessage, repliedToAuthor)

        // Store for the cases where we lose the reference
        storage.cache.markRobotPingsCache[message.author.id] = userHistory

        // Finally, send RoBot reply
        message.reply(robotsReply);
    }

    ////// AutoReply AI for auto FAQ lookups
    const aiForceTrigger = "!ai "
    const aiNoCacheTrigger = "!nocache "
    const messageHasForceTrigger = message.content.toLowerCase().startsWith(aiForceTrigger);
    const messageHasNoCacheTrigger = message.content.toLowerCase().startsWith(aiNoCacheTrigger);
    // const aiDontRepeatCacheKey = `${message.author?.id}-${message.channelId}`;
    const aiDontRepeatCacheKey = `${message.author?.id}`;
    if (
        !repliedMessage && // Don't run if it was a reply to smth
        (
            (storage.AIAutoHelp && storage.AIAutoHelp == message.guildId) ||
            messageHasForceTrigger
        ) &&
        (
            (
                (
                    !autoAICache.has(aiDontRepeatCacheKey) ||
                    messageHasNoCacheTrigger
                ) &&
                isHelpRequest(message.content)
            ) ||
            (
                messageHasForceTrigger
            )
        )
    ) {
    // Don't reply to this user in this channel after triggering for an hour
        if(messageHasForceTrigger) {
            autoAICache.del(aiDontRepeatCacheKey)
            message.content = message.content.substring(aiForceTrigger.length)
        }
        else {
            autoAICache.set(aiDontRepeatCacheKey, true)
        } 

        // Ignore the cache spam prevension for developing
        if (messageHasNoCacheTrigger) message.content = message.content.substring(aiNoCacheTrigger.length)

        try {
            console.log("Running AutoAI")
            const geminiSession = geminiModel.startChat();

            let messageGeminiPostProcess = 
                `The user's message is as follows:\n`+
                `${tripleBacktick}\n` + 
                `${message.content}\n` +
                `${tripleBacktick}\n` + 
                `\n`

            // if (repliedMessage) {
            //     let byADiffUser = repliedMessage.author.id !== message.author.id ? " by a different user" : "";
            //     messageGeminiPostProcess +=
            //         `The user was replying this message${byADiffUser}:\n`+
            //         `${tripleBacktick}\n` + 
            //         `${repliedMessage.content}\n` +
            //         `${tripleBacktick}\n` + 
            //         `\n`
            // }
            
            messageGeminiPostProcess +=
                `If you believe one of the FAQs directly answers the 1st user's question, send it, otherwise don't respond.`

            const result = await geminiSession.sendMessage(messageGeminiPostProcess);
            
            const responseText = result.response.text()
            const responseJSON = JSON.parse(responseText);
            const responseNumber = +responseJSON.chosen_response;
            console.log(
                `=`.repeat(50) +
                `\n` +
                `AI triggered question by ${message.author.displayName || message.author.username}:\n` +
                `${messageGeminiPostProcess}`
            );
            console.log(responseJSON);
            if (!isNaN(responseNumber) && responseNumber !== 0)
                autoAIFunctions.runFAQ({ num: +responseJSON.chosen_response }, message)

            //// Tool code. I think it preforms better when explaining it's thought process, and it makes it easier to update.
            // const requestedTool = result.response.functionCalls()[0]; // Only grab the first call, consider making this clear to gemini.
            // const requestedFunction = autoAIFunctions[requestedTool.name];
            // if (requestedFunction) {
            //     // Execute the function, which will take care of replies by itself. No need to reprompt gemini
            //     // TODO: if gemini behaves poorly, consider reprompt loop to ask it if the FAQ answers the question 
            //     await requestedFunction(requestedTool.args, message);
            // } else {
            //     console.log("Requested tool doesn't exist:", requestedTool)
            // }
        } catch (error) {
            console.log("AI error:", error)
        }
    }

    ////// Repeat messages notices
    const authorID = message.author.id;
    repeatQuestions[authorID] = repeatQuestions[authorID] || [] //{message: "", channelID: 0, repeats: 0}

    // Find/create message
    let existingQuestion = repeatQuestions[authorID].find(q => areTheSame(message.content, q.message));
    if (existingQuestion) {
        if (existingQuestion.channelID !== message.channel.id && existingQuestion.guildId == message.guildId) {
            // If this is a different channel, increment it
            existingQuestion.repeats += 1;
        }
        existingQuestion.channelID = message.channel.id
        existingQuestion.guildId = message.guildId
    } else {
        existingQuestion = { 
            guildId: message.guildId,
            message: message.content, 
            channelID: message.channelId, 
            repeats: 1,
            originalLink: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}` 
        }
        repeatQuestions[authorID].push(existingQuestion);
    }
    
    // Only keep the latest 3 messages from each user to check if duplicated
    if (repeatQuestions[authorID].length > 3) {
        repeatQuestions[authorID].shift();
    }

    // Now, if this message meets specific conditions, we'll reference the original one.
    const normalizedContent = message.content.toLowerCase().replace("'", "");
    if (
        storage.dupeNotifs &&
        existingQuestion.guildId == message.guildId &&
        existingQuestion.repeats > 1 &&
        message.length >= 30 &&
        isHelpRequest(normalizedContent)
    ) {
        try {
            // Make sure the original wasn't deleted before commenting
            const originalChannelId = existingQuestion.originalLink.split('/')[5];
            const originalChannel = await client.channels.fetch(originalChannelId);
            const originalMessage = await originalChannel.messages.fetch(existingQuestion.originalLink.split('/').pop());
            if (originalMessage) {
                message.reply(`-#  <:info:1330047959806771210> This appears to be a duplicate question. The original question was asked here ${existingQuestion.originalLink}`);
            }
        } catch (error) {
            // If the original message was deleted, set this message as the original
            existingQuestion.repeats = 1;
            existingQuestion.originalLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
        }
    }
});

// Other listeners
client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    try {
        const restartUpdateThreshold = 10000;
        const rebootData = storage.restartData;
        
        if (!rebootData) return;
        
        const { restartedAt, channelId, messageId } = rebootData;
        const timeSinceRebootCommand = Date.now() - restartedAt;
        console.log(`Last restarted ${timeSinceRebootCommand/1000} seconds ago`);
        
        if (timeSinceRebootCommand < restartUpdateThreshold) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (!channel) {
                    console.error("Channel not found");
                    return;
                }
                
                const message = await channel.messages.fetch(messageId);
                if (!message) {
                    console.error("Message not found");
                    return;
                }
                
                await message.edit({
                    content: `Rebooting... done - took ${(timeSinceRebootCommand/1000).toFixed(2)} seconds`
                });
                
            } catch (error) {
                console.error("Error updating restart message:", error);
            }
        }

        // Clear restart data after booting
        storage.restartData = null;
    } catch (error) {
        console.error("Error in ready event:", error);
    }
});

// Handle message reactions for help message creators/admins
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Fetch partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
        }
    }

    if (['❌', '👎', ":x:", ":thumbsdown:"].includes(reaction.emoji.name)) {
        // Check if message is from the bot
        if (reaction.message.author.id !== client.user.id) return;

        // Check if reactor is creator/admin
        if (!isCreator(user.id) && !storage?.admins?.includes(user.id)) return;

        // If those conditions are met, delete the message.
        try {
            await reaction.message.delete();
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
});


//#endregion Handlers

// Error handling (async crashes in discord.js threads can still crash it)
const handleException = (e) => console.log(e); // TODO: notify myself through webhooks
process.on('unhandledRejection', handleException);
process.on('unhandledException', handleException);

// Start
client.login(beta ? process.env.betaToken : process.env.token);
