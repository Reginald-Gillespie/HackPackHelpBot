// Class to handle discord AutoReplies using multistage LLM calling for finetuned results.

const os = require('os');
const fs = require("fs");
const fse = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const NodeCache = require("node-cache");
const simpleGit = require('simple-git');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { ConfigDB, StoredMessages } = require('../modules/database');
const { ChannelType, PermissionsBitField } = require("discord.js")
const { isHelpRequest, getHelpMessageBySubjectTitle } = require('../modules/utils');

const git = simpleGit();

// Import AI data
const stage1SystemPrompt = fs.readFileSync(path.join(__dirname, '../assets/stage1SystemPrompt.txt'), 'utf-8');
const stage2SystemPrompt = fs.readFileSync(path.join(__dirname, '../assets/stage2SystemPrompt.txt'), 'utf-8');
const forumTaggerPrompt = fs.readFileSync(path.join(__dirname, '../assets/forumTaggerPrompt.txt'), 'utf-8');

const forumAutoTaggerSchema = require("../assets/forumAutoTaggerSchema")
const stage1ResponseSchema = require("../assets/stage1ResponseSchema")
const stage2ResponseSchema = require("../assets/stage2ResponseSchema")

// Per-box information given to the AI.
const subtopicInfoMap = require("../assets/subtopicInfoMap.json")


// Utils 
function getChannelInfo(discordMessage) {
    // Simple function to give the channel name to the AI to help it have more context about what is being asked
    let channelName = `#${discordMessage.channel.name}`
    const parent = discordMessage.channel.parent;
    if (parent) channelName = `${parent.name} > ${channelName}`

    return channelName;
}

function formatAIResponse(text, 
    disclaimer="-# ⚠️ This response was written by AI and may be incorrect."
) {
    //// Postprocess
    // It sometimes makes the link and link text the same, fix that
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
        return text === url ? url : match;
    });

    return (
        // '=== I have attempted to automatically answer your question ===\n' +
        // '\n' +
        // '```\n' +
        // text.replaceAll("```", "\\`\\`\\`") +
        ("> " + text.split("\n").join("\n> ")) + // Format like a quote
        '\n' +
        // '```\n' +
        `\n${disclaimer}`
    )
}

class AdvancedAIAgent {
    // This AI agent is powered by Gemini CLI. It is used less often, but it has capabilities including:
    // - More powerful AI models
    // - Googling
    // - Reading files
    // - Access to Hack Pack code
    // - Memory (currently disabled)

    constructor() {
        this.geminiPath = path.join(process.cwd(), "./node_modules/.bin/gemini");
        this.advancedAgentPath = "./GeminiAgent";
        this.AdvancedAIContext;
        this.faqTitle = 
            "Prompt Advanced Agent - "+
            "This Agent knows little about specific Hack Pack issues, "+
            "but it is very good at general factual engineering questions, research, and coding."+
            "It has access to source code for all Hack Pack Boxes."+
            "If the question only matches this or if it starts with !ai strongly consider using this module."

        // Build the GeminiAgent dir, but async so it doesn't impact start time
        this.loaded = false;
        this.loadPromise = new Promise(async (resolve, reject) => {

            // Load stuff
            this.AdvancedAIContext = await fs.promises.readFile(path.join(__dirname, "../assets/AdvancedAIContext.txt"))
            this.AdvancedAIContext = this.AdvancedAIContext?.toString()?.trim() || false;

            // Setup Advanced Dir
            await fs.promises.mkdir(this.advancedAgentPath, { recursive: true });
            const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'HackPackCode-'));

            // Clone Hack Pack code into this folder
            await git.clone(
                'https://github.com/Reginald-Gillespie/HackPackCode.git', 
                tempDir,
                ['--depth=1']
            )

            // Extract the "Code" folder
            await fse.move(
                path.join(tempDir, "Code"),
                path.join(this.advancedAgentPath),
                { overwrite: true }
            );

            // Write config files
            await fs.promises.mkdir(
                path.join(this.advancedAgentPath, ".gemini"), 
                { recursive: true }
            );
            await fs.promises.copyFile(
                path.join(__dirname, "../assets/GeminiCLIConfig.jsonc"),
                path.join(this.advancedAgentPath, ".gemini", "settings.json")
            )
            await fs.promises.copyFile(
                path.join(__dirname, "../assets/GeminiENV.env"),
                path.join(this.advancedAgentPath, ".gemini", ".env")
            )

            resolve();
        })

    }

    async prompt(message) {
        message = message.content;

        if (!this.loaded) await this.loadPromise;

        // Tack on some contextual information to the prompt
        if (this.AdvancedAIContext) {
            message = 
                "```\n" + 
                this.AdvancedAIContext + "\n" +
                "```\n" +
                "\n"+
                message
        }

        return new Promise((resolve, reject) => {
            const child = spawn(this.geminiPath, ['--prompt', message], {
                cwd: this.advancedAgentPath,
            });
            child.stdin.end();

            let output = '';
            child.stdout.on('data', chunk => output += chunk.toString());
            child.stderr.on('data', err => reject(new Error(err.toString())));
            child.on('error', reject);
            child.on('close', code => {
                // Postprocess output
                output = output.replaceAll("Data collection is disabled.", "")
                output = output.trim()

                console.log("Advanced Agent response: ", output);

                code === 0 ? resolve(output.trim()) : reject(new Error(`Exited with code ${code}`));
            });
        });
    }
}

