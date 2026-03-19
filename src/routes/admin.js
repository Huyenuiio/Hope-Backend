const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Job = require('../models/Job');
const Portfolio = require('../models/Portfolio');
const Review = require('../models/Review');
const AccessLog = require('../models/AccessLog');
const Application = require('../models/Application');
const Meeting = require('../models/Meeting');
const Report = require('../models/Report');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { getMatchingFreelancers } = require('../utils/matching');

// All admin routes require auth + admin/moderator/superadmin role
router.use(protect);
router.use(authorize('admin', 'moderator', 'superadmin'));

// ── DASHBOARD STATS ───────────────────────────────────────────────

// @route   GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers, newUsersToday, totalFreelancers, totalClients,
      totalJobs, openJobs, pendingJobs, totalApplications,
      pendingPortfolios, flaggedJobs, threatsToday,
      successfulMatches,
    ] = await Promise.all([
      User.countDocuments({ isBanned: false }),
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      User.countDocuments({ role: 'freelancer', isBanned: false }),
      User.countDocuments({ role: 'client', isBanned: false }),
      Job.countDocuments(),
      Job.countDocuments({ status: 'open', isApproved: true }),
      Job.countDocuments({ status: 'pending' }),
      Application.countDocuments(),
      Portfolio.countDocuments({ status: 'pending' }),
      Job.countDocuments({ isFlagged: true }),
      AccessLog.countDocuments({
        threat: { $ne: 'none' },
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Application.countDocuments({ status: 'hired' }),
    ]);

    // Recent growth (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsersLast30 = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    // Calculate growth rate (Today vs Yesterday)
    const startOfYesterday = new Date(new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000);
    const endOfYesterday = new Date(new Date().setHours(23, 59, 59, 999) - 24 * 60 * 60 * 1000);
    const newUsersYesterday = await User.countDocuments({ 
      createdAt: { $gte: startOfYesterday, $lte: endOfYesterday } 
    });

    const growthRate = newUsersYesterday === 0 
      ? (newUsersToday > 0 ? 100 : 0) 
      : parseFloat(((newUsersToday - newUsersYesterday) / newUsersYesterday * 100).toFixed(1));

    res.json({
      success: true,
      stats: {
        newUsers: newUsersToday,
        newUsersLast30,
        totalUsers,
        totalFreelancers,
        totalClients,
        totalJobs,
        openJobs,
        pendingJobs,
        totalApplications,
        pendingPortfolios,
        flaggedJobs,
        threatsToday,
        successfulMatches,
        growthRate
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── USER MANAGEMENT ───────────────────────────────────────────────

// @route   GET /api/admin/users/export
// @desc    Export all users as CSV
router.get('/users/export', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const users = await User.find()
      .select('name email role isVerified isBanned createdAt lastLogin rating completedJobs')
      .sort('-createdAt');

    let csv = '\ufeffName,Email,Role,Verified,Banned,Joined Date,Last Login,Rating,Completed Jobs\n';
    
    users.forEach(u => {
      const createdAt = u.createdAt ? u.createdAt.toISOString() : 'N/A';
      const lastLogin = u.lastLogin ? u.lastLogin.toISOString() : 'Never';
      csv += `"${u.name || ''}","${u.email || ''}","${u.role || ''}",${!!u.isVerified},${!!u.isBanned},"${createdAt}","${lastLogin}",${u.rating || 0},${u.completedJobs || 0}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { role, status, page = 1, limit = 20, search } = req.query;
    const query = {};
    if (role) query.role = role;
    if (status === 'banned') query.isBanned = true;
    if (status === 'active') query.isBanned = false;
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }

    const users = await User.find(query)
      .select('name email avatar role isVerified isBanned verificationBadge createdAt lastLogin rating completedJobs')
      .sort('-createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);
    res.json({ success: true, users, total, totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/admin/users/:id/ban
router.post('/users/:id/ban', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const { banUntil, isPermanentlyBanned, reason } = req.body;

    const update = {
      isBanned: isPermanentlyBanned || (banUntil && new Date(banUntil) > new Date()),
      banUntil: isPermanentlyBanned ? null : banUntil,
      isPermanentlyBanned,
      banReason: reason || ''
    };

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );

    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

    res.json({
      success: true,
      message: update.isBanned ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản',
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete user permanently
router.delete('/users/:id', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Tài khoản người dùng và toàn bộ dữ liệu đã được xóa vĩnh viễn' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── MODERATION REPORTS ───────────────────────────────────────────

// @route   GET /api/admin/reports
// @desc    Get all reports
router.get('/reports', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'name email avatar')
      .populate('accusedUser', 'name email avatar')
      .populate('jobId', 'title')
      .sort('-createdAt');
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/reports/:id
// @desc    Update report status
router.patch('/reports/:id', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const { status, resolution } = req.body;
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status, resolution, resolvedBy: req.user._id },
      { new: true }
    );
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/verify
router.patch('/users/:id/verify', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const { badge } = req.body; // 'verified', 'top-rated', 'premium', 'none'
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: badge !== 'none', verificationBadge: badge },
      { new: true }
    );
    res.json({ success: true, message: 'Đã cập nhật xác thực', user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['freelancer', 'client', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    res.json({ success: true, message: 'Đã cập nhật vai trò', user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── JOB MODERATION ────────────────────────────────────────────────

// @route   GET /api/admin/jobs/pending
router.get('/jobs/pending', async (req, res) => {
  try {
    const jobs = await Job.find({ status: 'pending' })
      .populate('client', 'name email avatar company')
      .sort('-createdAt')
      .limit(50);
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/jobs/:id/approve
router.patch('/jobs/:id/approve', async (req, res) => {
  try {
    const { approved, reason } = req.body;
    const update = approved
      ? { status: 'open', isApproved: true, approvedBy: req.user._id, approvedAt: new Date() }
      : { status: 'rejected', isApproved: false, flagReason: reason };

    const job = await Job.findByIdAndUpdate(req.params.id, update, { new: true }).populate('client', '_id');

    // Notify client
    const Notification = require('../models/Notification');
    await Notification.create({
      recipient: job.client._id,
      type: 'system',
      title: approved ? 'Tin tuyển dụng được duyệt' : 'Tin tuyển dụng bị từ chối',
      message: approved
        ? `Tin "${job.title}" đã được duyệt và hiển thị công khai`
        : `Tin "${job.title}" bị từ chối: ${reason}`,
      link: `/jobs/${job._id}`,
      jobRef: job._id,
    });

    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PORTFOLIO MODERATION ──────────────────────────────────────────

// @route   GET /api/admin/portfolios/pending
router.get('/portfolios/pending', async (req, res) => {
  try {
    const items = await Portfolio.find({ status: 'pending' })
      .populate('user', 'name email avatar')
      .sort('-createdAt')
      .limit(30);
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/portfolios/:id/approve
router.patch('/portfolios/:id/approve', async (req, res) => {
  try {
    const { approved, reason } = req.body;
    const update = approved
      ? { status: 'approved', approvedBy: req.user._id, approvedAt: new Date() }
      : { status: 'rejected', rejectionReason: reason };

    const item = await Portfolio.findByIdAndUpdate(req.params.id, update, { new: true }).populate('user', '_id name');

    const Notification = require('../models/Notification');
    await Notification.create({
      recipient: item.user._id,
      type: approved ? 'portfolio_approved' : 'portfolio_rejected',
      title: approved ? 'Sản phẩm được duyệt' : 'Sản phẩm bị từ chối',
      message: approved
        ? `Sản phẩm "${item.title}" đã được duyệt và hiển thị trên hồ sơ`
        : `Sản phẩm "${item.title}" bị từ chối: ${reason}`,
      link: `/profile/${item.user._id}`,
    });

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── REVIEW MODERATION ─────────────────────────────────────────────

// @route   GET /api/admin/reviews/flagged
router.get('/reviews/flagged', async (req, res) => {
  try {
    const reviews = await Review.find({ isFlagged: true, isHidden: false })
      .populate('reviewer reviewee', 'name avatar')
      .sort('-createdAt');
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/admin/reviews/:id/hide
router.patch('/reviews/:id/hide', async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { isHidden: true }, { new: true });
    res.json({ success: true, message: 'Đã ẩn đánh giá', review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── SECURITY MONITOR ─────────────────────────────────────────────

// @route   GET /api/admin/security/logs
router.get('/security/logs', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    const { threat, ip, limit = 50, page = 1 } = req.query;
    const query = {};
    if (threat) query.threat = threat;
    if (ip) query.ip = ip;

    const logs = await AccessLog.find(query)
      .populate('user', 'name email avatar')
      .sort('-createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await AccessLog.countDocuments(query);

    // Threat summary
    const threatSummary = await AccessLog.aggregate([
      { $match: { threat: { $ne: 'none' } } },
      { $group: { _id: '$threat', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Top suspicious IPs
    const suspiciousIPs = await AccessLog.aggregate([
      { $match: { isFlagged: true } },
      { $group: { _id: '$ip', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({ success: true, logs, total, threatSummary, suspiciousIPs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/security/traffic
router.get('/security/traffic', authorize('admin', 'moderator', 'superadmin'), async (req, res) => {
  try {
    // Request count per hour (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const traffic = await AccessLog.aggregate([
      { $match: { createdAt: { $gte: oneDayAgo } } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$responseTime' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    res.json({ success: true, traffic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ANALYTICS ────────────────────────────────────────────────────

// @route   GET /api/admin/analytics/skills
router.get('/analytics/skills', async (req, res) => {
  try {
    // Most demanded skills from job postings
    const skills = await Job.aggregate([
      { $match: { isApproved: true } },
      { $unwind: '$requiredSkills' },
      { $group: { _id: '$requiredSkills', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // Top niches
    const niches = await Job.aggregate([
      { $match: { isApproved: true } },
      { $unwind: '$niche' },
      { $group: { _id: '$niche', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, skills, niches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/analytics/growth
router.get('/analytics/growth', async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    const jobGrowth = await Job.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, isApproved: true } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    res.json({ success: true, userGrowth, jobGrowth });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/admin/matching/:jobId
router.get('/matching/:jobId', async (req, res) => {
  try {
    const results = await getMatchingFreelancers(req.params.jobId, 10);
    res.json({ success: true, matches: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
