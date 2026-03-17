const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    coverLetter: { type: String, maxlength: 2000 },
    proposedRate: { type: Number },
    estimatedDuration: { type: String },
    portfolioItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio' }],
    status: {
      type: String,
      enum: ['pending', 'viewed', 'shortlisted', 'rejected', 'hired'],
      default: 'pending',
    },
    clientNote: { type: String, maxlength: 500 },
    isWithdrawn: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ApplicationSchema.index({ job: 1, freelancer: 1 }, { unique: true });
ApplicationSchema.index({ freelancer: 1 });

module.exports = mongoose.model('Application', ApplicationSchema);
