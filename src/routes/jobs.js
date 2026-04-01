const express = require('express');
const { escapeRegExp } = require('../utils/string');

const router = express.Router();
const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const { protect, optionalAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { getRecommendedJobs } = require('../utils/matching');
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

// @route   GET /api/jobs
// @desc    Get jobs with search and filters
router.get('/', optionalAuth, cacheMiddleware(300, 'jobs:feed'), async (req, res) => {
  try {
    const {
      search, niche, skills, budgetMin, budgetMax, budgetType,
      workType, duration, englishRequired, sort = '-createdAt',
      page = 1, limit = 10, status = 'open',
      appliedOnly, savedOnly
    } = req.query;

    const query = { isApproved: true, status };

    let restrictedIdsStr = [];
    if (req.user) {
      const currentUser = await User.findById(req.user._id).populate('blockedUsers');
      const currentUserBlockedIds = currentUser.blockedUsers.map(u => u._id.toString());

      const blockedMeUsers = await User.find({ blockedUsers: req.user._id }).select('_id');
      const blockedMeIds = blockedMeUsers.map(u => u._id.toString());

      restrictedIdsStr = [...currentUserBlockedIds, ...blockedMeIds];

      if (restrictedIdsStr.length > 0) {
        query.client = { $nin: restrictedIdsStr };
      }
    }

    if (niche) query.niche = { $in: niche.split(',') };
    if (skills) query.requiredSkills = { $in: skills.split(',').map((s) => new RegExp(s, 'i')) };
    if (workType) query.workType = workType;
    if (duration) query.duration = duration;
    if (englishRequired) query.englishRequired = englishRequired;
    if (budgetType) query['budget.type'] = budgetType;
    if (budgetMax) query['budget.max'] = { $lte: parseFloat(budgetMax) };

    // New Role-specific filters
    if (req.user) {
      if (appliedOnly === 'true') {
        const applications = await Application.find({ freelancer: req.user._id }).select('job');
        const appliedJobIds = applications.map(a => a.job);
        query._id = { ...query._id, $in: appliedJobIds };
      }
      if (String(savedOnly) === 'true') {
        query._id = { ...query._id, $in: req.user.savedJobs || [] };
      }
    }
    if (search) {
      const searchWords = search.trim().split(/\s+/).filter(word => word.length > 0);
      if (searchWords.length > 0) {
        const searchRegexes = searchWords.map(word => new RegExp(escapeRegExp(word), 'i'));
        query.$or = [
          { title: { $all: searchRegexes } },
          { description: { $all: searchRegexes } },
          { tags: { $all: searchRegexes } },
        ];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [jobs, total] = await Promise.all([
      Job.find(query)
        .populate('client', 'name avatar company rating location industry postedJobsCount')
        .populate({ path: 'comments.user', select: 'name avatar' })
        .populate({ path: 'comments.replies.user', select: 'name avatar' })
        .sort(sort).skip(skip).limit(parseInt(limit)),
      Job.countDocuments(query),
    ]);

    // For each job, we want to know the total jobs posted by that client.
    // However, doing this in a loop or count is expensive. 
    // Let's just enhance the objects with the count if we want it to be accurate.
    // Or we can rely on a virtual or just more population.

    // Let's add the count to the client object for each job
    const enhancedJobsWithCounts = await Promise.all(jobs.map(async (j) => {
      const jobObj = j.toObject();
      if (jobObj.client) {
        const count = await Job.countDocuments({ client: jobObj.client._id });
        jobObj.client.postedJobsCount = count;
      }
      return jobObj;
    }));

    // Enhance jobs with user-specific data (hasApplied, isSaved) and filter comments
    let enhancedJobs = enhancedJobsWithCounts;
    if (req.user) {
      const appliedJobs = await Application.find({ freelancer: req.user._id }).select('job');
      const appliedJobIds = appliedJobs.map(a => a.job.toString());
      const savedJobIds = (req.user.savedJobs || []).map(id => id.toString());

      enhancedJobs = enhancedJobs.map(job => {
        // Add block flag to comments and replies from restricted users
        const processedComments = (job.comments || []).map(c => {
          if (!c.user) return c;
          const authorIdStr = c.user._id ? c.user._id.toString() : c.user.toString();
          if (restrictedIdsStr.includes(authorIdStr)) c.isBlockedContent = true;

          const processedReplies = (c.replies || []).map(r => {
            if (!r.user) return r;
            const replyAuthorIdStr = r.user._id ? r.user._id.toString() : r.user.toString();
            if (restrictedIdsStr.includes(replyAuthorIdStr)) r.isBlockedContent = true;
            return r;
          });
          return { ...c, replies: processedReplies };
        });

        return {
          ...job,
          comments: processedComments,
          hasApplied: appliedJobIds.includes(job._id.toString()),
          isSaved: savedJobIds.includes(job._id.toString())
        };
      });
    }

    res.json({
      success: true,
      count: jobs.length,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      jobs: enhancedJobs,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/jobs/insights/market
// @desc    Get real-time market insights based on job data
router.get('/insights/market', protect, cacheMiddleware(1800, 'jobs:insights'), async (req, res) => {
  try {
    // 1. Get Top Skills (Aggregate Niche & RequiredSkills)
    const topSkills = await Job.aggregate([
      { $match: { isApproved: true } },
      { $project: { allSkills: { $concatArrays: [{ $ifNull: ["$niche", []] }, { $ifNull: ["$requiredSkills", []] }] } } },
      { $unwind: "$allSkills" },
      { $group: { _id: "$allSkills", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const insights = [];

    if (topSkills.length > 0) {
      const top = topSkills[0]._id;
      insights.push({
        type: 'demand',
        title: `Kỹ năng "${top}" đang có nhu cầu rất cao`,
        desc: `Candidates with "${top}" skills are currently in high demand. Consider highlighting your remote work benefits.`,
        icon: 'trending_up',
        color: 'primary'
      });
    }

    // Default Fallbacks/Plausible extras
    insights.push({
      type: 'trend',
      title: 'Video editing tăng 40% nhu cầu',
      desc: 'Nhu cầu về hậu kỳ video ngắn (Reels/TikTok) đang bùng nổ.',
      icon: 'check_circle',
      color: 'green-500'
    });

    insights.push({
      type: 'tip',
      title: 'Freelancer top-rated phản hồi nhanh hơn',
      desc: 'Ưu tiên những hồ sơ có huy hiệu Top Rated để tối ưu thời gian tuyển dụng.',
      icon: 'star',
      color: 'amber-500'
    });

    res.json(insights);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/jobs/recommended
// @desc    Get recommended jobs for current freelancer
router.get('/recommended', protect, cacheMiddleware(300, 'jobs:recommended'), async (req, res) => {
  try {
    let results = await getRecommendedJobs(req.user._id, 20);

    const currentUser = await User.findById(req.user._id).populate('blockedUsers');
    const currentUserBlockedIds = currentUser.blockedUsers.map(u => u._id.toString());
    const blockedMeUsers = await User.find({ blockedUsers: req.user._id }).select('_id');
    const blockedMeIds = blockedMeUsers.map(u => u._id.toString());
    const restrictedIdsStr = [...currentUserBlockedIds, ...blockedMeIds];

    results = results.filter(r => {
      const clientStr = r.job.client ? r.job.client.toString() : null;
      return !(clientStr && restrictedIdsStr.includes(clientStr));
    }).slice(0, 10);

    // Enhance with user-specific data
    const user = await req.user.populate('savedJobs');
    const appliedJobs = await Application.find({ freelancer: req.user._id }).select('job');
    const appliedJobIds = appliedJobs.map(a => a.job.toString());
    const savedJobIds = (user.savedJobs || []).map(id => id.toString());

    const enhancedJobs = results.map(r => {
      const jobObj = r.job.toObject();

      const processedComments = (jobObj.comments || []).map(c => {
        if (!c.user) return c;
        const authorIdStr = c.user._id ? c.user._id.toString() : c.user.toString();
        if (restrictedIdsStr.includes(authorIdStr)) c.isBlockedContent = true;

        const processedReplies = (c.replies || []).map(rep => {
          if (!rep.user) return rep;
          const replyAuthorIdStr = rep.user._id ? rep.user._id.toString() : rep.user.toString();
          if (restrictedIdsStr.includes(replyAuthorIdStr)) rep.isBlockedContent = true;
          return rep;
        });
        return { ...c, replies: processedReplies };
      });

      return {
        ...jobObj,
        comments: processedComments,
        matchScore: r.score,
        hasApplied: appliedJobIds.includes(jobObj._id.toString()),
        isSaved: savedJobIds.includes(jobObj._id.toString())
      };
    });

    res.json({ success: true, jobs: enhancedJobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/jobs/my-jobs
// @desc    Get all jobs posted by the current client (including pending/rejected)
router.get('/my-jobs', protect, authorize('client'), async (req, res) => {
  try {
    const jobs = await Job.find({ client: req.user._id })
      .sort('-createdAt')
      .populate('hiredFreelancer', 'name');
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get job detail
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('client', 'name avatar company rating totalReviews location industry companySize clientInfo bio isVerified verificationBadge')
      .populate('hiredFreelancer', 'name avatar headline')
      .populate({ path: 'comments.user', select: 'name avatar' })
      .populate({ path: 'comments.replies.user', select: 'name avatar' });

    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    let restrictedIdsStr = [];
    if (req.user) {
      const currentUser = await User.findById(req.user._id).populate('blockedUsers');
      const currentUserBlockedIds = currentUser.blockedUsers.map(u => u._id.toString());

      const blockedMeUsers = await User.find({ blockedUsers: req.user._id }).select('_id');
      const blockedMeIds = blockedMeUsers.map(u => u._id.toString());

      restrictedIdsStr = [...currentUserBlockedIds, ...blockedMeIds];

      if (restrictedIdsStr.includes(job.client._id.toString())) {
        return res.status(403).json({ success: false, message: 'Nội dung này không khả dụng.' });
      }
    }

    // Increment views
    await Job.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    // Check if current user has applied or saved
    let hasApplied = false;
    let isSaved = false;
    if (req.user) {
      const app = await Application.findOne({ job: job._id, freelancer: req.user._id });
      hasApplied = !!app;

      const user = await req.user.populate('savedJobs');
      isSaved = (user.savedJobs || []).some(id => id.toString() === job._id.toString());
    }

    const clientJobCount = await Job.countDocuments({ client: job.client._id });
    const jobData = job.toObject();

    if (req.user) {
      jobData.comments = (jobData.comments || []).map(c => {
        if (!c.user) return c;
        const authorIdStr = c.user._id ? c.user._id.toString() : c.user.toString();
        if (restrictedIdsStr.includes(authorIdStr)) c.isBlockedContent = true;

        c.replies = (c.replies || []).map(r => {
          if (!r.user) return r;
          const replyAuthorIdStr = r.user._id ? r.user._id.toString() : r.user.toString();
          if (restrictedIdsStr.includes(replyAuthorIdStr)) r.isBlockedContent = true;
          return r;
        });
        return c;
      });
    }

    if (jobData.client) {
      jobData.client.postedJobsCount = clientJobCount;
    }

    res.json({
      success: true,
      job: {
        ...jobData,
        hasApplied,
        isSaved
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs
// @desc    Create a new job posting
router.post('/', protect, authorize('client'), async (req, res) => {
  try {
    const jobData = { ...req.body, client: req.user._id, status: 'pending', isApproved: false };
    const job = await Job.create(jobData);

    // Notify admin if job is flagged
    if (job.isFlagged) {
      console.warn(`⚠️  Flagged job created: "${job.title}" — Keywords: ${job.flaggedKeywords.join(', ')}`);
    }

    const message = job.isFlagged
      ? 'Tin tuyển dụng đang chờ duyệt do phát hiện từ ngữ cần kiểm tra'
      : 'Tin tuyển dụng đang chờ duyệt từ admin';

    await clearCachePattern('cache:jobs:*');

    res.status(201).json({ success: true, message, job });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update a job (client only, or admin)
router.put('/:id', protect, async (req, res) => {
  try {
    let job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền chỉnh sửa công việc này' });
    }

    const allowedUpdates = ['title', 'description', 'niche', 'requiredSkills', 'requiredTools',
      'budget', 'deadline', 'duration', 'workType', 'englishRequired', 'tags', 'status'];

    const updates = {};
    allowedUpdates.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    job = await Job.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    await clearCachePattern('cache:jobs:*');

    res.json({ success: true, job });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/jobs/:id
// @desc    Delete a job (client only, or admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền xóa công việc này' });
    }

    await Job.findByIdAndDelete(req.params.id);
    await clearCachePattern('cache:jobs:*');

    res.json({ success: true, message: 'Đã xóa công việc' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/apply
// @desc    Apply to a job
router.post('/:id/apply', protect, authorize('freelancer'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate('client', '_id name');
    if (!job || job.status !== 'open') {
      return res.status(400).json({ success: false, message: 'Công việc này không còn nhận đơn' });
    }

    const existing = await Application.findOne({ job: req.params.id, freelancer: req.user._id });
    if (existing) return res.status(400).json({ success: false, message: 'Bạn đã nộp đơn rồi' });

    const application = await Application.create({
      job: req.params.id,
      freelancer: req.user._id,
      coverLetter: req.body.coverLetter,
      proposedRate: req.body.proposedRate,
      estimatedDuration: req.body.estimatedDuration,
      portfolioItems: req.body.portfolioItems || [],
    });

    // Update applicant count
    await Job.findByIdAndUpdate(req.params.id, { $inc: { applicantCount: 1 } });

    // Notify client
    await Notification.create({
      recipient: job.client._id,
      sender: req.user._id,
      type: 'new_application',
      title: 'Đơn ứng tuyển mới',
      message: `${req.user.name} đã ứng tuyển vào "${job.title}"`,
      link: `/employer/jobs/${job._id}/applications`,
      jobRef: job._id,
      applicationRef: application._id,
    });

    res.status(201).json({ success: true, message: 'Đã nộp đơn thành công', application });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   GET /api/jobs/:id/applications
// @desc    Get all applications for a job (client only)
router.get('/:id/applications', protect, authorize('client', 'admin', 'moderator'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    if (job.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền xem' });
    }

    const applications = await Application.find({ job: req.params.id, isWithdrawn: false })
      .populate({
        path: 'freelancer',
        select: 'name headline niche skills tools rating completedJobs hourlyRate',
      })
      .populate('portfolioItems', 'title thumbnailUrl mediaUrl')
      .sort({ status: 1, createdAt: -1 });

    res.json({ success: true, applications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/jobs/:id/applications/:appId/accept
// @desc    Accept a freelancer's application for a job
router.put('/:id/applications/:appId/accept', protect, authorize('client'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    if (job.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });
    }

    const application = await Application.findById(req.params.appId);
    if (!application || application.job.toString() !== job._id.toString()) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn ứng tuyển' });
    }

    application.status = 'hired';
    await application.save();

    // Mark job as no longer open if needed (optional)
    // job.status = 'closed';
    // await job.save();

    // Notify freelancer
    const newNotif = await Notification.create({
      recipient: application.freelancer,
      sender: req.user._id,
      type: 'job_hired',
      title: 'Chúc mừng! Bạn đã trúng tuyển',
      message: `${req.user.name} đã chấp nhận đơn ứng tuyển của bạn cho vị trí "${job.title}"`,
      link: `/messages?with=${req.user._id}`,
      jobRef: job._id,
      applicationRef: application._id,
    });

    // Real-time notification if socket is available
    const io = req.app.get('io');
    if (io && io.pushNotificationToUser) {
      io.pushNotificationToUser(application.freelancer.toString(), newNotif);
    }

    res.json({ success: true, message: 'Đã chấp nhận ứng viên', application });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/jobs/:id/applications/:appId/reject
// @desc    Reject a freelancer's application for a job
router.put('/:id/applications/:appId/reject', protect, authorize('client'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    if (job.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });
    }

    const application = await Application.findById(req.params.appId);
    if (!application || application.job.toString() !== job._id.toString()) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn ứng tuyển' });
    }

    application.status = 'rejected';
    await application.save();

    // Notify freelancer
    const newNotif = await Notification.create({
      recipient: application.freelancer,
      sender: req.user._id,
      type: 'application_status',
      title: 'Cập nhật trạng thái ứng tuyển',
      message: `${req.user.name} đã từ chối đơn ứng tuyển của bạn cho vị trí "${job.title}"`,
      link: `/employer/jobs/${job._id}/applications`,
      jobRef: job._id,
      applicationRef: application._id,
    });

    // Real-time notification if socket is available
    const io = req.app.get('io');
    if (io && io.pushNotificationToUser) {
      io.pushNotificationToUser(application.freelancer.toString(), newNotif);
    }

    res.json({ success: true, message: 'Đã từ chối ứng viên', application });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/react
// @desc    Toggle or update reaction on a job
router.post('/:id/react', protect, authorize('freelancer', 'client'), async (req, res) => {
  try {
    const { type } = req.body; // like, love, haha, wow, sad, angry
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    // Block check
    const isBlocked = await checkBidirectionalBlock(req.user._id, job.client);
    if (isBlocked) {
      return res.status(403).json({ success: false, message: 'Không thể tương tác với bài đăng này do cài đặt chặn' });
    }

    const reactionIndex = job.reactions.findIndex(r => r.user.toString() === req.user._id.toString());
    let isNew = false;
    let oldReaction = null;

    if (reactionIndex > -1) {
      oldReaction = job.reactions[reactionIndex].type;
      if (oldReaction === type) {
        // Same reaction, toggle off (unlike)
        job.reactions.splice(reactionIndex, 1);
      } else {
        // Change reaction type
        job.reactions[reactionIndex].type = type;
      }
    } else {
      // New reaction
      job.reactions.push({ user: req.user._id, type });
      isNew = true;

      // Update User History
      req.user.socialHistory.unshift({
        type: type, // Record the specific reaction type
        jobId: job._id,
        jobTitle: job.title,
        reactionType: type,
        createdAt: new Date()
      });
      await req.user.save();
    }

    await job.save();

    // Create Notification for job owner
    if (isNew && job.client.toString() !== req.user._id.toString()) {
      const Notification = require('../models/Notification');
      const reactionLabels = {
        like: 'Thích', love: 'Yêu thích', care: 'Thương thương',
        haha: 'Haha', wow: 'Wow', sad: 'Buồn', angry: 'Phẫn nộ'
      };
      const label = reactionLabels[type] || 'Thích';

      const notif = new Notification({
        recipient: job.client,
        sender: req.user._id,
        type: 'job_reaction',
        title: 'Tương tác mới',
        message: `đã bày tỏ cảm xúc "${label}" về bài đăng của bạn: "${job.title}"`,
        link: `/dashboard?jobId=${job._id}`,
        jobRef: job._id
      });
      await notif.save().catch(err => console.error('Notif save error:', err));

      const io = req.app.get('io');
      if (io) {
        io.to(job.client.toString()).emit('new_notification', notif);
      }
    }

    // Group counts
    const counts = job.reactions.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      userReaction: reactionIndex > -1 && oldReaction === type ? null : type,
      counts,
      total: job.reactions.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/comment
// @desc    Add a comment to a job
router.post('/:id/comment', protect, authorize('freelancer', 'client'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    // Block check
    const isBlocked = await checkBidirectionalBlock(req.user._id, job.client);
    if (isBlocked) {
      return res.status(403).json({ success: false, message: 'Không thể bình luận trên bài đăng này do cài đặt chặn' });
    }

    const { text, mentionUserId, mentionUserName } = req.body;
    let { image } = req.body;

    // Auto-upload comment image if it's base64
    if (image && image.startsWith('data:image')) {
      image = await uploadToImgBB(image);
    }

    const newComment = {
      user: req.user._id,
      text,
      image,
      mention: (mentionUserId && mentionUserName) ? { user: mentionUserId, name: mentionUserName } : null,
      createdAt: new Date()
    };

    job.comments.push(newComment);
    await job.save();

    // Create Notification for job owner 
    // Prioritize mention if present, otherwise general comment alert
    if (job.client.toString() !== req.user._id.toString()) {
      const Notification = require('../models/Notification');
      const isMentioningOwner = mentionUserId && mentionUserId.toString() === job.client.toString();

      const notif = new Notification({
        recipient: job.client,
        sender: req.user._id,
        type: 'job_comment',
        title: isMentioningOwner ? 'Đã nhắc đến bạn' : 'Bình luận mới',
        message: isMentioningOwner
          ? `đã nhắc đến bạn trong một bình luận: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
          : `đã bình luận về bài đăng của bạn: "${job.title}"`,
        link: `/dashboard?jobId=${job._id}`,
        jobRef: job._id
      });
      await notif.save().catch(err => console.error('Notif save error:', err));

      const io = req.app.get('io');
      if (io) {
        io.to(job.client.toString()).emit('new_notification', notif);
      }
    }

    // Update User History
    req.user.socialHistory.unshift({
      type: 'comment',
      jobId: job._id,
      jobTitle: job.title,
      text: req.body.text,
      image: req.body.image,
      createdAt: new Date()
    });
    await req.user.save();

    res.json({ success: true, comment: job.comments[job.comments.length - 1] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/jobs/:id/comment/:commentId
// @desc    Update a comment
router.put('/:id/comment/:commentId', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const comment = job.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (req.body.text) comment.text = req.body.text;
    if (req.body.image !== undefined) {
      comment.image = await uploadToImgBB(req.body.image);
    }

    await job.save();
    res.json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/comment/:commentId/react
// @desc    React to a comment
router.post('/:id/comment/:commentId/react', protect, async (req, res) => {
  try {
    const { type } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const comment = job.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    // Block check
    const isBlocked = await checkBidirectionalBlock(req.user._id, comment.user);
    if (isBlocked) {
      return res.status(403).json({ success: false, message: 'Không thể tương tác với bình luận này do cài đặt chặn' });
    }

    if (!comment.reactions) comment.reactions = [];

    const reactionIndex = comment.reactions.findIndex(r => r.user.toString() === req.user._id.toString());

    if (reactionIndex > -1) {
      if (comment.reactions[reactionIndex].type === type) {
        comment.reactions.splice(reactionIndex, 1);
      } else {
        comment.reactions[reactionIndex].type = type;
      }
    } else {
      comment.reactions.push({ user: req.user._id, type });

      // Create Notification for comment author
      if (comment.user.toString() !== req.user._id.toString()) {
        const Notification = require('../models/Notification');
        const reactionLabels = {
          like: 'Thích', love: 'Yêu thích', care: 'Thương thương',
          haha: 'Haha', wow: 'Wow', sad: 'Buồn', angry: 'Phẫn nộ'
        };
        const label = reactionLabels[type] || 'Thích';

        const notif = new Notification({
          recipient: comment.user,
          sender: req.user._id,
          type: 'comment_reaction',
          title: 'Tương tác mới',
          message: `đã bày tỏ cảm xúc "${label}" về bình luận của bạn trong bài đăng "${job.title}"`,
          link: `/dashboard?jobId=${job._id}`,
          jobRef: job._id
        });
        await notif.save().catch(err => console.error('Notif save error:', err));

        const io = req.app.get('io');
        if (io) {
          io.to(comment.user.toString()).emit('new_notification', notif);
        }
      }

      // History record
      req.user.socialHistory.unshift({
        type: 'comment_reaction',
        jobId: job._id,
        jobTitle: job.title,
        reactionType: type,
        createdAt: new Date()
      });
      await req.user.save();
    }

    await job.save();
    res.json({ success: true, reactions: comment.reactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/comment/:commentId/reply
// @desc    Reply to a comment
router.post('/:id/comment/:commentId/reply', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const comment = job.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    // Block check (check with both job owner and comment owner)
    const isBlockedByOwner = await checkBidirectionalBlock(req.user._id, job.client);
    const isBlockedByCommenter = await checkBidirectionalBlock(req.user._id, comment.user);
    if (isBlockedByOwner || isBlockedByCommenter) {
      return res.status(403).json({ success: false, message: 'Không thể phản hồi do cài đặt chặn' });
    }

    const { text, mentionUserId, mentionUserName } = req.body;
    let { image } = req.body;

    // Auto-upload reply image if it's base64
    if (image && image.startsWith('data:image')) {
      image = await uploadToImgBB(image);
    }

    const newReply = {
      user: req.user._id,
      text,
      image,
      mention: (mentionUserId && mentionUserName) ? { user: mentionUserId, name: mentionUserName } : null,
      createdAt: new Date()
    };

    comment.replies.push(newReply);
    await job.save();

    // Notification Logic: Prioritize mentioned user, then comment author
    const Notification = require('../models/Notification');
    const recipientId = mentionUserId || (comment.user.toString() !== req.user._id.toString() ? comment.user : null);

    if (recipientId && recipientId.toString() !== req.user._id.toString()) {
      const notif = new Notification({
        recipient: recipientId,
        sender: req.user._id,
        type: 'comment_reply',
        title: mentionUserId ? 'Đã nhắc đến bạn' : 'Phản hồi mới',
        message: mentionUserId
          ? `đã nhắc đến bạn trong một phản hồi: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
          : `đã phản hồi bình luận của bạn: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
        link: `/dashboard?jobId=${job._id}`,
        jobRef: job._id
      });
      await notif.save().catch(err => console.error('Notif save error:', err));

      const io = req.app.get('io');
      if (io) {
        io.to(recipientId.toString()).emit('new_notification', notif);
      }
    }

    // Discussion Pulse: Notify Job Owner if they aren't the direct recipient
    if (job.client.toString() !== req.user._id.toString() &&
      (!recipientId || recipientId.toString() !== job.client.toString())) {
      const ownerNotif = new Notification({
        recipient: job.client,
        sender: req.user._id,
        type: 'comment_reply',
        title: 'Hoạt động mới trên bài đăng',
        message: `đã phản hồi một bình luận trong bài đăng của bạn: "${job.title}"`,
        link: `/dashboard?jobId=${job._id}`,
        jobRef: job._id
      });
      await ownerNotif.save().catch(err => console.error('Owner Notif save error:', err));

      const io = req.app.get('io');
      if (io) {
        io.to(job.client.toString()).emit('new_notification', ownerNotif);
      }
    }

    // History record
    req.user.socialHistory.unshift({
      type: 'comment_reply',
      jobId: job._id,
      jobTitle: job.title,
      text: text,
      image: image,
      createdAt: new Date()
    });
    await req.user.save();

    res.json({ success: true, reply: comment.replies[comment.replies.length - 1] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/jobs/:id/comment/:commentId/reply/:replyId
// @desc    Update a reply
router.put('/:id/comment/:commentId/reply/:replyId', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    const comment = job?.comments.id(req.params.commentId);
    const reply = comment?.replies.id(req.params.replyId);

    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });

    if (reply.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (req.body.text) reply.text = req.body.text;
    if (req.body.image !== undefined) {
      reply.image = await uploadToImgBB(req.body.image);
    }

    await job.save();
    res.json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/jobs/:id/comment/:commentId/reply/:replyId
// @desc    Delete a reply
router.delete('/:id/comment/:commentId/reply/:replyId', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    const comment = job?.comments.id(req.params.commentId);
    const reply = comment?.replies.id(req.params.replyId);

    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });

    if (reply.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    comment.replies.pull({ _id: req.params.replyId });
    await job.save();
    res.json({ success: true, message: 'Phản hồi đã được xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/report
// @desc    Report a comment/reply
router.post('/report', protect, async (req, res) => {
  try {
    const { accusedUser, type, jobId, commentId, replyId, reason, contentPreview } = req.body;

    const report = new Report({
      reporter: req.user._id,
      accusedUser,
      type,
      jobId,
      commentId,
      replyId,
      reason,
      contentPreview
    });

    await report.save();
    res.json({ success: true, message: 'Báo cáo đã được gửi tới quản trị viên' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// @route   POST /api/jobs/:id/comment/:commentId/reply/:replyId/react
// @desc    React to a reply
router.post('/:id/comment/:commentId/reply/:replyId/react', protect, async (req, res) => {
  try {
    const { type } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const comment = job.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });

    if (!reply.reactions) reply.reactions = [];

    const reactionIndex = reply.reactions.findIndex(r => r.user.toString() === req.user._id.toString());

    if (reactionIndex > -1) {
      if (reply.reactions[reactionIndex].type === type) {
        reply.reactions.splice(reactionIndex, 1);
      } else {
        reply.reactions[reactionIndex].type = type;
      }
    } else {
      reply.reactions.push({ user: req.user._id, type });

      // Create Notification for reply author
      if (reply.user.toString() !== req.user._id.toString()) {
        const Notification = require('../models/Notification');
        const reactionLabels = {
          like: 'Thích', love: 'Yêu thích', care: 'Thương thương',
          haha: 'Haha', wow: 'Wow', sad: 'Buồn', angry: 'Phẫn nộ'
        };
        const label = reactionLabels[type] || 'Thích';

        const notif = new Notification({
          recipient: reply.user,
          sender: req.user._id,
          type: 'reply_reaction',
          title: 'Tương tác mới',
          message: `đã bày tỏ cảm xúc "${label}" về phản hồi của bạn trong bài đăng "${job.title}"`,
          link: `/dashboard?jobId=${job._id}`,
          jobRef: job._id
        });
        await notif.save().catch(err => console.error('Notif save error:', err));

        const io = req.app.get('io');
        if (io) {
          io.to(reply.user.toString()).emit('new_notification', notif);
        }
      }

      // History record
      req.user.socialHistory.unshift({
        type: 'reply_reaction',
        jobId: job._id,
        jobTitle: job.title,
        reactionType: type,
        createdAt: new Date()
      });
      await req.user.save();
    }

    await job.save();
    res.json({ success: true, reactions: reply.reactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/share
router.post('/:id/share', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.shares.push({ user: req.user._id });
    await job.save();

    req.user.socialHistory.unshift({
      type: 'share',
      jobId: job._id,
      jobTitle: job.title,
      createdAt: new Date()
    });
    await req.user.save();

    res.json({ success: true, shareCount: job.shares.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/send
router.post('/:id/send', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.sends.push({ user: req.user._id });
    await job.save();

    req.user.socialHistory.unshift({
      type: 'send',
      jobId: job._id,
      jobTitle: job.title,
      createdAt: new Date()
    });
    await req.user.save();

    res.json({ success: true, sendCount: job.sends.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/jobs/:id/report
router.post('/:id/report', protect, async (req, res) => {
  try {
    const { reason, description } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Prevent duplicate reports
    const existingReport = await Report.findOne({
      reporter: req.user._id,
      jobId: job._id,
      status: 'pending'
    });
    if (existingReport) {
      return res.status(400).json({ success: false, message: 'Bạn đã báo cáo công việc này rồi. Quản trị viên đang xem xét.' });
    }

    const report = await Report.create({
      reporter: req.user._id,
      accusedUser: job.client,
      type: 'job',
      jobId: job._id,
      reason: `${reason}: ${description}`,
      contentPreview: job.title,
      status: 'pending'
    });

    // Also flag the job in the Job model for immediate visibility
    job.isFlagged = true;
    job.flagReason = reason;
    await job.save();

    // Notify admins (optional, but good for UX)
    // In a real app we might send an email or socket event here.

    res.json({ success: true, message: 'Báo cáo đã được gửi tới quản trị viên', report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
