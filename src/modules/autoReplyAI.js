// Class to handle discord AutoReplies using multistage LLM calling for finetuned results.

const os = require('os');
const fs = require("fs");
const fse = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const NodeCache = require("node-cache");
const simpleGit = require('simple-git');
const { ConfigDB, StoredMessages } = require('../modules/database');
const { ChannelType, PermissionsBitField } = require("discord.js");
const { isHelpRequest, getHelpMessageBySubjectTitle } = require('../modules/utils');
const { sendFlowchartToUser } = require('../commands/help');

// AI SDK imports
const { groq } = require('@ai-sdk/groq');
const { generateObject, generateText } = require('ai');
const { z } = require('zod');
const { getChartOptions } = require('./flowcharter');

const git = simpleGit();

// Import AI data
const stage1SystemPrompt = fs.readFileSync(path.join(__dirname, '../assets/stage1SystemPrompt.txt'), 'utf-8');
const stage2SystemPrompt = fs.readFileSync(path.join(__dirname, '../assets/stage2SystemPrompt.txt'), 'utf-8');
const forumTaggerPrompt = fs.readFileSync(path.join(__dirname, '../assets/forumTaggerPrompt.txt'), 'utf-8');

// Per-box information given to the AI.
const subtopicInfoMap = require("../assets/subtopicInfoMap.json");

// Zod schemas for structured outputs
const stage1ResponseSchema = z.object({
    thoughts: z.string().describe('Think about which response is the best, or if there is even a best response.'),
    chosen_response: z.number().describe('After thinking, write down your final answer.'),
    confidence: z.number().describe('How confident you are that your answer is relevant, from 1 (somewhat confident) to 5 (very confident).')
});

const stage2ResponseSchema = z.object({
    thoughts: z.string().describe('Think about whether the given question can be reliably answered with the provided information.'),
    reliably_confidence: z.number().describe('How confident you are that FAQ answers the question, from 1 (somewhat confident) to 5 (very confident).'),
    tailored_response: z.string().describe('Your answer that the user will see.'),
    confidence: z.number().describe('How confident you are that your answer is relevant and correct, from 1 (somewhat confident) to 5 (very confident).')
});

const forumAutoTaggerSchema = z.object({
    thoughts: z.string().describe('Your reasoning about which tags to apply'),
    tags: z.array(z.string()).describe('Array of tag names to apply')
});


// Utils 
function getChannelInfo(discordMessage) {
    // Simple function to give the channel name to the AI to help it have more context about what is being asked
    let channelName = `#${discordMessage.channel.name}`;
    const parent = discordMessage.channel.parent;
    if (parent) channelName = `${parent.name} > ${channelName}`;

    return channelName;
}


//#region PostProcessor

/**
 * AI message post-processor that splits into ≤2000-char quoted chunks,
 * preserving code blocks when possible.
 *
 * @param {string} text - The AI-generated text.
 * @param {string} disclaimer - Disclaimer to append at end.
 * @returns {string[]} Array of quoted chunks.
 */
function formatAIResponse(text, disclaimer = "-# ⚠️ This response was written by <@724416180097384498>'s AI and may be incorrect.") {
    // Append disclaimer
    text = text + "\n\n" + disclaimer;

    const MAX_CHARS = 2000;
    const SAFE_BREAK = 1500; // start new chunk if current exceeds this

    // Split into code blocks and non-code blocks
    const parts = text.split(/(```[\s\S]*?```)/g);

    const chunks = [];
    let current = "";

    // Helper to push current chunk and reset
    const flushCurrent = () => {
        if (current) {
            chunks.push(current.trimEnd());
            current = "";
        }
    };

    // Process a block (either code or plain)
    const processBlock = (block) => {
        const isCode = block.startsWith("```") && block.endsWith("```");
        const lines = block.split("\n");

        if (isCode) {
            // Treat entire code block as one unit if it fits
            const wrapped = lines.map(line => "> " + line).join("\n");
            if ((current + "\n" + wrapped).length <= MAX_CHARS) {
                current += (current ? "\n" : "") + wrapped;
            } else {
                // Doesn't fit: flush current and put code block in its own chunk
                flushCurrent();
                if (wrapped.length <= MAX_CHARS) {
                    current = wrapped;
                    flushCurrent();
                } else {
                    // Code block itself is too long: break by lines
                    for (const line of lines) {
                        const qLine = "> " + line;
                        if ((current + "\n" + qLine).length > MAX_CHARS) {
                            flushCurrent();
                        }
                        current += (current ? "\n" : "") + qLine;
                    }
                    flushCurrent();
                }
            }
        } else {
            // Plain text: break by lines, then words if needed
            for (let line of lines) {
                const qLine = "> " + line;
                if (qLine.length > MAX_CHARS) {
                    // break into words
                    const words = line.split(" ");
                    let buffer = "> ";
                    for (const w of words) {
                        if ((buffer + w + " ").length > MAX_CHARS) {
                            // commit buffer
                            if ((current + "\n" + buffer.trimEnd()).length > MAX_CHARS) {
                                flushCurrent();
                            }
                            current += (current ? "\n" : "") + buffer.trimEnd();
                            buffer = "> ";
                        }
                        buffer += w + " ";
                    }
                    // leftover buffer
                    if (buffer.trim() !== ">") {
                        if ((current + "\n" + buffer.trimEnd()).length > MAX_CHARS) {
                            flushCurrent();
                        }
                        current += (current ? "\n" : "") + buffer.trimEnd();
                    }
                } else {
                    // normal line
                    if ((current + "\n" + qLine).length > MAX_CHARS) {
                        flushCurrent();
                    }
                    current += (current ? "\n" : "") + qLine;
                }

                // if too big, preemptively flush to avoid overshoot
                if (current.length > SAFE_BREAK) {
                    flushCurrent();
                }
            }
        }
    };

    // Iterate parts
    for (const part of parts) {
        if (!part) continue;
        processBlock(part);
    }

    // flush final
    flushCurrent();

    return chunks;
}


