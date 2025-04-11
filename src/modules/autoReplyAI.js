// Class to handle discord AutoReplies using multistage LLM calling for finetuned results.

// TODO:
// Eventually I'd like to refractor this file so that each stage is a json data object of schema, prompt, calling function, and it passes it on to the next stage

const { GoogleGenerativeAI, FunctionCallingMode, SchemaType } = require("@google/generative-ai");
const NodeCache = require("node-cache");
const { isHelpRequest, getHelpMessageBySubjectTitle } = require('../modules/utils');
const tripleBacktick = '```'
const { ChannelType, PermissionsBitField } = require("discord.js")

// Per-box information given to the AI.
const subtopicInfoMap = {
    "turret": "This is the IR Turret. This box uses an IR remote to control a 3 axis turret that shoots foam darts.",
    "domino-robot": "This is the Domino Robot. This box is a simple line(black/white tape)-following robot that lays down dominos. It uses two IR object sensors to stay centered over the line",
    "label": "This is the Label Maker. This box moves a pen up and down on a Y motor, and rolls take with the X motor to draw letters.",
    "sandy": "This is the Sand Garden. This box is a small zen sand garden using two stepper motors to move arms moving a magnetic ball in patterns.",
    "laser-tag": "This is the IR Laser Tag. This box has two IR laser tag guns, each connected to a pair of goggles with receivers that dim when you are shot.",
    "balance": "This is the Balance Bot. This is a classic bot that balances on two wheels.",
    "ide": "This is the coding IDE. These boxes use ae custom branded online IDE (which in turn uses a branded Arduino Create Agent to allow the browser to connect to the arduino) to code the projects. Some people prefer other IDEs like the Arduino IDE, but these take more setup work and are only advised when the user requests it. A lot of users may refer to coding as \"Hacking\", as this is the language the product is advertised with."
}

// Setup AI data
const stage1SystemPrompt = 
`- You are an advanced AI assistant designed to tie user queries to matching predefined "help messages" (FAQs) when applicable.
- Queries are posted in a large discord server, not every query is related to you. If it does not seem to be related to the FAQs, respond with 0.
- If you are sure that a given FAQ title matches the provided question, use the relevant tool to activate that FAQ using it's number.
- If no FAQ matches, respond with 0.
- If you are not 100% confident that an FAQ would be helpful and relevant, respond with 0.
- Sometimes some users are helping other users. If one user answers another user's question already, there is no point sending an FAQ so respond with 0.
- If the user appears to be talking to someone else directly and is claiming something, for example in a message like "Did you try running the IDE as administrator?", it sounds like the user is trying to advice someone else. In this case they don't need help, response with 0.
- Do not extrapolate meaning too far, better to miss a vague question than answer something unrelated.

For more context, you are helping answer questions about Arduino subscription box projects, including:
- IR Turret. This box uses an IR remote to control a 3 axis turret that shoots foam darts.
- Domino Robot. This box is a simple line-following robot that lays down dominos.
- Label Maker. This box moves a pen up and down on a Y motor, and rolls take with the X motor to draw letters.
- Sandy Garden. This box is a small zen sand garden using two stepper motors to move arms moving a magnetic ball in patterns.
- IR Laser Tag. This box has two IR laser tag guns, each connected to a pair of goggles with receivers that dim when you are shot.
- Balance Bot. This is a classic bot that balances on two wheels.

Other categories:
- IDE. These boxes use are using a custom branded online IDE to code them. Some people prefer other IDEs like the Arduino IDE, but these take more setup work. A lot of users may refer to coding as "Hacking", as this is the language the product is advertised with.
- General. A category for anything that doesn't fit elsewhere.

The user is currently asking their question in the thread: {channelInfo}

Here is a list of each FAQ you can select from:
0. No response is a confident match.
{FAQs}`;

