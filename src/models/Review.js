const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 150 },
    comment: { type: String, required: true, maxlength: 1000 },
    // Detailed ratings
    scores: {
      communication: { type: Number, min: 1, max: 5 },
      quality: { type: Number, min: 1, max: 5 },
      timeliness: { type: Number, min: 1, max: 5 },
      professionalism: { type: Number, min: 1, max: 5 },
    },
    // Moderation
    isApproved: { type: Boolean, default: true },
    isFlagged: { type: Boolean, default: false },
    flagReason: { type: String },
    isHidden: { type: Boolean, default: false },

    // Response from reviewee
    response: { type: String, maxlength: 500 },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

// One review per job per pair
ReviewSchema.index({ reviewer: 1, reviewee: 1, job: 1 }, { unique: true, sparse: true });
ReviewSchema.index({ reviewee: 1, isApproved: 1 });

module.exports = mongoose.model('Review', ReviewSchema);
