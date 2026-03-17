const express = require('express');
const router = express.Router();
const Portfolio = require('../models/Portfolio');
const { protect, optionalAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

// @route   GET /api/portfolio/me
// @desc    Get current user's portfolio (all statuses)
router.get('/me', protect, async (req, res) => {
  try {
    const items = await Portfolio.find({ user: req.user._id }).sort('-createdAt');
    res.json({ success: true, items, user: req.user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/portfolio/item/:id
// @desc    Get single portfolio item
router.get('/item/:id', optionalAuth, async (req, res) => {
  try {
    const item = await Portfolio.findById(req.params.id).populate('user', 'name avatar headline');
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/portfolio/:userId
// @desc    Get portfolio for a specific user (public: approved only)
router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.params.userId)
      .select('name avatar headline niche tools skills bio hourlyRate availability englishLevel equipment caseStudies rating totalReviews completedJobs verificationBadge');

    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    // Owner sees all, public sees approved only
    const isOwner = req.user && req.user._id.toString() === req.params.userId;
    const query = isOwner ? { user: req.params.userId } : { user: req.params.userId, status: 'approved' };

    const items = await Portfolio.find(query).sort('-createdAt');
    res.json({ success: true, items, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/portfolio
// @desc    Create a portfolio item
router.post('/', protect, authorize('freelancer'), async (req, res) => {
  try {
    const item = await Portfolio.create({
      ...req.body,
      user: req.user._id,
      status: 'pending', // Requires admin approval
    });
    res.status(201).json({ success: true, item, message: 'Đã gửi portfolio, chờ admin duyệt' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/portfolio/:id
// @desc    Update a portfolio item
router.put('/:id', protect, async (req, res) => {
  try {
    const item = await Portfolio.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const allowed = ['title', 'description', 'mediaUrl', 'mediaType', 'platform', 'tags', 'caseStudy', 'thumbnailUrl'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    updates.status = 'pending'; // Needs re-approval after edit

    const updated = await Portfolio.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/portfolio/:id
// @desc    Delete a portfolio item
router.delete('/:id', protect, async (req, res) => {
  try {
    const item = await Portfolio.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    if (item.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }
    await Portfolio.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Đã xóa portfolio item' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
