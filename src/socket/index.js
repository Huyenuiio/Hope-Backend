const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const redisClient = require('../config/redis');
const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');

// Map to track online users: { userId → socketId }
const onlineUsers = new Map();
// Tracking active calls: userId -> { targetId, status: 'ringing'|'active', isCaller: boolean, startTime: Date }
const activeCalls = new Map();

module.exports = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

  if (redisClient) {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅  Socket.IO Redis Adapter configured.');
  }

  // Auth middleware for socket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) return next(new Error('Không có token xác thực'));

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('name avatar');
      if (!user) return next(new Error('Token không hợp lệ'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Xác thực thất bại'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    onlineUsers.set(userId, socket.id);

    // Broadcast online status to others
    socket.broadcast.emit('user:online', { userId, name: socket.user.name });

    // Gửi danh sách online hien tai cho user mới kết nối
    socket.emit('onlineUsers:list', Array.from(onlineUsers.keys()));

    // ── MESSAGING ──────────────────────────────────────

    socket.on('message:send', async (data) => {
      const { receiverId, content, type = 'text', jobRef, meetingRef } = data;
      if (!receiverId || !content?.trim()) return;

      try {
        const conversationId = Message.getConversationId(userId, receiverId);
        const message = await Message.create({
          conversationId,
          sender: socket.user._id,
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

        // Send to receiver if online
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('message:received', message);
        }

        // Confirm to sender
        socket.emit('message:sent', message);

        // Create notification if receiver is offline
        if (!receiverSocketId) {
          await Notification.create({
            recipient: receiverId,
            sender: socket.user._id,
            type: 'new_message',
            title: 'Tin nhắn mới',
            message: `${socket.user.name}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
            link: `/messages/${userId}`,
          });
        }
      } catch (err) {
        socket.emit('error', { message: 'Không gửi được tin nhắn' });
      }
    });

    // ── TYPING INDICATOR ───────────────────────────────

    socket.on('typing:start', ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing:start', { userId, name: socket.user.name });
      }
    });

    socket.on('typing:stop', ({ receiverId }) => {
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing:stop', { userId });
      }
    });

    // ── NOTIFICATIONS ──────────────────────────────────

    // Send real-time notification helper
    socket.pushNotification = async (recipientId, notification) => {
      const recipientSocketId = onlineUsers.get(recipientId.toString());
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('notification:new', notification);
      }
    };

    // ── READ RECEIPTS ──────────────────────────────────

    socket.on('message:read', async ({ conversationId }) => {
      try {
        await Message.updateMany(
          { conversationId, receiver: socket.user._id, isRead: false },
          { isRead: true, readAt: new Date() }
        );
        // Notify sender that messages were read
        socket.broadcast.emit('message:read_ack', { conversationId, readBy: userId });
      } catch (err) {
        console.error('Read receipt error:', err.message);
      }
    });

    // ── VIDEO CALL SIGNALING ──────────────────────────

    // Helper to log call events to chat
    const logCallToChat = async (callerId, receiverId, status) => {
      try {
        const conversationId = Message.getConversationId(callerId, receiverId);
        let content = '';
        if (status === 'completed') content = 'Bạn đã thực hiện một cuộc gọi';
        else if (status === 'missed') content = 'Cuộc gọi nhỡ';
        else if (status === 'declined') content = 'Kết thúc cuộc gọi';

        const message = await Message.create({
          conversationId,
          sender: callerId,
          receiver: receiverId,
          content,
          type: 'video_call',
        });

        // Populate so frontend has name/avatar for the "Người dùng" fallback
        await message.populate([
          { path: 'sender', select: 'name avatar' },
          { path: 'receiver', select: 'name avatar' },
        ]);

        // Notify both if online
        [callerId, receiverId].forEach(id => {
          const sId = onlineUsers.get(id.toString());
          if (sId) io.to(sId).emit('message:received', message);
        });

        // Add notification for missed call
        if (status === 'missed') {
          await Notification.create({
            recipient: receiverId,
            sender: callerId,
            type: 'video_call',
            title: 'Cuộc gọi nhỡ',
            message: `Bạn có cuộc gọi nhỡ từ ${socket.user.name}`,
            link: `/messages/${callerId}`,
          });
          const rSocketId = onlineUsers.get(receiverId.toString());
          if (rSocketId) io.to(rSocketId).emit('notification:new', { type: 'video_call', title: 'Cuộc gọi nhỡ' });
        }
      } catch (err) {
        console.error('Lỗi lưu log cuộc gọi:', err);
      }
    };

    socket.on('call:initiate', async (data) => {
      const { receiverId, streamId, callerName, callerAvatar, signal } = data;

      try {
        // 1. Check Friendship
        const targetUser = await User.findById(receiverId);
        const currentUser = await User.findById(userId);

        if (!targetUser || !currentUser.connections.some(c => c.toString() === receiverId)) {
          return socket.emit('call:error', { message: 'Bạn chỉ có thể gọi cho người đã kết bạn.' });
        }

        // 2. Check if Busy
        if (activeCalls.has(receiverId)) {
          return socket.emit('call:busy', { receiverId });
        }

        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          // Track call
          activeCalls.set(userId, { targetId: receiverId, status: 'ringing', isCaller: true });
          activeCalls.set(receiverId, { targetId: userId, status: 'ringing', isCaller: false });

          io.to(receiverSocketId).emit('call:incoming', {
            callerId: userId,
            callerName: callerName || socket.user.name,
            callerAvatar: callerAvatar || socket.user.avatar,
            streamId,
            signal
          });
        } else {
          socket.emit('call:error', { message: 'Người dùng hiện không trực tuyến.' });
        }
      } catch (err) {
        socket.emit('call:error', { message: 'Có lỗi xảy ra khi bắt đầu cuộc gọi.' });
      }
    });

    socket.on('call:respond', async ({ callerId, accepted }) => {
      const call = activeCalls.get(userId);
      if (!call) return;

      if (accepted) {
        call.status = 'active';
        call.startTime = new Date();
        const callerCall = activeCalls.get(callerId);
        if (callerCall) {
          callerCall.status = 'active';
          callerCall.startTime = new Date();
        }
      } else {
        // Declined
        await logCallToChat(callerId, userId, 'declined');
        activeCalls.delete(userId);
        activeCalls.delete(callerId);
      }

      const callerSocketId = onlineUsers.get(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:answered', { accepted, receiverId: userId });
      }
    });

    socket.on('webrtc:signal', ({ targetId, signal }) => {
      const targetSocketId = onlineUsers.get(targetId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc:signal', { senderId: userId, signal });
      }
    });

    socket.on('call:end', async ({ targetId }) => {
      const call = activeCalls.get(userId);
      if (call) {
        const status = call.status;
        const callerId = call.isCaller ? userId : targetId;
        const receiverId = call.isCaller ? targetId : userId;

        if (status === 'active') {
          await logCallToChat(callerId, receiverId, 'completed');
        } else if (status === 'ringing') {
          // If caller ended before pickup
          if (call.isCaller) await logCallToChat(callerId, receiverId, 'missed');
          // If receiver ended (handled in call:respond but safety check here)
          else await logCallToChat(callerId, receiverId, 'declined');
        }

        activeCalls.delete(userId);
        activeCalls.delete(targetId);
      }

      const targetSocketId = onlineUsers.get(targetId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call:ended', { fromId: userId });
      }
    });

    // ── DISCONNECT ──────────────────────────────────────

    socket.on('disconnect', () => {
      // Cleanup active calls if the user disconnects during a call
      const call = activeCalls.get(userId);
      if (call) {
        const targetId = call.targetId;
        const targetSocketId = onlineUsers.get(targetId.toString());
        if (targetSocketId) {
          io.to(targetSocketId).emit('call:ended', { fromId: userId });
        }

        // Logic to log based on status at disconnect
        const callerId = call.isCaller ? userId : targetId;
        const receiverId = call.isCaller ? targetId : userId;

        if (call.status === 'active') {
          logCallToChat(callerId, receiverId, 'completed');
        } else if (call.status === 'ringing' && call.isCaller) {
          logCallToChat(callerId, receiverId, 'missed');
        }

        activeCalls.delete(userId);
        activeCalls.delete(targetId.toString());
      }

      // Delay offline status trong vòng 3s để xử lý tình trạng F5 refresh trang web
      setTimeout(() => {
        // Chỉ xóa nếu socketId lưu trữ trong Map chưa bị người dùng lật ngược lên (Reconnect)
        if (onlineUsers.get(userId) === socket.id) {
          onlineUsers.delete(userId);
          socket.broadcast.emit('user:offline', { userId });
        }
      }, 3000);
    });
  });

  // Helper exportable for routes to push notifications
  io.pushNotificationToUser = (userId, notification) => {
    const socketId = onlineUsers.get(userId.toString());
    if (socketId) io.to(socketId).emit('notification:new', notification);
  };

  io.sendMessageToUser = (userId, message) => {
    const socketId = onlineUsers.get(userId.toString());
    if (socketId) io.to(socketId).emit('message:received', message);
  };

  io.getOnlineUsers = () => Array.from(onlineUsers.keys());

  return io;
};
