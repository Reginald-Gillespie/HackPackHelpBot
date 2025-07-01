require("./setEnvs")
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require('mongoose-lean-virtuals');
const mongooseLeanDefaults = require('mongoose-lean-defaults').default;
mongoose.plugin(mongooseLeanDefaults)
mongoose.plugin(mongooseLeanVirtuals)
mongoose.set('setDefaultsOnInsert', false);


const issueTrackerSchema = new mongoose.Schema({
    issue: { type: String, required: true },
    userID: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const IssueTrackerDB = mongoose.model("issuetracker", issueTrackerSchema);

const fixerSchema = new mongoose.Schema({
    mistake: { type: String, required: true },
    box: { type: String, required: true },
    count: { type: Number, required: true},
    timestamp: { type: Date, default: Date.now }
});
const fixerDB = mongoose.model("fixer", fixerSchema);

const factionSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    roleId: { type: String, required: true },
    emoji: { type: String, required: true },
    starboardChannel: { type: String },
    starboardThreshold: { type: Number },
    themeColor: { type: String }
});
const Factions = mongoose.model('factions', factionSchema);



const starboardMessageSchema = new mongoose.Schema({
    id: { type: String, required: true },
    emoji: { type: String, required: true },
    finalStar: { type: String, required: true } // who was the last to star
});
starboardMessageSchema.index({ id: 1, emoji: 1 }, { unique: true }); // Prevent duplicates
const StarboardMessage = mongoose.model('starboardmessage', starboardMessageSchema);



const starboardCooldownSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    expiresAt: { type: Date, required: true }
});
starboardCooldownSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const StarboardCooldown = mongoose.model('cooldown', starboardCooldownSchema);



const customResponseSchema = new mongoose.Schema({
    trigger: { type: String, required: true, unique: true },
    response: { type: String, required: true }
})
const CustomResponses = mongoose.model("customresponses", customResponseSchema);



// To store box data, which we can then use places like AI descriptions or leaderboards
const boxDataSchema = new mongoose.Schema({
    // Data about the box
    boxName: { type: String, required: true, unique: true }, // Box name when selecting and in URLs and such, like "turret"
    displayName: { type: String, required: true },        // Box actual name, like "IR Turret"
    creator: { type: String },   // Name, like "Dan Tompkins"
    creatorId: { type: String }, // User ID, like "1230264421374373989"
    boxEmoji: { type: String },  // Snowflake for the custom emoji related to this box
    boxDescription: { type: String },
    boxURL: { type: String, required: true }, // The CrunchLabs webpage for this box
    // Data about the discord side
    themeColor: { type: String }, // String for hex color
    hacksChannel: { type: String }, // Form-style channel where people post modifications 
    featuredHacksChannel: { type: String }, // Channel featured hacks of all boxes, the box each is for is distinguished via a tag.
    featuredHacksTag: { type: String },
    roleId: { type: String }, // A discord role that indicates you have this box.
});
const BoxData = mongoose.model("boxdata", boxDataSchema);
// TODO: 
//  image URLs for embed thumbnails
//  bot number
//  theme color (use on embeds)


const boxReviewSchema = new mongoose.Schema({
    boxName: { type: String, required: true },
    reviewer: { type: String, required: true },

    Overall: { type: Number },
    Hackability: { type: Number },
    Usability: { type: Number },
    // Building: { type: Number },
    Design: { type: Number },
    CodeCleanliness: { type: Number },

    reviewDate: { type: Date, default: Date.now },
    textReview: { type: String, required: false }
})
boxReviewSchema.index({ boxName: 1, reviewer: 1 }, { unique: true });
const BoxReviews = mongoose.model("boxreviews", boxReviewSchema)



const helpMessageSchema = new mongoose.Schema({
    category: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
})
helpMessageSchema.index({ category: 1, title: 1 }, { unique: true }); // Compound unique index preventing duplicates within categories
const StoredMessages = mongoose.model("helpmessages", helpMessageSchema)



const restartDataSchema = new mongoose.Schema({
    restartedAt: { type: Number, default: Date.now() },
    channelId: { type: String, default: "" },
    messageId: { type: String, default: "" }
})
const configSchema = new mongoose.Schema({
    AIPings: { type: Boolean, default: false },
    dupeNotifs: { type: Boolean, default: false },
    AIAutoHelp: { type: String, default: "" }, // Which server to allow
    restartData: restartDataSchema,

    autoTagger: { type: Boolean, default: false },
    allowedTags: [String],

    admins: [String],
    creators: [String],

    allowedHelpMessageCategories: [String],
})
const ConfigDB = mongoose.model("config", configSchema)



//#region Connect
async function dropIndexes(Model) {
    try {
        const indexes = await Model.collection.indexes();
        console.log("Indexes before deletion:", indexes.length);
        await Model.collection.dropIndexes();
        const indexes2 = await Model.collection.indexes();
        console.log("Indexes after deletion:", indexes2.length);
    } catch { }
}
async function dropAllReleventIndexes() {
    await dropIndexes(ConfigDB);
    await dropIndexes(StoredMessages);
    await dropIndexes(BoxData);
    await dropIndexes(BoxReviews);
    await dropIndexes(CustomResponses);
    await dropIndexes(Factions);
}
const connectedPromise = (async () => {
    await mongoose.connect(`${process.env.databaseURI}/${process.env.beta ? "StageHackPackBot" : "HackPackBot"}`)

    // Indecies can mess stuff up when deving
    // if (process.env.beta) {
    //     dropAllIndexes();
    // };

    mongoose.connection.db.setProfilingLevel(
        process.env.beta
            ? "all"
            : "slow_only"
    )

    // Finally, make sure certian ones exist and have all properties set
    let config = await ConfigDB.findOneAndUpdate({}, {}, {
        upsert: true, new: true, setDefaultsOnInsert: true
    }
    );
    if (!config) config = new ConfigDB({});
    await config.save();
})();
//#endregion

module.exports = {
    ConfigDB,
    StoredMessages,
    BoxData,
    BoxReviews,
    CustomResponses,
    Factions,
    StarboardMessage,
    StarboardCooldown,
    IssueTrackerDB,
    fixerDB,

    connectedPromise,
    dropAllReleventIndexes
}