// Replying to help messages
class AutoReplyAI {
    constructor() {
        this.aiForceTrigger = "!ai ";
        this.aiNoCacheTrigger = "!nocache ";
        this.model = "gemini-2.5-flash";

        this.autoAICache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Used to only check posted questions that are "out of the blue" not in a long convo
        this.genAI = new GoogleGenerativeAI(process.env.GeminiKey);
        this.generalAgent = new AdvancedAIAgent();

        this.helpMessageList = [];
        this.stage1RequiredConfidence = 3;  // How sure stage1 is that there is a matching FAQ (this will be rejudged by stage2 with extra context, so low is fine)
        this.stage2MessageCount = 8;        // How much context to pull in
        this.stage2PrecisionThreshold = 4;  // How related the FAQ that stage 1 gave was - arguably this is the most important number as it chooses how much the fixed FAQ will be used 
        this.stage2ConfidenceThreshold = 4; // How confident in the final answer stage2 must be.
    }

    // Entrypoint
    async messageHandler(discordMessage, trusted=false) {
        // Trusted users are more likely to trigger higher power AI, for example.

        try {
            const messageHasForceTrigger = discordMessage.content.toLowerCase().startsWith(this.aiForceTrigger);
            const messageHasNoCacheTrigger = discordMessage.content.toLowerCase().startsWith(this.aiNoCacheTrigger);
            const aiDontRepeatCacheKey = `${discordMessage.author?.id}`;

            // Fetch replied to message if it wasn't already fetched
            let repliedMessage = discordMessage.referenceData; // just where I want to store it
            if (!repliedMessage && discordMessage.reference) {
                repliedMessage = discordMessage.referenceData = await discordMessage.channel.messages.fetch(discordMessage.reference.messageId)
            }

            const config = await ConfigDB.findOne({});
        
            let preliminaryTrigger = (
                !repliedMessage && // Don't run if it was a reply to smth
                (
                    (config.AIAutoHelp && config.AIAutoHelp == discordMessage.guildId) ||
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
                    if (!trusted) discordMessage.content = discordMessage.content.substring(this.aiForceTrigger.length)
                }
                else {
                    this.autoAICache.set(aiDontRepeatCacheKey, true)
                }

                // Ignore the cache spam prevention for dev testing
                if (messageHasNoCacheTrigger) {
                    discordMessage.content = discordMessage.content.substring(this.aiNoCacheTrigger.length)
                }
                
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
                response = formatAIResponse(response);

                discordMessage.reply(response);

                console.log(`=`.repeat(50)+`\n`)
            }

        } catch (error) {
            console.log("AI error:", error)
            return false;
        }
    }

