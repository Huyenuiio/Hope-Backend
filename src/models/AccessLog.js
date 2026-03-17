const mongoose = require('mongoose');

const AccessLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    method: { type: String, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] },
    path: { type: String },
    statusCode: { type: Number },
    responseTime: { type: Number }, // ms
    ip: { type: String },
    userAgent: { type: String },
    country: { type: String },
    city: { type: String },
    // Security classification
    threat: {
      type: String,
      enum: ['none', 'suspicious', 'sqli-attempt', 'xss-attempt', 'brute-force', 'scan', 'blocked'],
      default: 'none',
    },
    threatDetails: { type: String },
    // For admin panel security monitor
    isFlagged: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String },
    // Request body summary (sanitized - no passwords)
    requestSummary: { type: String, maxlength: 500 },
  },
  {
    timestamps: true,
    // Auto-delete logs after 90 days
    expireAfterSeconds: 60 * 60 * 24 * 90,
  }
);

// Detect potential threats from path/query
AccessLogSchema.statics.detectThreat = function (path, query, body) {
  const payload = JSON.stringify({ path, query, body }).toLowerCase();
  if (/(\bselect\b|\binsert\b|\bdrop\b|\bunion\b|\bdelete\b.*\bfrom\b)/i.test(payload)) {
    return { threat: 'sqli-attempt', details: 'SQL pattern detected' };
  }
  if (/<script|javascript:|on\w+=/i.test(payload)) {
    return { threat: 'xss-attempt', details: 'XSS pattern detected' };
  }
  if (/nmap|nikto|sqlmap|burpsuite|metasploit/i.test(payload)) {
    return { threat: 'scan', details: 'Security tool user-agent' };
  }
  return { threat: 'none', details: null };
};

AccessLogSchema.index({ createdAt: -1 });
AccessLogSchema.index({ ip: 1 });
AccessLogSchema.index({ threat: 1, isFlagged: 1 });
AccessLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('AccessLog', AccessLogSchema);
