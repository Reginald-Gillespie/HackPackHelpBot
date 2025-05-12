require("./setEnvs")
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require('mongoose-lean-virtuals');
const mongooseLeanDefaults = require('mongoose-lean-defaults').default;
mongoose.plugin(mongooseLeanDefaults)
mongoose.plugin(mongooseLeanVirtuals)
mongoose.set('setDefaultsOnInsert', false);

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
    allowedTags: [ String ],

    admins: [ String ],
    creators: [ String ],

    allowedHelpMessageCategories: [ String ],
})
const ConfigDB = mongoose.model("config", configSchema)



// Make sure ConfigDB is initialized, since with our current config there should only ever be one of them.
ConfigDB.findOne().then(async (config) => {
    if (!config) {
        // If no config exists, create one
        const newConfig = new ConfigDB({});
        await newConfig.save();
    }
});



// Connect
async function dropIndexes(Model) {
    try {
        const indexes = await Model.collection.indexes();
        console.log("Indexes before deletion:", indexes.length);
        await Model.collection.dropIndexes();
        const indexes2 = await Model.collection.indexes();
        console.log("Indexes after deletion:", indexes2.length);
    } catch {}
}
const connectedPromise = (async () => {
    await mongoose.connect(`${process.env.databaseURI}/${process.env.beta ? "StageHackPackBot" : "HackPackBot"}`)
    
    // Indecies can mess stuff up when deving
    if (process.env.beta) {
        await dropIndexes(ConfigDB);
        await dropIndexes(StoredMessages);
    };

    mongoose.connection.db.setProfilingLevel(
        process.env.beta
            ? "all"
            : "slow_only"
    )

    // Finally, make sure certian ones exist
    const config = await ConfigDB.findOne();
    if (!config) {
        // If no config exists, create one
        const newConfig = new ConfigDB({});
        await newConfig.save();
    }
})();




module.exports = {
    ConfigDB,
    StoredMessages,

    connectedPromise
}