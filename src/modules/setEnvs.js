// Simple file to easily swap between production and dev envirnments.

const path = require('path');

Object.assign(process.env, require(path.join(__dirname, '../../env.json')));

const beta = process.argv.includes('--dev') || process.argv.includes('--beta') || process.env.beta == "true";

if (beta) {
    global.beta = beta;
    process.env.token = process.env.betaToken;
    process.env.clientId = process.env.betaClientId;
    console.log('Starting in development mode.');
} else {
    global.beta = beta;
    delete process.env.beta;
    console.log('Starting in production');
}