const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default; // Important: .default is required for rate-limit-redis v3+
const redisClient = require('../config/redis');

// Fallback to memory store if Redis is unavailable
const getStore = (prefix) => {
  if (redisClient) {
    return new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: prefix,
    });
  }
  return undefined; // use memory store
};

// General API rate limit
exports.apiLimiter = rateLimit({
  store: getStore('rl:api:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu, thử lại sau 15 phút' },
});

// Auth endpoints (stricter)
exports.authLimiter = rateLimit({
  store: getStore('rl:auth:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập, thử lại sau 1 giờ' },
  skipSuccessfulRequests: true,
});

// Search endpoints
exports.searchLimiter = rateLimit({
  store: getStore('rl:search:'),
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 30 : 500,
  message: { success: false, message: 'Tìm kiếm quá nhanh, thử lại sau ít giây' },
});

// Upload endpoints
exports.uploadLimiter = rateLimit({
  store: getStore('rl:upload:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 30 : 500,
  message: { success: false, message: 'Upload quá nhiều, thử lại sau' },
});
