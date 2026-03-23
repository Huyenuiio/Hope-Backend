const jwt = require('jsonwebtoken');
const User = require('../models/User');
const redisClient = require('../config/redis');

// Middleware: verify JWT token from Authorization header or cookie
exports.protect = async (req, res, next) => {
  let token;

  // Get token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Or from cookie
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục' });
  }

  // 1. Kiểm tra JWT Blacklist trên Redis
  if (redisClient) {
    try {
      const isBlacklisted = await redisClient.get(`bl_${token}`);
      if (isBlacklisted) {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn hoặc bị đăng xuất' });
      }
    } catch (e) {
      console.error('Redis Blacklist check error:', e);
    }
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-lastLoginIP');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa. Liên hệ hỗ trợ.' });
    }

    req.user = user;
    req.token = token; // Lưu lại token gốc để dùng cho /logout (Thêm vào Blacklist)
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// Middleware: optional auth (doesn't fail if no token)
exports.optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  if (redisClient) {
    try {
      const isBlacklisted = await redisClient.get(`bl_${token}`);
      if (isBlacklisted) {
        req.user = null;
        return next();
      }
    } catch (e) {}
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-lastLoginIP');
    req.token = token; // Lưu lại để dùng nếu cần
  } catch {
    req.user = null;
  }
  next();
};

// Middleware: Authorize by role
// Used AFTER protect middleware (which sets req.user)
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập chức năng này (Requires role: ' + roles.join(' or ') + ')',
      });
    }
    next();
  };
};