const stage2SystemPrompt = 
`# Behavior
You are an advanced AI assistant called 'Hack Pack Lookup' designed tailor FAQs related to user questions to the user's specific scenario.

Your job consists of 4 tasks:
1. Process whether you think the FAQ can reliably be used as the primary source to answer the questions, and whether it is helpful in this context.
    1.1. You will be provided recent messages in this thread, use these to judge how helpful the FAQ will be.
    1.2. If user is helping another user, or currently is being helped by another user, the FAQ is *NOT RELEVENT* to them. 
    1.3. FAQs are only relevent when you can use the information in them as the primary source to fully help the user. Even if you can answer the question yourself without the FAQ, the FAQ relevence is low.
2. Evaluate how relevent the FAQ provided is related to and answers the question of the user. 
3. Tailor the information in the FAQ to the user, filling in details where needed, removing details when they do not apply to the user. This is the central part of your response, containing the response text. Using basic Markdown here is acceptable.
4. Rate how confident you are that your tailored response was relevant to the user, is helpful in this conversation, and does not get in the way of users helping each other.

# Context
You are talking to the user named {username}, who is asking their question in the thread: {channelInfo}

You are helping answer questions about arduino subscription box projects released as toys by CrunchLabs.
These boxes use ae custom branded online IDE to code them. (Some people prefer other IDEs like the Arduino IDE, but these take more setup work).

The selected FAQ is related to the category \`{subtopic}\`, here's some additional information about this category:
{subtopicInfo}

The following FAQ response was automatically selected by AI based on the title only. It may or may not be relevent.
The title is "{FAQTitle}", and the content is as follows: 
${tripleBacktick}
{FAQ}
${tripleBacktick}

Here is a conversation log of the last {numMessages} messages. You are not answering any questions in this conversation, this is merely context regarding the question at hand.
Conversation:
${tripleBacktick}
{messages}
${tripleBacktick}

If the FAQ is *related to the conversation*, but not helpful to single question at hand, the FAQ is **irrelevant**.

The single question at hand will be provided shortly by the user.
`

// Just a trial for now:
const formTaggerPrompt = 
`- You are an advanced AI assistant designed to add tags to user form posts.
- Your task is to identify which tags are most appropriate based off the details you know.
- If the user query does not match any known forms, an empty array is acceptable."

For more context, you are helping answer questions about Arduino subscription box projects, including: {extraInfo}

Please select which out of these tags that apply to the user's message: {tags}
`
// TODO: storage whitelist of tags the AI is allowed to apply

const formAutoTaggerSchema = {
    "type": SchemaType.OBJECT,
    "properties": {
        "thoughts": {
            "type": SchemaType.STRING
        },
        "tags": {
            "type": SchemaType.ARRAY,
            "items": {
                "type": SchemaType.STRING
            }
        },
    },
    required: [
        "thoughts",
        "tags"
    ],
    propertyOrdering: [
        "thoughts",
        "tags"
    ]
}


const stage1ResponseSchema = {
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
        "chosen_response",
        "confidence"
    ],
    propertyOrdering: [
        "thoughts",
        "chosen_response",
        "confidence"
    ]
}


const stage2ResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        "thoughts": {
            description: "Think about whether the given question can be reliably answered with the provided information.",
            type: SchemaType.STRING,
            nullable: false,
        },
        "reliably_confidence": {
            description: "How confident you are that FAQ answers the question, from 1 (somewhat confident) to 5 (very confident).",
            type: SchemaType.INTEGER,
        },
        "tailored_response": {
            description: "Your answer that the user will see.",
            type: SchemaType.STRING,
            nullable: false,
        },
        "confidence": {
            description: "How confident you are that your answer is relevant and correct, from 1 (somewhat confident) to 5 (very confident).",
            type: SchemaType.INTEGER,
        }
    },
    required: [
        "thoughts",
        "reliably_confidence",
        "tailored_response",
        "confidence"
    ],
    propertyOrdering: [
        "thoughts",
        "reliably_confidence",
        "tailored_response",
        "confidence"
    ]
}

