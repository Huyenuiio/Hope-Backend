const express = require('express');
const { escapeRegExp } = require('../utils/string');

const router = express.Router();
const User = require('../models/User');
const Portfolio = require('../models/Portfolio');
const Review = require('../models/Review');
const Job = require('../models/Job');
const { protect, optionalAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { cacheMiddleware, clearCachePattern } = require('../middleware/cache');
const { uploadToImgBB } = require('../utils/image');

// Helper for bidirectional block check
const checkBidirectionalBlock = async (userId1, userId2) => {
  if (!userId1 || !userId2) return false;
  const user1 = await User.findById(userId1).select('blockedUsers');
  const user2 = await User.findById(userId2).select('blockedUsers');

  const id1Str = userId1.toString();
  const id2Str = userId2.toString();

  if (user1 && user1.blockedUsers && user1.blockedUsers.map(id => id.toString()).includes(id2Str)) return true;
  if (user2 && user2.blockedUsers && user2.blockedUsers.map(id => id.toString()).includes(id1Str)) return true;
  return false;
};

// @route   GET /api/users
// @desc    Get all freelancers with filters
router.get('/', optionalAuth, cacheMiddleware(300, 'users:list'), async (req, res) => {
  try {
    const {
      role, niche, skills, tools, minRating,
      availability, englishLevel, maxRate, minRate,
      sort = '-rating', page = 1, limit = 12, search,
    } = req.query;

    const query = {
      isActive: true,
      isBanned: false,
      role: { $nin: ['superadmin', 'moderator', 'support'] }
    };

    if (role && role !== 'all') {
      query.role = role;
    } else if (!role && !search) {
      // Default to freelancer only if no search and no role specified
      query.role = 'freelancer';
    }

    if (req.user) {
      const currentUser = await User.findById(req.user._id);
      const blockedMeUsers = await User.find({ blockedUsers: req.user._id }).select('_id');
      const blockedMeIds = blockedMeUsers.map(u => u._id);

      const restrictedIds = [
        ...(currentUser.blockedUsers || []),
        ...blockedMeIds
      ];

      if (restrictedIds.length > 0) {
        query._id = { $nin: restrictedIds };
      }
    }

    if (niche) query.niche = { $in: niche.split(',') };
    if (skills) query.skills = { $in: skills.split(',').map((s) => new RegExp(s, 'i')) };
    if (tools) query.tools = { $in: tools.split(',') };
    if (availability) query.availability = availability;
    if (englishLevel) query.englishLevel = englishLevel;
    if (minRating) query.rating = { $gte: parseFloat(minRating) };
    if (maxRate) query.hourlyRate = { ...query.hourlyRate, $lte: parseFloat(maxRate) };
    if (minRate) query.hourlyRate = { ...query.hourlyRate, $gte: parseFloat(minRate) };
    if (search) {
      const searchWords = search.trim().split(/\s+/).filter(word => word.length > 0);
      if (searchWords.length > 0) {
        const searchRegexes = searchWords.map(word => new RegExp(escapeRegExp(word), 'i'));
        query.$or = [
          { name: { $all: searchRegexes } },
          { headline: { $all: searchRegexes } },
          { bio: { $all: searchRegexes } },
          { skills: { $all: searchRegexes } },
        ];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(query)
        .select('name avatar headline niche skills tools rating totalReviews completedJobs hourlyRate availability verificationBadge location')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      users,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/users/:id
// @desc    Get single user profile
router.get('/:id', optionalAuth, cacheMiddleware(300, 'users:profile'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-lastLoginIP -loginCount -googleId')
      .populate('connections', 'name avatar headline');

    if (!user || user.isBanned) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    let isBlockedByMe = false;
    let hasBlockedMe = false;

    if (req.user) {
      // Check block status
      const currentUser = await User.findById(req.user._id).select('blockedUsers');
      const targetUser = await User.findById(user._id).select('blockedUsers');

      const reqUserIdStr = req.user._id.toString();
      const targetUserIdStr = user._id.toString();

      if (currentUser && currentUser.blockedUsers && currentUser.blockedUsers.map(id => id.toString()).includes(targetUserIdStr)) {
        isBlockedByMe = true;
      }
      if (targetUser && targetUser.blockedUsers && targetUser.blockedUsers.map(id => id.toString()).includes(reqUserIdStr)) {
        hasBlockedMe = true;
      }
    }

    // Increment profile views (if viewer is not the owner)
    if (!req.user || req.user._id.toString() !== user._id.toString()) {
      await User.findByIdAndUpdate(user._id, { $inc: { profileViews: 1 } });
    }

    // Get their portfolio (approved only for public view)
    const portfolioQuery = req.user?._id.toString() === user._id.toString()
      ? { user: user._id }
      : { user: user._id, status: 'approved' };
    const portfolio = await Portfolio.find(portfolioQuery).sort('-createdAt').limit(6);

    // Get reviews
    const reviews = await Review.find({ reviewee: user._id, isApproved: true, isHidden: false })
      .populate('reviewer', 'name avatar')
      .sort('-createdAt')
      .limit(5);

    // Check if the current user can review this profile
    let canReview = false;
    let reviewableJobs = [];
    if (req.user && req.user._id.toString() !== user._id.toString()) {
      const mutualJobs = await Job.find({
        $or: [
          { client: req.user._id, hiredFreelancer: user._id },
          { client: user._id, hiredFreelancer: req.user._id }
        ],
        status: { $in: ['completed', 'in-progress'] } // Can review if started or finished
      }).select('_id title status');

      if (mutualJobs.length > 0) {
        // Check if already reviewed for these jobs
        const existingReviews = await Review.find({
          reviewer: req.user._id,
          reviewee: user._id,
          job: { $in: mutualJobs.map(j => j._id) }
        }).select('job');

        const reviewedJobIds = existingReviews.map(r => r.job.toString());
        reviewableJobs = mutualJobs.filter(j => !reviewedJobIds.includes(j._id.toString()));
        canReview = reviewableJobs.length > 0;
      }
    }

    res.json({
      success: true,
      user,
      portfolio,
      reviews,
      isBlockedByMe,
      hasBlockedMe,
      canReview,
      reviewableJobs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/users/profile
// @desc    Update own profile
router.put('/profile', protect, authorize('freelancer', 'client'), async (req, res) => {
  try {
    const allowedFields = [
      'name', 'headline', 'bio', 'location', 'niche', 'subNiche', 'skills', 'tools',
      'hourlyRate', 'projectRate', 'availability', 'problemsSolved', 'englishLevel',
      'languages', 'expertiseLevel', 'yearsOfExperience',
      'equipment', 'caseStudies', 'company', 'industry', 'website',
      'companySize', 'linkedin', 'github', 'responseTime',
      'workAttitude', 'careerGoals', 'coreBeliefs', 'nicheSpecificData', 'avatar',
      'clientInfo'
    ];

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Auto-upload avatar if it's base64
    if (req.body.avatar && req.body.avatar.startsWith('data:image')) {
      req.body.avatar = await uploadToImgBB(req.body.avatar);
    }

    allowedFields.forEach((field) => {
      // Explicitly overwrite the field if it's provided in the payload
      // This ensures empty arrays [] or empty objects {} actually replace old data
      if (req.body[field] !== undefined) {
        user.set(field, req.body[field]);
      }
    });

    // Force mongoose to recognize changes in mixed type objects
    if (req.body.nicheSpecificData !== undefined) {
      user.markModified('nicheSpecificData');
    }
    if (req.body.clientInfo !== undefined) {
      user.markModified('clientInfo');
    }

    await user.save();

    // Fetch updated user to return clean data
    const updatedUser = await User.findById(req.user._id).select('-lastLoginIP -loginCount -googleId');

    await clearCachePattern('cache:users:*');

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   POST /api/users/:id/connect
// @desc    Send connection request
router.post('/:id/connect', protect, authorize('freelancer', 'client'), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Không thể kết nối với chính mình' });
    }

    // Block check
    const isBlocked = await checkBidirectionalBlock(req.user._id, req.params.id);
    if (isBlocked) {
      return res.status(403).json({ success: false, message: 'Không thể thực hiện hành động này do cài đặt chặn' });
    }

    const alreadyConnected = target.connections.includes(req.user._id);
    if (alreadyConnected) return res.status(400).json({ success: false, message: 'Đã kết nối' });

    const alreadyRequested = target.connectionRequests.some(
      (r) => r.from.toString() === req.user._id.toString() && r.status === 'pending'
    );
    if (alreadyRequested) return res.status(400).json({ success: false, message: 'Đã gửi yêu cầu kết nối' });

    // Atomic update: only push if not already requested (pending) or connected
    const updatedTarget = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        connections: { $ne: req.user._id },
        connectionRequests: { 
          $not: { $elemMatch: { from: req.user._id, status: 'pending' } } 
        }
      },
      {
        $push: { connectionRequests: { from: req.user._id, status: 'pending' } },
      },
      { returnDocument: 'after' }
    );

    if (!updatedTarget) {
      // Check why it failed to provide better error
      const checkTarget = await User.findById(req.params.id);
      if (checkTarget.connections.includes(req.user._id)) {
        return res.status(400).json({ success: false, message: 'Đã kết nối' });
      }
      return res.status(400).json({ success: false, message: 'Yêu cầu kết nối đang chờ xử lý hoặc đã tồn tại' });
    }

    // Create notification
    const Notification = require('../models/Notification');
    await Notification.create({
      recipient: target._id,
      sender: req.user._id,
      type: 'connection_request',
      title: 'Yêu cầu kết nối mới',
      message: `${req.user.name} muốn kết nối với bạn`,
      link: `/profile/${req.user._id}`,
    });

    res.json({ success: true, message: 'Đã gửi yêu cầu kết nối' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/users/connect/:senderId/respond
// @desc    Accept or reject connection request
router.post('/connect/:senderId/respond', protect, authorize('freelancer', 'client'), async (req, res) => {
  const { action } = req.body; // 'accept' or 'reject'
  
  try {
    const userId = req.user._id;
    const senderId = req.params.senderId;

    // 1. Find the user and all pending requests from this sender
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng hiện tại' });
    }

    const requests = user.connectionRequests.filter(r => {
      return r.from && r.from.toString() === senderId && r.status === 'pending';
    });

    if (requests.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu hoặc đã được xử lý' });
    }

    // 2. Perform connection logic if accepted
    if (action === 'accept') {
      await User.updateOne({ _id: userId }, { $addToSet: { connections: senderId } });
      await User.updateOne({ _id: senderId }, { $addToSet: { connections: userId } });
    }

    // 3. Mark ALL pending requests from this sender as processed
    await User.updateOne(
      { _id: userId },
      { 
        $set: { 
          'connectionRequests.$[elem].status': action === 'accept' ? 'accepted' : 'rejected' 
        } 
      },
      { 
        arrayFilters: [{ 'elem.from': senderId, 'elem.status': 'pending' }],
        multi: true 
      }
    );

    // 4. Mark all related Notifications as read and handled
    const Notification = require('../models/Notification');
    await Notification.updateMany(
      { 
        recipient: userId, 
        sender: senderId, 
        type: 'connection_request' 
      },
      { 
        type: 'system',
        isRead: true, 
        readAt: new Date(),
        message: action === 'accept' ? 'Bạn đã chấp nhận kết nối' : 'Bạn đã từ chối kết nối'
      }
    );

    // 5. Create new handled notification for the sender
    await Notification.create({
      recipient: senderId,
      sender: userId,
      type: 'connection_accepted',
      title: action === 'accept' ? 'Yêu cầu kết nối được chấp nhận' : 'Yêu cầu kết nối bị từ chối',
      message: `${user.name} đã ${action === 'accept' ? 'chấp nhận' : 'từ chối'} yêu cầu kết nối của bạn`,
      link: `/profile/${userId}`,
    });

    res.json({ success: true, message: `Đã ${action === 'accept' ? 'chấp nhận' : 'từ chối'} kết nối` });
  } catch (err) {
    console.error('Connection respond error:', err);
    res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi xử lý yêu cầu kết nối' });
  }
});
// @route   DELETE /api/users/connect/:id
// @desc    Disconnect from a user
router.delete('/connect/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const targetUserId = req.params.id;

    // Check if connected
    if (!user.connections.includes(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Chưa kết nối' });
    }

    user.connections.pull(targetUserId);
    await user.save();
    await User.findByIdAndUpdate(targetUserId, { $pull: { connections: user._id } });

    res.json({ success: true, message: 'Đã hủy kết nối' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/users/saved-jobs/:jobId
// @desc    Toggle saving/unsaving a job
router.post('/saved-jobs/:jobId', protect, authorize('freelancer', 'client'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const jobId = req.params.jobId;

    // Use string comparison for reliability with ObjectIds
    const isSaved = (user.savedJobs || []).some(id => id.toString() === jobId);

    if (isSaved) {
      user.savedJobs.pull(jobId);
    } else {
      user.savedJobs.push(jobId);
    }

    await user.save();

    // Invalidate jobs feed cache for this user
    await clearCachePattern(`cache:jobs:feed:${req.user._id}:*`);

    res.json({ success: true, isSaved: !isSaved, message: isSaved ? 'Đã bỏ lưu công việc' : 'Đã lưu công việc' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/users/:id/block
// @desc    Block a user
router.post('/:id/block', protect, async (req, res) => {
  try {
    const userToBlock = await User.findById(req.params.id);
    if (!userToBlock) return res.status(404).json({ success: false, message: 'User not found' });

    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    // Block the user and sever the connection if it exists
    await User.updateOne(
      { _id: req.user._id },
      {
        $addToSet: { blockedUsers: req.params.id },
        $pull: { connections: req.params.id, connectionRequests: { from: req.params.id } }
      }
    );

    // Remove current user from target's connections & friend requests
    await User.updateOne(
      { _id: req.params.id },
      {
        $pull: { connections: req.user._id, connectionRequests: { from: req.user._id } }
      }
    );

    res.json({ success: true, message: `Bạn đã chặn ${userToBlock.name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/users/me/history
// @desc    Get current user's activity history
router.get('/me/history', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, history: user.socialHistory || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/users/me/blocked
// @desc    Get current user's blocked users list
router.get('/me/blocked', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('blockedUsers', 'name avatar headline');
    res.json({ success: true, blockedUsers: user.blockedUsers || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/users/:id/block
// @desc    Unblock a user
router.delete('/:id/block', protect, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $pull: { blockedUsers: req.params.id } }
    );
    res.json({ success: true, message: 'Đã bỏ chặn người dùng' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
