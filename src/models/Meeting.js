const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    title: { type: String, maxlength: 200, default: 'Cuộc họp trao đổi công việc' },
    description: { type: String, maxlength: 500 },
    scheduledAt: { type: Date, required: true },
    duration: { type: Number, default: 30 }, // minutes
    platform: {
      type: String,
      enum: ['zoom', 'google-meet', 'teams', 'phone', 'other'],
      default: 'google-meet',
    },
    meetingLink: { type: String },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no-show'],
      default: 'pending',
    },
    timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    notes: { type: String, maxlength: 1000 },
    // Admin can intervene in disputes
    hasDispute: { type: Boolean, default: false },
    disputeNote: { type: String },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

MeetingSchema.index({ organizer: 1, scheduledAt: 1 });
MeetingSchema.index({ participant: 1, scheduledAt: 1 });
MeetingSchema.index({ status: 1 });

module.exports = mongoose.model('Meeting', MeetingSchema);
