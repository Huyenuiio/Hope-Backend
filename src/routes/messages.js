const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

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

// All message routes require auth
router.use(protect);

// @route   GET /api/messages/notifications/all
// @desc    Get all notifications for current user
// IMPORTANT: Must be BEFORE /:userId to prevent routing conflict
router.get('/notifications/all', async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'name avatar')
      .sort('-createdAt')
      .limit(50);

    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });

    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/messages/notifications/read-all
// @desc    Mark all notifications as read
router.patch('/notifications/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: 'Đã đánh dấu tất cả đã đọc' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/messages/conversations
// @desc    Get all conversations for current user
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user._id;

    const userIdObj = new mongoose.Types.ObjectId(userId);

    // Get latest message from each conversation with detailed populates
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: userIdObj }, { receiver: userIdObj }],
          isDeleted: false,
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$receiver', userIdObj] }, { $eq: ['$isRead', false] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $limit: 50 },
      // Inline lookup for sender
      {
        $lookup: {
          from: 'users',
          localField: 'lastMessage.sender',
          foreignField: '_id',
          as: 'senderInfo'
        }
      },
      // Inline lookup for receiver
      {
        $lookup: {
          from: 'users',
          localField: 'lastMessage.receiver',
          foreignField: '_id',
          as: 'receiverInfo'
        }
      },
      {
        $addFields: {
          'lastMessage.sender': { $arrayElemAt: ['$senderInfo', 0] },
          'lastMessage.receiver': { $arrayElemAt: ['$receiverInfo', 0] }
        }
      },
      {
        $project: {
          senderInfo: 0,
          receiverInfo: 0,
          'lastMessage.sender.password': 0,
          'lastMessage.sender.email': 0,
          'lastMessage.receiver.password': 0,
          'lastMessage.receiver.email': 0,
          'lastMessage.sender.lastLoginIP': 0,
          'lastMessage.receiver.lastLoginIP': 0
        }
      }
    ]);

    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/messages/:userId
// @desc    Get messages in a conversation with a specific user
router.get('/:userId', async (req, res) => {
  try {
    let isBlockedByMe = false;
    let hasBlockedMe = false;

    const currentUser = await User.findById(req.user._id).select('blockedUsers');
    const targetUser = await User.findById(req.params.userId).select('blockedUsers');
    
    const reqUserIdStr = req.user._id.toString();
    const targetUserIdStr = req.params.userId.toString();

    if (currentUser && currentUser.blockedUsers && currentUser.blockedUsers.map(id => id.toString()).includes(targetUserIdStr)) {
      isBlockedByMe = true;
    }
    if (targetUser && targetUser.blockedUsers && targetUser.blockedUsers.map(id => id.toString()).includes(reqUserIdStr)) {
      hasBlockedMe = true;
    }

    if (isBlockedByMe || hasBlockedMe) {
      return res.json({ success: true, messages: [], isBlockedByMe, hasBlockedMe });
    }

    const conversationId = Message.getConversationId(req.user._id, req.params.userId);
    const { page = 1, limit = 50 } = req.query;

    const messages = await Message.find({ conversationId, isDeleted: false })
      .populate('sender', 'name avatar')
      .populate('receiver', 'name avatar')
      .sort('-createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Mark messages as read
    await Message.updateMany(
      { conversationId, receiver: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/messages
// @desc    Send a message (also handled via Socket.io for real-time)
router.post('/', async (req, res) => {
  try {
    const { receiverId, content, type = 'text', jobRef, meetingRef } = req.body;

    if (!receiverId || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống' });
    }

    // Block check
    const isBlocked = await checkBidirectionalBlock(req.user._id, receiverId);
    if (isBlocked) {
      return res.status(403).json({ success: false, message: 'Không thể gửi tin nhắn cho người dùng này do cài đặt chặn' });
    }

    const conversationId = Message.getConversationId(req.user._id, receiverId);
    const message = await Message.create({
      conversationId,
      sender: req.user._id,
      receiver: receiverId,
      content: content.trim(),
      type,
      jobRef,
      meetingRef,
    });

    await message.populate([
      { path: 'sender', select: 'name avatar' },
      { path: 'receiver', select: 'name avatar' },
    ]);

    // Create notification (Database)
    const newNotif = await Notification.create({
      recipient: receiverId,
      sender: req.user._id,
      type: 'new_message',
      title: 'Tin nhắn mới',
      message: `${req.user.name}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
      link: `/messages?with=${req.user._id}`,
    });

    // Real-time broadcast via Socket.IO
    const io = req.app.get('io');
    if (io && io.sendMessageToUser) {
      io.sendMessageToUser(receiverId, message);
      if (io.pushNotificationToUser) {
         io.pushNotificationToUser(receiverId, newNotif);
      }
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;
