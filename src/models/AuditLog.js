const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'APPROVE_PORTFOLIO', 'REJECT_PORTFOLIO',
        'VERIFY_SKILL', 'GIVE_BADGE',
        'DELETE_JOB', 'EDIT_JOB',
        'BAN_USER', 'UNBAN_USER',
        'RESOLVE_REPORT', 'LOGIN',
        'OTHER'
      ]
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User' // Hoặc Job, Portfolio tùy action
    },
    targetModel: {
      type: String,
      enum: ['User', 'Job', 'Portfolio', 'None'],
      default: 'None'
    },
    details: {
      type: String,
      maxlength: 1000
    },
    ipAddress: {
      type: String
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('AuditLog', AuditLogSchema);