// Replying to help messages
class AutoReplyAI {
    constructor() {
        this.autoAICache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Used to only check posted questions that are "out of the blue" not in a long convo
        this.helpMessageList = [];
        this.aiForceTrigger = "!ai ";
        this.aiNoCacheTrigger = "!nocache ";
        this.model = "gemini-2.0-flash";
        this.genAI = new GoogleGenerativeAI(process.env.GeminiKey);
        this.stage1RequiredConfidence = 3;  // How sure stage1 is that there is a matching FAQ (this will be rejudged by stage2 with extra context, so low is fine)
        this.stage2MessageCount = 8;        // How much context to pull in
        this.stage2PrecisionThreshold = 4;  // How related the FAQ that stage 1 gave was - arguably this is the most important number as it chooses how much the fixed FAQ will be used 
        this.stage2ConfidenceThreshold = 4; // How confident in the final answer stage2 must be.
    }

    formatAIResponse(text) {
        //// Postprocess
        // It sometimes makes the link and link text the same, fix that
        text = text.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
            return text === url ? url : match;
        });        
        
        return (
            '=== I have attempted to automatically answer your question ===\n' +
            // '\n' +
            // '```\n' +
            // text.replaceAll("```", "\\`\\`\\`") +
            ("> " + text.split("\n").join("\n> ")) + // Format like a quote
            '\n' +
            // '```\n' +
            `\n-# ⚠️ This response was written by AI and may be incorrect.`
        )
    }

    getFaqByNum(num) {
        const selectedHelpMessageTitle = this.helpMessageList[num];
        if (!selectedHelpMessageTitle) return false;

        const helpMessage = getHelpMessageBySubjectTitle(selectedHelpMessageTitle.subtopic, selectedHelpMessageTitle.title);
        if (!helpMessage) return false;

        return { message: helpMessage, FAQTitle: selectedHelpMessageTitle.title, subtopic: selectedHelpMessageTitle.subtopic };
    }

    async messageHandler(discordMessage) {
        try {
            const messageHasForceTrigger = discordMessage.content.toLowerCase().startsWith(this.aiForceTrigger);
            const messageHasNoCacheTrigger = discordMessage.content.toLowerCase().startsWith(this.aiNoCacheTrigger);
            const aiDontRepeatCacheKey = `${discordMessage.author?.id}`;

            // Fetch replied to message if it wasn't already fetched
            let repliedMessage = discordMessage.referenceData; // just where I want to store it
            if (!repliedMessage && discordMessage.reference) {
                repliedMessage = discordMessage.referenceData = await discordMessage.channel.messages.fetch(discordMessage.reference.messageId)
            }
        
            let preliminaryTrigger = (
                !repliedMessage && // Don't run if it was a reply to smth
                (
                    (storage.AIAutoHelp && storage.AIAutoHelp == discordMessage.guildId) ||
                    messageHasForceTrigger
                ) &&
                (
                    (
                        (
                            !this.autoAICache.has(aiDontRepeatCacheKey) ||
                            messageHasNoCacheTrigger
                        ) &&
                        isHelpRequest(discordMessage.content)
                    ) ||
                    (
                        messageHasForceTrigger
                    )
                )
            )

            if (preliminaryTrigger) {
                console.log("Running AutoAI")

                // Don't reply to this user in this channel after triggering for an hour
                if (messageHasForceTrigger) {
                    this.autoAICache.del(aiDontRepeatCacheKey)
                    discordMessage.content = discordMessage.content.substring(this.aiForceTrigger.length)
                }
                else {
                    this.autoAICache.set(aiDontRepeatCacheKey, true)
                }

                // Ignore the cache spam prevention for dev testing
                if (messageHasNoCacheTrigger)
                    discordMessage.content = discordMessage.content.substring(this.aiNoCacheTrigger.length)

                
                console.log(`=`.repeat(50)+`\n`)

                // Run through stage1 AI
                console.log(`Passing into stage1`)
                const stage1Out = await this.stage1AIHandler(discordMessage);
                if (!stage1Out) return false;

                // Pass through stage2

                console.log(`Passing into stage2`)
                const stage2Out = await this.stage2AIHandler(discordMessage, stage1Out)
                if (!stage2Out) return false;

                // If we've come this far, we have a response the AI is confident in
                let response = stage2Out.tailored_response;
                response = this.formatAIResponse(response);

                discordMessage.reply(response);

                console.log(`=`.repeat(50)+`\n`)
            }

        } catch (error) {
            console.log("AI error:", error)
            return false;
        }
    }

    getChannelInfo(discordMessage) {
        // Simple function to give the channel name to the AI to help it have more context about what is being asked
        let channelName = `#${discordMessage.channel.name}`
        const parent = discordMessage.channel.parent;
        if (parent) channelName = `${parent.name} > ${channelName}`

        return channelName;
    }
    
    // Stage 1:
    // Select relevant FAQ from list of titles and user message
    buildStage1Model(discordMessage) {
        let compiledSystemPrompt = stage1SystemPrompt;
        // Build FAQs into the prompt
        const faqs = [];
        let index = 1;
        const subtopics = Object.keys(storage.helpMessages);
        for (const subtopic of subtopics) {
            const helpMessages = storage.helpMessages[subtopic];
            helpMessages.forEach(message => {
                this.helpMessageList[index] = { title: message.title, subtopic };
                faqs.push(`${index}. ${message.title} | (${subtopic})`);
                index++;
            });

        }

        compiledSystemPrompt = compiledSystemPrompt
            .replace("{FAQs}", faqs.join("\n"))
            .replace("{channelInfo}", this.getChannelInfo(discordMessage))

        return this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: compiledSystemPrompt,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: stage1ResponseSchema,
            }
        });
    }

    async stage1AIHandler(discordMessage) {
        const geminiSession = this.buildStage1Model(discordMessage).startChat();
        const result = await geminiSession.sendMessage(discordMessage.content);

        const responseText = result.response.text()
        const responseJSON = JSON.parse(responseText);
        const responseNumber = +responseJSON.chosen_response;
        const confidence = +responseJSON.confidence;

        console.log(
            `AI triggered question by ${discordMessage.author.displayName || discordMessage.author.username}:\n` +
            `${discordMessage.content}`
        );
        console.log(`Stage1:\n`, responseJSON);

        if (
            isNaN(responseNumber) || responseNumber == 0 ||
            isNaN(confidence) || confidence < this.stage1RequiredConfidence
        ) return false;

        const { message, FAQTitle, subtopic } = this.getFaqByNum(responseNumber);
        if (!message) return false;
        
        return { FAQ: message, FAQTitle, subtopic };
    }

    // Stage 2:
    // This stage tailors the response specifically to this user's case with this FAQ. 
    // It takes in the selected FAQ and category, builds a prompt with additional details of relevant boxes
    async fetchRecentMessages(discordMessage, limit=50) {
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    
        const fetchedMessages = await discordMessage.channel.messages.fetch({ 
            limit, 
            before: discordMessage.id 
        });
    
        const recentMessages = fetchedMessages.filter(msg => msg.createdTimestamp >= thirtyMinutesAgo);
    
        const inlineFormattedMessages = recentMessages.map(msg => 
            `[${msg.createdAt.toLocaleTimeString()}] ${msg.author.username}: ${msg.content}`
        ).join("\n");
    
        return {messageText: inlineFormattedMessages, numMessages: recentMessages.size };
    }
    
    async stage2AIHandler(discordMessage, { FAQ, FAQTitle, subtopic }) {
        let compiledSystemPrompt = stage2SystemPrompt;

        const { messageText, numMessages } = await this.fetchRecentMessages(discordMessage, this.stage2MessageCount)
        const subtopicInfo = subtopicInfoMap[subtopic]

        //// Generate prompt and create model
        compiledSystemPrompt = compiledSystemPrompt
            .replace("{messages}", messageText)
            .replace("{numMessages}", numMessages)
            .replace("{username}", discordMessage.author.username)
            .replace("{FAQ}", FAQ)
            .replace("{FAQTitle}", FAQTitle)
            .replace("{subtopic}", subtopic || "<none provided")
            .replace("{subtopicInfo}", subtopicInfo || "<none provided")
            .replace("{channelInfo}", this.getChannelInfo(discordMessage))

        const model = this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: compiledSystemPrompt,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: stage2ResponseSchema,
            }
        });

        //// Call model with user question
        const geminiSession = model.startChat();
        const result = await geminiSession.sendMessage(discordMessage.content);
        const responseText = result.response.text();

        const responseJSON = JSON.parse(responseText);
        const FAQPrecision = +responseJSON.reliably_confidence; // Rating on whether we selected the correct FAQ
        const tailored_response = responseJSON.tailored_response;
        const confidence = +responseJSON.confidence; // How confident it is that it's response is correct

        console.log(`Stage2:\n`, responseJSON);

        if (FAQPrecision < this.stage2PrecisionThreshold) return false;
        if (confidence < this.stage2ConfidenceThreshold) return false;

        return { tailored_response };
    }
    
}