    // Stage 1:
    // Select relevant FAQ from list of titles and user message
    async buildStage1Model(discordMessage) {
        let compiledSystemPrompt = stage1SystemPrompt;
        // Build FAQs into the prompt
        const faqs = [];
        // const config = await ConfigDB.findOne({});

        // Build subtopics
        const allMessages = await StoredMessages.find({})
            .lean()
            .sort({ category: 1 }) // Group categories for AI

        // Insert an FAQ to allow free replies using the AdvancedAgent
        allMessages.push({
            title: this.generalAgent.faqTitle,
            category: "other"
        })

        allMessages.forEach((faq, i) => {
            const index = i + 1;
            this.helpMessageList[index] = { title: faq.title, subtopic: faq.category };
            faqs.push(`${index}. ${faq.title} | (${faq.category})`);
        });

        const subtopicInfo = Object.entries(subtopicInfoMap)
            .map(([box, description]) => 
                `- ${box}: ${description}\n`
            )
            .join("")

        compiledSystemPrompt = compiledSystemPrompt
            .replace("{FAQs}", faqs.join("\n"))
            .replace("{channelInfo}", getChannelInfo(discordMessage))
            .replace("{allSubtopicInfo}", subtopicInfo)

        return this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: compiledSystemPrompt,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: stage1ResponseSchema,
            }
        });
    }

    async getFaqByNum(num, discordMessage) {
        const selectedHelpMessageTitle = this.helpMessageList[num];
        if (!selectedHelpMessageTitle) return false;

        if (discordMessage && selectedHelpMessageTitle.title == this.generalAgent.faqTitle) {
            // Advanced AI was called, prompt it instead
            const message = await this.generalAgent.prompt(discordMessage)
            return {
                message: message, 
                FAQTitle: selectedHelpMessageTitle.title, 
                subtopic: selectedHelpMessageTitle.subtopic
            };
        }

        const helpMessage = await getHelpMessageBySubjectTitle(selectedHelpMessageTitle.subtopic, selectedHelpMessageTitle.title);
        if (!helpMessage) return false;

        return { 
            message: helpMessage, 
            FAQTitle: selectedHelpMessageTitle.title, 
            subtopic: selectedHelpMessageTitle.subtopic
        };
    }

    async stage1AIHandler(discordMessage) {
        const geminiSession = (await this.buildStage1Model(discordMessage)).startChat();
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

        const { message, FAQTitle, subtopic } = await this.getFaqByNum(responseNumber, discordMessage);
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
            .replace("{channelInfo}", getChannelInfo(discordMessage))

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


// Auto tagging forums with relevant tags - TODO: move to separate file
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
        
        const compiledSystemPrompt = forumTaggerPrompt
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
                responseSchema: forumAutoTaggerSchema,
            }
        });
    }

    async messageHandler(message) {
        const config = await ConfigDB.findOne({})
            .lean({ defaults: true })
            .select("autoTagger allowedTags");

        if (config.autoTagger && message.channel.isThread() && message.channel?.parent?.type === ChannelType.GuildForum) {
            const starterMessage = await message.channel.fetchStarterMessage();

            const botMember = await message.channel.guild.members.fetch(client.user.id);
            const permissions = message.channel.permissionsFor(botMember);

            if (permissions.has(PermissionsBitField.Flags.ManageThreads) && message.id === starterMessage?.id) {
                // If this is the original message of the form and we can manage it

                const appliedTags = message.channel.appliedTags;
                if (appliedTags.length == 0) {
                    // If no tags were applied - time for gemini to apply them
                    const availableTags = message.channel.parent.availableTags
                        .filter(tag => config.allowedTags.includes(tag.name));

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

                    const tagsToApply = availableTags
                        .filter(tag => tagNames.includes(tag.name));

                    if (tagsToApply.length > 0) {
                        await message.channel.setAppliedTags(tagsToApply.map(tag => tag.id));
                        
                        message.channel.send(
                            `-# No tags were applied, so I added \`${tagsToApply.map(tag => tag.name).join("`, `")}\``
                        )
                    }

                }
            }
        }
    }
}


module.exports = {
    AutoReplyAI: new AutoReplyAI(),
    AutoTaggerAI: new AutoTaggerAI(),
    formatAIResponse
};
