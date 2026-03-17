const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: [
        'new_message', 'new_application', 'application_status',
        'new_job_match', 'portfolio_approved', 'portfolio_rejected',
        'new_review', 'meeting_request', 'meeting_confirmed', 'meeting_cancelled',
        'connection_request', 'connection_accepted',
        'job_hired', 'job_closed', 'system',
        'job_reaction', 'job_comment', 'comment_reaction', 'comment_reply', 'reply_reaction'
      ],
      required: true,
    },
    title: { type: String, maxlength: 200 },
    message: { type: String, maxlength: 500 },
    link: { type: String }, // Frontend URL to navigate to
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    // References
    jobRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    applicationRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
    meetingRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
    reviewRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
