const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const { sendTokenResponse, generateToken } = require('../utils/jwt');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const redisClient = require('../config/redis');
const jwt = require('jsonwebtoken');

// Rate Limiter cho đăng nhập cục bộ (Chống Brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: process.env.NODE_ENV === 'production' ? 5 : 100, // Tối đa 5 lần thử log in ở production, 100 ở dev
  message: { success: false, message: 'Thao tác quá nhiều lần, vui lòng thử lại sau 15 phút.' }
});

// @route   GET /api/auth/google
// @desc    Begin Google OAuth flow
router.get('/google', authLimiter, passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback → issue JWT, redirect to frontend
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed` }),
  async (req, res) => {
    try {
      const user = req.user;

      // Update login metadata
      await User.findByIdAndUpdate(user._id, {
        lastLogin: Date.now(),
        lastLoginIP: req.ip,
        $inc: { loginCount: 1 },
      });

      const { generateToken } = require('../utils/jwt');
      const token = generateToken(user._id);

      // Redirect to frontend with token in URL (frontend stores in localStorage)
      res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
    } catch (err) {
      res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
    }
  }
);

// @route   POST /api/auth/login
// @desc    Admin Local Login (with Rate Limit + Bcrypt)
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email và mật khẩu' });
  }

  try {
    // Select password để compare
    const user = await User.findOne({ email }).select('+password -lastLoginIP');
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc sai phương thức đăng nhập' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });
    }

    // Update login info
    await User.findByIdAndUpdate(user._id, {
      lastLogin: Date.now(),
      lastLoginIP: req.ip,
      $inc: { loginCount: 1 },
    });

    // Gửi Token Response (Hàm này tự generate Token bên trong jwt.js)
    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// @desc    Get current logged-in user
router.get('/me', protect, async (req, res) => {
  try {
    const userDoc = await User.findById(req.user._id)
      .select('-lastLoginIP -loginCount -socialHistory -caseStudies')
      .populate('connections', 'name avatar headline');
    
    if (!userDoc) return res.status(404).json({ success: false, message: 'User not found' });

    const user = userDoc.toObject();

    // Dynamically calculate which users this user has sent a pending connection request to
    const sentRequestsDocs = await User.find({
      'connectionRequests': { 
        $elemMatch: { from: req.user._id, status: 'pending' } 
      }
    }).select('_id');
    
    user.sentRequests = sentRequestsDocs.map(u => u._id);

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout (clear cookie) & Blacklist Token
router.post('/logout', protect, async (req, res) => {
  if (req.token && redisClient) {
    try {
      const decoded = jwt.decode(req.token); // Protect middleware has already verified this
      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await redisClient.setex(`bl_${req.token}`, expiresIn, 'true');
          console.log(`🔒 [JWT Blacklist] Token added for User ${req.user._id}. Expires in ${expiresIn}s.`);
        }
      }
    } catch (e) {
      console.error('Logout Blacklist Error:', e);
    }
  }

  res.cookie('token', '', { expires: new Date(0), httpOnly: true });
  res.json({ success: true, message: 'Đã đăng xuất thành công' });
});

// @route   PUT /api/auth/role
// @desc    Set initial role after first login (freelancer or client)
router.put('/role', protect, async (req, res) => {
  const { role } = req.body;
  if (!['freelancer', 'client'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ' });
  }
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { role }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
