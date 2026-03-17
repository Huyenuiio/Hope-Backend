const rateLimit = require('express-rate-limit');

// General API rate limit
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu, thử lại sau 15 phút' },
});

// Auth endpoints (stricter)
exports.authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập, thử lại sau 1 giờ' },
  skipSuccessfulRequests: true,
});

// Search endpoints
exports.searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 30 : 500,
  message: { success: false, message: 'Tìm kiếm quá nhanh, thử lại sau ít giây' },
});

// Upload endpoints
exports.uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 30 : 500,
  message: { success: false, message: 'Upload quá nhiều, thử lại sau' },
});
