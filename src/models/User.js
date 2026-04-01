const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ'],
    },
    password: { type: String, select: false }, // Cho Admin login
    avatar: { type: String, default: '' },
    role: {
      type: String,
      enum: ['freelancer', 'client', 'superadmin', 'moderator', 'support'],
      default: 'freelancer',
    },
    isEmailVerified: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false }, // Blue tick
    verificationBadge: { type: String, enum: ['none', 'verified', 'top-rated', 'premium'], default: 'none' },
    isActive: { type: Boolean, default: true },
    isBanned: { type: Boolean, default: false },

    // ── Freelancer Fields ──────────────────────────────
    niche: [{ type: String }],
    subNiche: [{ type: String }], // Ngách chuyên sâu (Vd: Copywriter -> Ads)
    headline: { type: String, maxlength: 150 }, // Hook / Khẩu hiệu
    skills: [{ type: String, trim: true, maxlength: 50 }],
    tools: [{ type: String }], // Công cụ thành thạo (AI, Software...)

    bio: { type: String, maxlength: 1000 },

    // ── Value Proposition & Discovery ──────────────────
    problemsSolved: { type: String, maxlength: 500 }, // Nỗi đau khách hàng
    workAttitude: { type: String, maxlength: 1000 }, // Thái độ / Phương pháp làm việc

    // ── Experience & Expertise (ML matching) ─────────
    yearsOfExperience: { type: Number, min: 0, default: 0 },
    expertiseLevel: {
      type: String,
      enum: ['intern', 'junior', 'middle', 'senior', 'expert'],
      default: 'junior',
    },
    careerGoals: { type: String, maxlength: 1000 }, // Mục tiêu 5 năm
    coreBeliefs: { type: String, maxlength: 1000 }, // Khám phá nội tâm (Mindset)
    nicheSpecificData: { type: mongoose.Schema.Types.Mixed }, // Lưu mảng dữ liệu tự do theo từng Form mẫu (vd: "Chữ/ngày", "Programming Languages")

    // ── Pricing & Availability ─────────────────────────
    hourlyRate: { type: Number, min: 0 },
    projectRate: { type: Number, min: 0 }, // Giá theo dự án
    availability: {
      type: String,
      enum: ['full-time', 'part-time', 'weekends', 'flexible', 'unavailable'],
    },

    // ── Universal Portfolio ────────────────────────────
    languages: [{
      name: { type: String, required: true }, // Vd: English, Japanese
      level: { type: String, required: true }, // Vd: N1, Fluent, IELTS 8.0
      certificate: { type: String }, // Tên chứng chỉ
    }],
    englishLevel: {
      type: String,
      enum: ['basic', 'conversational', 'fluent', 'native'],
    },
    equipment: {
      software: [{ type: String, maxlength: 500 }],
      hardware: [{ type: String, maxlength: 500 }],
    },
    caseStudies: [{
      title: { type: String, maxlength: 200 },
      description: { type: String, maxlength: 1000 },
      result: { type: String, maxlength: 500 }, // "Tăng 5000 followers"
      link: { type: String },
    }],
    completedJobs: { type: Number, default: 0 },
    responseTime: { type: String, default: 'Within 24 hours' },

    // ── Client Fields ──────────────────────────────────
    company: { type: String, maxlength: 200 },
    industry: { type: String, maxlength: 100 },
    website: { type: String },
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '500+'],
    },
    clientInfo: {
      problem: { type: String, maxlength: 1000 },
      expectedResult: { type: String, maxlength: 1000 },
      paymentType: { type: String, enum: ['hourly', 'fixed'] },
      budgetRange: { type: String, maxlength: 100 },
      projectType: { type: String, enum: ['one-time', 'ongoing'] },
      duration: { type: String, maxlength: 100 },
      updateFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'] },
      meetingWillingness: { type: Boolean, default: false },
    },

    // ── Stats ──────────────────────────────────────────
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    profileViews: { type: Number, default: 0 },
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    connectionRequests: [{
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
      createdAt: { type: Date, default: Date.now },
    }],

    // ── Social / Profile ───────────────────────────────
    location: { type: String, maxlength: 100 },
    linkedin: { type: String },
    github: { type: String },

    // ── Saved Items ────────────────────────────────────
    savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],

    // ── Interaction History ─────────────────────────────
    socialHistory: [{
      type: {
        type: String,
        enum: [
          'like', 'love', 'care', 'haha', 'wow', 'sad', 'angry',
          'comment', 'share', 'send', 'comment_reaction',
          'comment_reply', 'reply_reaction', 'reply'
        ]
      },
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
      jobTitle: String,
      text: String, // For comments
      image: String, // NEW: For images in comments/replies
      reactionType: String, // like, love, etc.
      createdAt: { type: Date, default: Date.now }
    }],

    // ── Security ───────────────────────────────────────
    lastLogin: { type: Date },
    lastLoginIP: { type: String },
    loginCount: { type: Number, default: 0 },
    twoFactorEnabled: { type: Boolean, default: false },

    // ── Moderation ─────────────────────────────────────
    banUntil: { type: Date },
    isPermanentlyBanned: { type: Boolean, default: false },
    banReason: { type: String },
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: full profile URL
UserSchema.virtual('profileUrl').get(function () {
  return `/profile/${this._id}`;
});

// Index for search performance (email & googleId đã có unique index từ field definition)
UserSchema.index({ role: 1, isActive: 1, rating: -1 });
UserSchema.index({ role: 1, niche: 1, isActive: 1, rating: -1 });
UserSchema.index({ role: 1, skills: 1, isActive: 1, rating: -1 });
UserSchema.index({ name: 1 });
UserSchema.index({ rating: -1 });


// Method to get public profile (exclude sensitive fields)
UserSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.googleId;
  delete obj.password;
  delete obj.lastLoginIP;
  delete obj.loginCount;
  delete obj.connectionRequests;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
