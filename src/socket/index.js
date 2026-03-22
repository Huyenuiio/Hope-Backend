const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');

// Map to track online users: { userId → socketId }
const onlineUsers = new Map();

module.exports = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

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

    console.log(`🟢 Socket connected: ${socket.user.name} (${userId})`);

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

    socket.on('call:initiate', (data) => {
      const { receiverId, streamId, callerName, callerAvatar, signal } = data;
      const receiverSocketId = onlineUsers.get(receiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('call:incoming', {
          callerId: userId,
          callerName: callerName || socket.user.name,
          callerAvatar: callerAvatar || socket.user.avatar,
          streamId,
          signal
        });
      }
    });

    socket.on('call:respond', ({ callerId, accepted }) => {
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

    socket.on('call:end', ({ targetId }) => {
      const targetSocketId = onlineUsers.get(targetId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call:ended', { fromId: userId });
      }
    });

    // ── DISCONNECT ──────────────────────────────────────

    socket.on('disconnect', () => {
      // Delay offline status trong vòng 3s để xử lý tình trạng F5 refresh trang web
      setTimeout(() => {
        // Chỉ xóa nếu socketId lưu trữ trong Map chưa bị người dùng lật ngược lên (Reconnect)
        if (onlineUsers.get(userId) === socket.id) {
          onlineUsers.delete(userId);
          socket.broadcast.emit('user:offline', { userId });
          console.log(`🔴 Socket disconnected: ${socket.user.name}`);
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
