const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true }, // sorted userId1_userId2
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 5000 },
    type: { type: String, enum: ['text', 'image', 'file', 'job-offer', 'meeting-invite', 'job-share', 'video_call'], default: 'text' },
    attachment: {
      url: String,
      name: String,
      size: Number,
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    // For job offers sent via message
    jobRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    meetingRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
  },
  { timestamps: true }
);

// Generate conversation ID (sorted to ensure consistency between 2 users)
MessageSchema.statics.getConversationId = function (userId1, userId2) {
  return [userId1.toString(), userId2.toString()].sort().join('_');
};

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ sender: 1, receiver: 1 });
MessageSchema.index({ isRead: 1 });

module.exports = mongoose.model('Message', MessageSchema);