//#endregion PostProcessor

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
            "Prompt Advanced Agent - " +
            "This Agent knows little about specific Hack Pack issues, " +
            "but it is very good at general factual engineering questions, research, and coding." +
            "It has access to source code for all Hack Pack Boxes." +
            "If the question only matches this or if it starts with !ai strongly consider using this module.";

        // Build the GeminiAgent dir, but async so it doesn't impact start time
        this.loaded = false;
        this.loadPromise = new Promise(async (resolve, reject) => {

            // Load stuff
            this.AdvancedAIContext = await fs.promises.readFile(path.join(__dirname, "../assets/AdvancedAIContext.txt"));
            this.AdvancedAIContext = this.AdvancedAIContext?.toString()?.trim() || false;

            // Setup Advanced Dir
            await fs.promises.mkdir(this.advancedAgentPath, { recursive: true });
            const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'HackPackCode-'));

            // Clone Hack Pack code into this folder
            await git.clone(
                'https://github.com/Reginald-Gillespie/HackPackCode.git',
                tempDir,
                ['--depth=1']
            );

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
            );
            await fs.promises.copyFile(
                path.join(__dirname, "../assets/GeminiENV.env"),
                path.join(this.advancedAgentPath, ".gemini", ".env")
            );

            resolve();
        });

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
                "\n" +
                message;
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
                output = output.replaceAll("Data collection is disabled.", "");
                output = output.trim();

                console.log("Advanced Agent response:\n", output);

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
        this.model = groq('openai/gpt-oss-120b');

        this.autoAICache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Used to only check posted questions that are "out of the blue" not in a long convo
        this.generalAgent = new AdvancedAIAgent();

        this.helpMessageList = [];
        this.flowchartList = [];  // Track flowcharts separately
        this.stage1RequiredConfidence = 3;  // How sure stage1 is that there is a matching FAQ (this will be rejudged by stage2 with extra context, so low is fine)
        this.flowchartRequiredConfidence = 4;  // Flowcharts require maximum confidence
        this.stage2MessageCount = 8;        // How much context to pull in
        this.stage2PrecisionThreshold = 4;  // How related the FAQ that stage 1 gave was - arguably this is the most important number as it chooses how much the fixed FAQ will be used 
        this.stage2ConfidenceThreshold = 4; // How confident in the final answer stage2 must be.
    }

    /**
     * Entrypoint 
     * @param {import('discord.js').Message} discordMessage 
     * */
    async messageHandler(discordMessage, trusted = false) {
        // Trusted users are more likely to trigger higher power AI, for example.
        if (!discordMessage.channel.isSendable()) return;

        try {
            const messageHasForceTrigger = discordMessage.content.toLowerCase().startsWith(this.aiForceTrigger);
            const messageHasNoCacheTrigger = discordMessage.content.toLowerCase().startsWith(this.aiNoCacheTrigger);
            const aiDontRepeatCacheKey = `${discordMessage.author?.id}`;

            // Fetch replied to message if it wasn't already fetched
            let repliedMessage = discordMessage.referenceData; // just where I want to store it
            if (!repliedMessage && discordMessage.reference) {
                repliedMessage = discordMessage.referenceData = await discordMessage.channel.messages.fetch(discordMessage.reference.messageId);
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
            );

            if (preliminaryTrigger) {
                console.log("Running AutoAI");

                // Don't reply to this user in this channel after triggering for an hour
                if (messageHasForceTrigger) {
                    this.autoAICache.del(aiDontRepeatCacheKey);
                    if (!trusted) discordMessage.content = discordMessage.content.substring(this.aiForceTrigger.length);
                }
                else {
                    this.autoAICache.set(aiDontRepeatCacheKey, true);
                }

                // Ignore the cache spam prevention for dev testing
                if (messageHasNoCacheTrigger) {
                    discordMessage.content = discordMessage.content.substring(this.aiNoCacheTrigger.length);
                }

                console.log(`=`.repeat(50) + `\n`);

                // Run through stage1 AI
                console.log(`Passing into stage1`);
                const stage1Out = await this.stage1AIHandler(discordMessage);
                if (!stage1Out) return false;

                // Check if it's a flowchart
                if (stage1Out.isFlowchart) {
                    console.log(`Flowchart selected: ${stage1Out.flowchartTitle}`);
                    await this.sendFlowchart(discordMessage, stage1Out.flowchartFilename, stage1Out.flowchartTitle);
                    console.log(`=`.repeat(50) + `\n`);
                    return true;
                }

                // Pass through stage2 for regular FAQs

                console.log(`Passing into stage2`);
                const stage2Out = await this.stage2AIHandler(discordMessage, stage1Out);
                if (!stage2Out) return false;

                // If we've come this far, we have a response the AI is confident in
                // Reply
                const messageChunks = formatAIResponse(stage2Out.tailored_response);
                await discordMessage.reply({
                    content: messageChunks[0],
                    allowedMentions: { users: [discordMessage.author.id] }
                });
                for (const chunk of messageChunks.slice(1)) {
                    await discordMessage.channel.send({
                        content: chunk,
                        allowedMentions: { parse: [] }
                    });
                }

                console.log(`=`.repeat(50) + `\n`);
            }

        } catch (error) {
            console.log("AI error:", error);
            return false;
        }
    }

    /**
     * Send an interactive flowchart to the user
     * @param {import('discord.js').Message} discordMessage 
     * @param {string} chartFilename - The filename of the chart (without extension)
     * @param {string} chartTitle - The title of the chart
     */
    async sendFlowchart(discordMessage, chartFilename, chartTitle) {
        try {
            await sendFlowchartToUser({
                chartFilename,
                chartTitle,
                user: discordMessage.author,
                guild: discordMessage.guild,
                interactionId: discordMessage.id,
                reply: (options) => discordMessage.reply(options)
            });
        } catch (error) {
            console.error("Error sending flowchart:", error);
        }
    }

    // Stage 1:
    // Select relevant FAQ from list of titles and user message
    async buildStage1SystemPrompt(discordMessage) {
        let compiledSystemPrompt = stage1SystemPrompt;
        // Build FAQs into the prompt
        const faqs = [];

        // Build subtopics
        const allMessages = await StoredMessages.find({})
            .lean()
            .sort({ category: 1 }); // Group categories for AI

        // Insert an FAQ to allow free replies using the AdvancedAgent
        allMessages.push({
            title: this.generalAgent.faqTitle,
            category: "other"
        });

        allMessages.forEach((faq, i) => {
            const index = i + 1;
            this.helpMessageList[index] = { title: faq.title, subtopic: faq.category };
            faqs.push(`${index}. ${faq.title} | (${faq.category})`);
        });

        // Add flowcharts after FAQs with non-overlapping numbers
        const flowcharts = [];
        const flowchartOptions = getChartOptions();
        const flowchartStartIndex = allMessages.length + 1;
        
        flowchartOptions.forEach((chart, i) => {
            const index = flowchartStartIndex + i;
            this.flowchartList[index] = { filename: chart.filename, title: chart.title };
            flowcharts.push(`${index}. ${chart.title} (Interactive Flowchart)`);
        });

        const subtopicInfo = Object.entries(subtopicInfoMap)
            .map(([box, description]) =>
                `- ${box}: ${description}\n`
            )
            .join("");

        compiledSystemPrompt = compiledSystemPrompt
            .replace("{FAQs}", faqs.join("\n"))
            .replace("{FLOWCHARTS}", flowcharts.join("\n"))
            .replace("{channelInfo}", getChannelInfo(discordMessage))
            .replace("{allSubtopicInfo}", subtopicInfo);

        return compiledSystemPrompt;
    }

    async getFaqByNum(num, discordMessage) {
        const selectedHelpMessageTitle = this.helpMessageList[num];
        if (!selectedHelpMessageTitle) return false;

        if (discordMessage && selectedHelpMessageTitle.title == this.generalAgent.faqTitle) {
            // Advanced AI was called, prompt it instead
            const message = await this.generalAgent.prompt(discordMessage);
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
        const systemPrompt = await this.buildStage1SystemPrompt(discordMessage);

        const result = await generateObject({
            model: this.model,
            system: systemPrompt,
            prompt: discordMessage.content,
            schema: stage1ResponseSchema,
            schemaName: 'faq_selection',
            schemaDescription: 'Select the most relevant FAQ based on the user question'
        });

        const responseJSON = result.object;
        const responseNumber = +responseJSON.chosen_response;
        const confidence = +responseJSON.confidence;

        console.log(
            `AI triggered question by ${discordMessage.author.displayName || discordMessage.author.username}:\n` +
            `${discordMessage.content}`
        );
        console.log(`Stage1:\n`, responseJSON);

        if (isNaN(responseNumber) || responseNumber == 0) return false;
        if (isNaN(confidence)) return false;

        // Check if this is a flowchart
        const isFlowchart = this.flowchartList[responseNumber] !== undefined;
        
        if (isFlowchart) {
            // Flowcharts require confidence of 5
            if (confidence < this.flowchartRequiredConfidence) {
                return false;
            }
            // Return flowchart info
            return { 
                isFlowchart: true, 
                flowchartFilename: this.flowchartList[responseNumber].filename,
                flowchartTitle: this.flowchartList[responseNumber].title
            };
        } else {
            // Regular FAQ - use normal confidence threshold
            if (confidence < this.stage1RequiredConfidence) return false;

            const { message, FAQTitle, subtopic } = await this.getFaqByNum(responseNumber, discordMessage);
            if (!message) return false;

            return { isFlowchart: false, FAQ: message, FAQTitle, subtopic };
        }
    }

    // Stage 2:
    // This stage tailors the response specifically to this user's case with this FAQ. 
    // It takes in the selected FAQ and category, builds a prompt with additional details of relevant boxes
    async fetchRecentMessages(discordMessage, limit = 50) {
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

        const fetchedMessages = await discordMessage.channel.messages.fetch({
            limit,
            before: discordMessage.id
        });

        const recentMessages = fetchedMessages.filter(msg => msg.createdTimestamp >= thirtyMinutesAgo);

        const inlineFormattedMessages = recentMessages.map(msg =>
            `[${msg.createdAt.toLocaleTimeString()}] ${msg.author.username}: ${msg.content}`
        ).join("\n");

        return { messageText: inlineFormattedMessages, numMessages: recentMessages.size };
    }

    async stage2AIHandler(discordMessage, { FAQ, FAQTitle, subtopic }) {
        let compiledSystemPrompt = stage2SystemPrompt;

        const { messageText, numMessages } = await this.fetchRecentMessages(discordMessage, this.stage2MessageCount);
        const subtopicInfo = subtopicInfoMap[subtopic];

        //// Generate prompt
        compiledSystemPrompt = compiledSystemPrompt
            .replace("{messages}", messageText)
            .replace("{numMessages}", numMessages)
            .replace("{username}", discordMessage.author.username)
            .replace("{FAQ}", FAQ)
            .replace("{FAQTitle}", FAQTitle)
            .replace("{subtopic}", subtopic || "<none provided")
            .replace("{subtopicInfo}", subtopicInfo || "<none provided")
            .replace("{channelInfo}", getChannelInfo(discordMessage));

        //// Call model with user question
        const result = await generateObject({
            model: this.model,
            system: compiledSystemPrompt,
            prompt: discordMessage.content,
            schema: stage2ResponseSchema,
            schemaName: 'tailored_response',
            schemaDescription: 'Generate a tailored response based on the FAQ and user context'
        });

        const responseJSON = result.object;
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
        this.model = groq('openai/gpt-oss-120b');
    }

    buildSystemPrompt(tags) {
        const extraInfo = Object.entries(subtopicInfoMap)
            .map(([box, content]) => `\n- ${box}: ${content}`)
            .join("");

        const compiledSystemPrompt = forumTaggerPrompt
            .replace("{extraInfo}", extraInfo)
            .replace("{tags}", tags
                .map(tag => `\n- ${tag.name}`)
                .join("")
            );

        return compiledSystemPrompt;
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
                    // If no tags were applied - time for AI to apply them
                    const availableTags = message.channel.parent.availableTags
                        .filter(tag => config.allowedTags.includes(tag.name));

                    // Feed through model
                    const systemPrompt = this.buildSystemPrompt(availableTags);

                    const result = await generateObject({
                        model: this.model,
                        system: systemPrompt,
                        prompt: `Title: ${starterMessage.channel.name}\n---\n${message.content}`,
                        schema: forumAutoTaggerSchema,
                        schemaName: 'forum_tags',
                        schemaDescription: 'Select appropriate tags for this forum post'
                    });

                    const responseJSON = result.object;
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

                        message.channel.send({
                            content: `-# No tags were applied, so I added \`${tagsToApply.map(tag => tag.name).join("`, `")}\``,
                            allowedMentions: { parse: [] }
                        });
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