// Helper module to manage database saving

// This method uses json, which is small and easy to work with.
// Write to a temp file and then rename to avoid corrupting the DB if it crashes while writing.

const fs = require("fs");
const path = require("path")

class Storage {
    constructor() {
        const baseDir = path.join(__dirname, "../../Storage");

        this.privStorageLocations = {
            current: path.join(baseDir, "storage.json"),
            temp: path.join(baseDir, "storage-temp.json"),
            backup: path.join(baseDir, "storage-bak.json")
        };
        this.data = this.readLatestDatabase([this.privStorageLocations.current, this.privStorageLocations.backup]);
        this.cache = {}; // a temporary global version of storage for convenience

        // Proxy to save help messages on write
        this.helpMessageLocations = {
            current: path.join(baseDir, "helpMessagesSave.json"),
            temp: path.join(baseDir, "helpMessagesSave-temp.json"),
            backup: path.join(baseDir, "helpMessagesSave-bak.json")
        };
        const _helpMessages = this.readLatestDatabase([this.helpMessageLocations.current, this.helpMessageLocations.backup]);
        this.helpMessages = _helpMessages; // These are saved by calling saveHelps directly instead of by the proxy

        // Return a proxy reference to this object so we can do storageObj[key] storageObj.data[key]
        return new Proxy(this, {
            get: (target, prop) => {
                // First, check if that prop belongs to this object, otherwise read it from the .data section
                if (prop in target) {
                    return target[prop];
                }
                return target.data[prop];
            },
            set: (target, prop, value) => {
                if (prop in target) {
                    // Write directly if these props exist in the Storage object (e.g., cache)
                    target[prop] = value;
                } else {
                    // Write to the data object for all other keys
                    target.data[prop] = value;
                }
                target.savePrivStorage(); // Save changes automatically
                return true;
            }
        });

    }

    readLatestDatabase(storageLocs) {

        // We'll overwrite these right away once we read the correct one
        const corruptedFiles = []

        // Get a list, in order of which ones we should read first
        const sortedLocations = storageLocs
            .filter(file => fs.existsSync(file)) // For file that exists,
            .map(file => ({
                file,
                mtime: fs.statSync(file).mtime   // get the last modified time
            }))
            .sort((a, b) => b.mtime - a.mtime)  // sort this array by the most frequent
            .map(({ file }) => file);

        for (let location of sortedLocations) {
            try {
                const data = require(location);
                if(process.env.beta) console.log(`Read database from ${location}`)

                // This shouldn't be needed, unless it was a boot-loop error that kept corrupting it's own files. Plan for the worst.
                corruptedFiles.forEach(file => {
                    console.log(`Fixing corrupted file at ${file}`)
                    fs.writeFileSync(file, JSON.stringify(data));
                })

                return data;
            } catch (e) {
                corruptedFiles.push(location)
                console.log(`Storage location ${location} could not be loaded (*${e.message}*), trying the next one.`, true)
            }
        }

        if (corruptedFiles.length == 0) return {} // storage does not exist, create empty

        // This case should never be hit - in theory we could try to load from the latest google drive.
        console.log(`No storage locations could be loaded. Tried: ${sortedLocations.join(", ")}.`)
        process.exit();
    }

    savePrivStorage() {
        const tempLocation = this.privStorageLocations.temp;
        const currentLocation = this.privStorageLocations.current;
        const backupLocation = this.privStorageLocations.backup;

        fs.writeFileSync(tempLocation, JSON.stringify(this.data, null, 4));

        if (fs.existsSync(currentLocation)) {
            fs.renameSync(currentLocation, backupLocation);
        }
        fs.renameSync(tempLocation, currentLocation);
        // console.log(`Just wrote DB to ${currentLocation}`)
    }

    saveHelps() {
        const tempLocation = this.helpMessageLocations.temp;
        const currentLocation = this.helpMessageLocations.current;
        const backupLocation = this.helpMessageLocations.backup;

        fs.writeFileSync(tempLocation, JSON.stringify(this.helpMessages, null, 4));

        if (fs.existsSync(currentLocation)) {
            fs.renameSync(currentLocation, backupLocation);
        }
        fs.renameSync(tempLocation, currentLocation);
    }
}

module.exports = Storage