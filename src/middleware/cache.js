const redisClient = require('../config/redis');

/**
 * Middleware để tự động Cache response (Lưu tạm vào RAM).
 * Xóa bộ đệm sau `duration` giây.
 *
 * @param {number} duration Thời gian hết hạn của cache (giây). Mặc định: 300s (5 phút)
 * @param {string} customPrefix Tiền tố đặc biệt cho key, nếu muốn gom nhóm cache
 */
const cacheMiddleware = (duration = 300, customPrefix = '') => {
    return async (req, res, next) => {
        // Bỏ qua caching nếu không có Redis hoặc User req có sự phân quyền quá sâu (có thể custom filter)
        if (!redisClient || req.method !== 'GET') {
            return next();
        }

        // Tạo key duy nhất dựa trên Prefix + UserID + URL (để caching áp dụng riêng cho từng người dùng, vì req có auth).
        // Nếu API là public (không cần auth), userId sẽ là 'public'.
        const userId = req.user ? req.user._id.toString() : 'public';
        const key = `cache:${customPrefix}:${userId}:${req.originalUrl}`;

        try {
            const cachedData = await redisClient.get(key);

            if (cachedData) {
                return res.status(200).json(JSON.parse(cachedData));
            } else {
                const originalSend = res.json;
                res.json = function (body) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const payload = JSON.stringify(body);
                        redisClient.setex(key, duration, payload).catch(e => {
                            console.error('❌ Redis SetEX ASYNC Error:', e);
                        });
                    }
                    originalSend.call(this, body);
                };
                next();
            }
        } catch (error) {
            console.error('Redis Cache Middleware Error:', error);
            next(); // Lỗi Redis thì vẫn cho API chạy bình thường qua MongoDB
        }
    };
};

/**
 * Hàm hỗ trợ xóa Cache thủ công khi có dữ liệu mới.
 * Dùng từ khóa (pattern) để xóa nhiều cache liên quan.
 * Ví dụ: clearCachePattern('cache:jobs:*') sẽ xóa hết cache của list việc làm
 */
const clearCachePattern = async (pattern) => {
    if (!redisClient) return;
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
    } catch (err) {
        console.error('Redis Clear Cache Error:', err);
    }
};

module.exports = {
    cacheMiddleware,
    clearCachePattern
};
