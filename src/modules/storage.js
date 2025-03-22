// Helper module to manage database saving

// This method uses json, which is small and easy to work with.
// Two storage files are written to back and forth, to avoid corrupting the DB if it crashes while writing.

const fs = require("fs");
const path = require("path")

class Storage {
    constructor() {
        this.privStorageLocations = [
            path.join(__dirname, "../../Storage/storage1.json"),
            path.join(__dirname, "../../Storage/storage2.json")
        ];
        this.privStorageCycleIndex = 0; // cycle writes between files
        this.data = this.readLatestDatabase(this.privStorageLocations);
        this.cache = {}; // a temporary global version of storage for convenience

        // Proxy to save help messages on write 
        this.helpMessageLocations = [
            path.join(__dirname, "../../Storage/helpMessagesSave1.json"),
            path.join(__dirname, "../../Storage/helpMessagesSave2.json")
        ];
        this.helpMessageCycleIndex = 0; // cycle writes between files
        const _helpMessages = this.readLatestDatabase(this.helpMessageLocations);
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
        let writeLocation = this.privStorageLocations[this.privStorageCycleIndex % this.privStorageLocations.length];
        fs.writeFileSync(writeLocation, JSON.stringify(this.data, null, 4));
        this.privStorageCycleIndex++; 
        // console.log(`Just wrote DB to ${writeLocation}`)
    }

    saveHelps() {
        let writeLocation = this.helpMessageLocations[this.helpMessageCycleIndex % this.helpMessageLocations.length];
        fs.writeFileSync(writeLocation, JSON.stringify(this.helpMessages, null, 4));
        this.helpMessageCycleIndex++; 
    }
}

module.exports = Storage