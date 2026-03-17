const mongoose = require('mongoose');

const PortfolioSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    niche: { type: String },
    mediaType: { type: String, enum: ['video', 'image', 'link', 'file'], default: 'link' },
    mediaUrl: { type: String, required: true }, // YouTube link, Google Drive, etc.
    thumbnailUrl: { type: String },
    tools: [String],

    // Case Study fields
    caseStudy: {
      problem: { type: String, maxlength: 500 },
      solution: { type: String, maxlength: 500 },
      result: { type: String, maxlength: 500 }, // "Tăng 5000 followers"
      metrics: [{
        label: String, // "Followers gained"
        value: String, // "5,000"
      }],
    },

    // Moderation
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    isFeatured: { type: Boolean, default: false },
    rejectionReason: { type: String },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },

    // Engagement
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

PortfolioSchema.index({ user: 1, status: 1 });
PortfolioSchema.index({ niche: 1, status: 1 });

module.exports = mongoose.model('Portfolio', PortfolioSchema);
