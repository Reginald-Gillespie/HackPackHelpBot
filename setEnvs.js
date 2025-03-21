// Simple file to easily swap between production and dev envirnments.

Object.assign(process.env, require('./env.json'));

const beta = process.argv.includes('--dev') || process.argv.includes('--beta') || process.env.beta == "true";

if (beta) {
    global.beta = beta;
    process.env.token = process.env.betaToken;
    process.env.clientId = process.env.betaClientId;
    console.log('Starting in development mode.');
} else {
    console.log('Starting in production');
    delete process.env.beta;
}