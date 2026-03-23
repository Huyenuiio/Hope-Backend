require('dotenv').config();
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL, {
    tls: {
        rejectUnauthorized: false
    }
});

redisClient.on('connect', () => {
    console.log('✅  Redis Connected successfully to Upstash!');

    // Test write and read
    redisClient.set('ping', 'pong', 'EX', 10).then(() => {
        console.log('✅  Successfully wrote to Redis (ping=pong)');

        redisClient.get('ping').then(res => {
            console.log(`✅  Successfully read from Redis: ${res}`);
            process.exit(0);
        });
    });
});

redisClient.on('error', (err) => {
    console.error('❌  Redis Connection Error:', err);
    process.exit(1);
});

// timeout
setTimeout(() => {
    console.error('⏳ Timeout: Could not connect to Redis within 5 seconds.');
    process.exit(1);
}, 5000);
