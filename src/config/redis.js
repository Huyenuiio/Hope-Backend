const Redis = require('ioredis');

// We use ioredis because it's robust and supports Promises natively.
// Fallback to null if REDIS_URL is not provided so the app doesn't crash in local dev without Redis.
let redisClient = null;

if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, {
        tls: {
            rejectUnauthorized: false
        },
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    });

    redisClient.on('connect', () => {
        console.log('✅  Redis Connected (Upstash)');
    });

    redisClient.on('error', (err) => {
        console.error('❌  Redis Connection Error:', err.message);
    });
} else {
    console.warn('⚠️  REDIS_URL not found in .env. Redis Caching is DISABLED.');
}

module.exports = redisClient;