// Auto tagging forums with relevant tags
class AutoTaggerAI {
    constructor() {
        this.autoAICache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Used to only check posted questions that are "out of the blue" not in a long convo
        this.helpMessageList = [];
        this.model = "gemini-2.0-flash";
        this.genAI = new GoogleGenerativeAI(process.env.GeminiKey);
    }

    buildModel(tags) {
        const extraInfo = Object.entries(subtopicInfoMap)
            .map(([box, content]) => `\n- ${box}: ${content}`)
            .join("");
        
        const compiledSystemPrompt = formTaggerPrompt
            .replace("{extraInfo}", extraInfo)
            .replace("{tags}", tags
                .map(tag => `\n- ${tag.name}`)
                .join("")
            );

        return this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: compiledSystemPrompt,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: formAutoTaggerSchema,
            }
        });
    }

    async messageHandler(message) {
        // Form auto-tagger - TODO: move to separate file
        if (storage.autoTagger && message.channel.isThread() && message.channel?.parent?.type === ChannelType.GuildForum) {
            const starterMessage = await message.channel.fetchStarterMessage();

            const botMember = await message.channel.guild.members.fetch(client.user.id);
            const permissions = message.channel.permissionsFor(botMember);

            if (permissions.has(PermissionsBitField.Flags.ManageThreads) && message.id === starterMessage?.id) {
                // If this is the original message of the form and we can manage it

                const appliedTags = message.channel.appliedTags;
                if (appliedTags.length == 0) {
                    // If no tags were applied - time for gemini to apply them
                    const availableTags = message.channel.parent.availableTags;

                    // Feed through model
                    const model = this.buildModel(availableTags);
                    const geminiSession = model.startChat();
                    const result = await geminiSession.sendMessage(
                        `Title: ${starterMessage.channel.name}\n`+
                        `---\n`+
                        `${message.content}`
                    );
            
                    const responseText = result.response.text();
                    const responseJSON = JSON.parse(responseText);
                    const thoughts = responseJSON.thoughts;
                    const tagNames = responseJSON.tags;

                    console.log("======= Auto Tagger AI ======= ");
                    console.log("thoughts:", thoughts);
                    console.log("Chosen tags:", tagNames);
                    console.log("=======    ========    ======= ");

                    const tagsToApply = availableTags.filter(tag => tagNames.includes(tag.name));
                    if (tagsToApply.length > 0) {
                        await message.channel.setAppliedTags(tagsToApply.map(tag => tag.id));
                    }
                }
            }
        }
    }
}


module.exports = {
    AutoReplyAI: new AutoReplyAI(),
    AutoTaggerAI: new AutoTaggerAI()
};
