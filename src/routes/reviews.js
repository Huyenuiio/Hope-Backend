const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const User = require('../models/User');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Notification = require('../models/Notification');
const { protect, optionalAuth } = require('../middleware/auth');

// @route   GET /api/reviews/:userId
// @desc    Get approved reviews for a user
router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const reviews = await Review.find({
      reviewee: req.params.userId,
      isApproved: true,
      isHidden: false,
    })
      .populate('reviewer', 'name avatar company role')
      .sort('-createdAt')
      .limit(20);

    const stats = await Review.aggregate([
      { $match: { reviewee: require('mongoose').Types.ObjectId(req.params.userId), isApproved: true } },
      {
        $group: {
          _id: null,
          avgOverall: { $avg: '$overallRating' },
          avgQuality: { $avg: '$qualityRating' },
          avgCommunication: { $avg: '$communicationRating' },
          avgDeadline: { $avg: '$deadlineRating' },
          count: { $sum: 1 },
        }
      },
    ]);

    res.json({ success: true, reviews, stats: stats[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/reviews
// @desc    Create a review (client reviews freelancer or vice versa)
router.post('/', protect, async (req, res) => {
  try {
    const { revieweeId, jobId, overallRating, qualityRating, communicationRating, deadlineRating, comment } = req.body;

    if (!revieweeId || !comment || !overallRating) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    // Verify relationship: Only hired freelancer can review client, and vice versa
    if (!jobId) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ có thể đánh giá sau khi hoàn thành một công việc cụ thể.' });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc.' });

    const isClientOfJob = job.client.toString() === req.user._id.toString();
    const isFreelancerOfJob = job.hiredFreelancer?.toString() === req.user._id.toString();

    if (!isClientOfJob && !isFreelancerOfJob) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền đánh giá công việc này.' });
    }

    // Ensure the reviewee is the other party
    const expectedRevieweeId = isClientOfJob ? job.hiredFreelancer?.toString() : job.client.toString();
    if (expectedRevieweeId !== revieweeId) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ có thể đánh giá đối tác của mình trong công việc này.' });
    }

    // Prevent duplicate review for same job
    const existing = await Review.findOne({ reviewer: req.user._id, reviewee: revieweeId, job: jobId });
    if (existing) return res.status(400).json({ success: false, message: 'Bạn đã đánh giá đối tác này cho công việc này rồi.' });

    const review = await Review.create({
      reviewer: req.user._id,
      reviewee: revieweeId,
      job: jobId,
      rating: Math.min(5, Math.max(1, overallRating)),
      qualityRating: qualityRating ? Math.min(5, Math.max(1, qualityRating)) : undefined,
      communicationRating: communicationRating ? Math.min(5, Math.max(1, communicationRating)) : undefined,
      deadlineRating: deadlineRating ? Math.min(5, Math.max(1, deadlineRating)) : undefined,
      comment,
      isApproved: true, // Auto-approve, admin can hide later
    });

    await review.populate('reviewer', 'name avatar');

    // Update reviewee's average rating
    const allReviews = await Review.find({ reviewee: revieweeId, isApproved: true });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await User.findByIdAndUpdate(revieweeId, {
      rating: Math.round(avgRating * 10) / 10,
      totalReviews: allReviews.length,
    });

    // Notify reviewee
    await Notification.create({
      recipient: revieweeId,
      sender: req.user._id,
      type: 'new_review',
      title: 'Đánh giá mới',
      message: `${req.user.name} đã đánh giá ${overallRating}/5 ⭐`,
      link: `/portfolio/${revieweeId}`,
    });

    res.status(201).json({ success: true, review, message: 'Đã gửi đánh giá thành công' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/reviews/:id/respond
// @desc    Freelancer responds to a review
router.patch('/:id/respond', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
    if (review.reviewee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }
    if (review.response) return res.status(400).json({ success: false, message: 'Đã trả lời rồi' });

    review.response = req.body.response;
    review.responseDate = new Date();
    await review.save();

    res.json({ success: true, review });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/reviews/:id
// @desc    Delete own review (reviewer only, within 24h)
router.delete('/:id', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    if (review.reviewer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }
    await Review.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Đã xóa đánh giá' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
