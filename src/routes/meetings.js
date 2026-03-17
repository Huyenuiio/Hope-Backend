const express = require('express');
const router = express.Router();
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// All meeting routes require auth
router.use(protect);

// @route   GET /api/meetings
// @desc    Get all meetings for current user (as organizer or attendee)
router.get('/', async (req, res) => {
  try {
    const meetings = await Meeting.find({
      $or: [
        { organizer: req.user._id },
        { attendees: req.user._id },
      ],
    })
      .populate('organizer', 'name avatar headline')
      .populate('attendees', 'name avatar headline')
      .sort('-scheduledAt');

    res.json({ success: true, meetings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/meetings/:id
// @desc    Get single meeting detail
router.get('/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('organizer', 'name avatar headline')
      .populate('attendees', 'name avatar headline')
      .populate('jobRef', 'title');

    if (!meeting) return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc họp' });

    const isParticipant =
      meeting.organizer._id.toString() === req.user._id.toString() ||
      meeting.attendees.some(a => a._id.toString() === req.user._id.toString());

    if (!isParticipant) return res.status(403).json({ success: false, message: 'Không có quyền xem' });

    res.json({ success: true, meeting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/meetings
// @desc    Create / schedule a meeting
router.post('/', async (req, res) => {
  try {
    const { attendees, title, description, scheduledAt, duration, platform, meetingLink, timezone, jobRef } = req.body;

    if (!attendees?.length || !title || !scheduledAt) {
      return res.status(400).json({ success: false, message: 'Thiếu: người tham dự, tiêu đề, ngày/giờ' });
    }

    // Must be in the future
    if (new Date(scheduledAt) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Thời gian họp phải ở tương lai' });
    }

    const meeting = await Meeting.create({
      organizer: req.user._id,
      attendees,
      title,
      description,
      scheduledAt: new Date(scheduledAt),
      duration: parseInt(duration) || 30,
      platform: platform || 'Google Meet',
      meetingLink,
      timezone: timezone || 'Asia/Ho_Chi_Minh',
      jobRef: jobRef || undefined,
      status: 'pending',
    });

    await meeting.populate([
      { path: 'organizer', select: 'name avatar' },
      { path: 'attendees', select: 'name avatar' },
    ]);

    // Notify all attendees
    const notifPromises = attendees.map(attendeeId =>
      Notification.create({
        recipient: attendeeId,
        sender: req.user._id,
        type: 'meeting_request',
        title: 'Lịch họp mới',
        message: `${req.user.name} mời bạn tham gia "${title}" lúc ${new Date(scheduledAt).toLocaleString('vi-VN')}`,
        link: '/meetings',
        meetingRef: meeting._id,
      })
    );
    await Promise.allSettled(notifPromises);

    // Push real-time notification via socket
    const io = req.app.get('io');
    if (io) {
      attendees.forEach(attendeeId => {
        io.pushNotificationToUser(attendeeId.toString(), {
          type: 'meeting_request',
          title: 'Lịch họp mới',
          message: `${req.user.name} mời bạn tham gia "${title}"`,
          link: '/meetings',
        });
      });
    }

    res.status(201).json({ success: true, meeting, message: 'Đã đặt lịch họp thành công' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/meetings/:id/status
// @desc    Update meeting status (accept/reject/complete/reschedule)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, meetingLink, newScheduledAt } = req.body;
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc họp' });

    const isParticipant =
      meeting.organizer.toString() === req.user._id.toString() ||
      meeting.attendees.some(a => a.toString() === req.user._id.toString());

    if (!isParticipant) return res.status(403).json({ success: false, message: 'Không có quyền' });

    const allowedStatuses = ['pending', 'accepted', 'completed', 'cancelled', 'rescheduled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    meeting.status = status;
    if (meetingLink) meeting.meetingLink = meetingLink;
    if (status === 'rescheduled' && newScheduledAt) {
      meeting.scheduledAt = new Date(newScheduledAt);
      meeting.status = 'pending';
    }
    await meeting.save();

    // Notify organizer when attendee responds
    if (status === 'accepted' || status === 'cancelled') {
      const recipientId = meeting.organizer.toString() === req.user._id.toString()
        ? meeting.attendees[0]
        : meeting.organizer;

      await Notification.create({
        recipient: recipientId,
        sender: req.user._id,
        type: status === 'accepted' ? 'meeting_accepted' : 'meeting_cancelled',
        title: status === 'accepted' ? 'Lịch họp được xác nhận' : 'Lịch họp bị hủy',
        message: `${req.user.name} đã ${status === 'accepted' ? 'chấp nhận' : 'hủy'} lịch họp "${meeting.title}"`,
        link: '/meetings',
      });
    }

    await meeting.populate([
      { path: 'organizer', select: 'name avatar' },
      { path: 'attendees', select: 'name avatar' },
    ]);

    res.json({ success: true, meeting, message: `Đã cập nhật trạng thái: ${status}` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/meetings/:id
// @desc    Cancel / delete a meeting (organizer only)
router.delete('/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc họp' });
    if (meeting.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Chỉ người tổ chức mới có thể hủy' });
    }

    meeting.status = 'cancelled';
    await meeting.save();

    // Notify attendees
    const notifPromises = meeting.attendees.map(attendeeId =>
      Notification.create({
        recipient: attendeeId,
        sender: req.user._id,
        type: 'meeting_cancelled',
        title: 'Lịch họp đã bị hủy',
        message: `${req.user.name} đã hủy lịch họp "${meeting.title}"`,
        link: '/meetings',
      })
    );
    await Promise.allSettled(notifPromises);

    res.json({ success: true, message: 'Đã hủy cuộc họp' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
