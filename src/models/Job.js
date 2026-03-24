const mongoose = require('mongoose');

// Spam/scam keywords filter
const FLAGGED_KEYWORDS = [
  'lừa đảo', 'đa cấp', 'mlm', 'ponzi', 'free money',
  'việc nhàn tiền nhiều', 'tuyển cộng tác viên online',
  'không cần kinh nghiệm lương cao', 'make money fast',
];

const JobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    niche: [{ type: String }],
    subNiche: [{ type: String }],
    requiredSkills: [{ type: String, trim: true }],
    requiredTools: [String],
    budget: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, default: 'USD' },
      type: { type: String, enum: ['fixed', 'hourly', 'monthly'], default: 'fixed' },
    },
    deadline: { type: Date },
    duration: {
      type: String,
      enum: ['less-than-week', '1-4-weeks', '1-3-months', '3-6-months', 'ongoing'],
    },
    requiredLanguages: [{
      name: { type: String }, // Vd: English, Japanese
      level: { type: String }, // Vd: N1, Fluent
    }],
    englishRequired: {
      type: String,
      enum: ['none', 'basic', 'conversational', 'fluent'],
      default: 'none',
    },
    workType: { type: String, enum: ['remote', 'onsite', 'hybrid'], default: 'remote' },
    expertiseLevel: {
      type: String,
      enum: ['intern', 'junior', 'middle', 'senior', 'expert'],
      default: 'junior',
    },
    yearsOfExperienceRequired: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'open', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
    },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hiredFreelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Moderation
    isApproved: { type: Boolean, default: false },
    isFlagged: { type: Boolean, default: false },
    flaggedKeywords: [String],
    flagReason: { type: String },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },

    // Stats
    views: { type: Number, default: 0 },
    applicantCount: { type: Number, default: 0 },
    reactions: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      type: { type: String, enum: ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'], default: 'like' }
    }],
    comments: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      text: { type: String, maxlength: 1000 },
      image: { type: String },
      reactions: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, enum: ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'], default: 'like' }
      }],
      mention: {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String }
      },
      replies: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, maxlength: 1000 },
        image: { type: String },
        reactions: [{
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          type: { type: String, enum: ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'], default: 'like' }
        }],
        mention: {
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          name: { type: String }
        },
        createdAt: { type: Date, default: Date.now }
      }],
      createdAt: { type: Date, default: Date.now }
    }],
    shares: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }],
    sends: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }],

    // Tags
    tags: [String],
    isPromoted: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Auto-detect flagged keywords before save
JobSchema.pre('save', function () {
  const content = `${this.title} ${this.description}`.toLowerCase();
  const found = FLAGGED_KEYWORDS.filter((kw) => content.includes(kw.toLowerCase()));
  if (found.length > 0) {
    this.isFlagged = true;
    this.flaggedKeywords = found;
    this.status = 'pending'; // Force admin review
  }
});

JobSchema.index({ status: 1, isApproved: 1, createdAt: -1 });
JobSchema.index({ niche: 1, status: 1, createdAt: -1 });
JobSchema.index({ requiredSkills: 1, status: 1, createdAt: -1 });
JobSchema.index({ client: 1, createdAt: -1 });
JobSchema.index({ createdAt: -1 });
JobSchema.index({ 'budget.min': 1, 'budget.max': 1 });

// Text Index for full-text search
JobSchema.index({ title: 'text', description: 'text', tags: 'text' }, { weights: { title: 10, tags: 5, description: 1 } });

module.exports = mongoose.model('Job', JobSchema);
