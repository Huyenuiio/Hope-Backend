/**
 * Enhanced Matching algorithm: Weighted Similarity (simulating Content-Based ML)
 * Based on: Industry overlap (Niche), Sub-Niche precision, Skills, Tools, Level & Experience.
 */

const User = require('../models/User');
const Job = require('../models/Job');

// Weight constants
const WEIGHTS = {
  MAIN_NICHE: 30,    // Foundational relevance
  SUB_NICHE: 20,     // Specific professional specialization
  SKILLS: 15,        // Technical capability
  LANGUAGES: 15,     // Foreign language proficiency
  EXPERTISE: 15,     // Junior/Senior level matching
  TOOLS: 5,          // Utility familiarity
};

/**
 * Score a professional (freelancer) against a job
 * Returns 0-100 score
 */
const scoreFreelancer = (freelancer, job) => {
  let score = 0;

  // 1. MAIN NICHE (The Foundation)
  const commonNiches = job.niche?.filter((n) => freelancer.niche?.includes(n)) || [];
  if (commonNiches.length === 0) return 0; // Hard Block
  // Full points if at least one niche matches the foundation
  score += WEIGHTS.MAIN_NICHE;

  // 2. SUB-NICHE PRECISION
  const subNicheOverlap = job.subNiche?.filter((sn) => freelancer.subNiche?.includes(sn)) || [];
  score += Math.min(subNicheOverlap.length * 10, WEIGHTS.SUB_NICHE);

  // 3. SKILLS MATCH
  const skillOverlap = job.requiredSkills?.filter((s) =>
    freelancer.skills?.some((fs) => fs.toLowerCase().includes(s.toLowerCase()))
  ) || [];
  const skillRatio = job.requiredSkills?.length > 0 ? skillOverlap.length / job.requiredSkills.length : 1;
  score += Math.round(skillRatio * WEIGHTS.SKILLS);

  // 4. LANGUAGES MATCH (New)
  if (job.requiredLanguages && job.requiredLanguages.length > 0) {
    let langMatchCount = 0;
    job.requiredLanguages.forEach(reqLang => {
      const userLang = freelancer.languages?.find(l => l.name === reqLang.name);
      if (userLang) {
        // Proficiency check (approximate)
        if (userLang.level === reqLang.level || userLang.level === 'Native') {
          langMatchCount += 1;
        } else {
          langMatchCount += 0.5; // Partial match if name exists but level differs
        }
      }
    });
    const langRatio = langMatchCount / job.requiredLanguages.length;
    score += Math.round(langRatio * WEIGHTS.LANGUAGES);
  } else {
    // If no language required, candidate gets full points for this section
    score += WEIGHTS.LANGUAGES;
  }

  // 5. EXPERTISE LEVEL & YEARS
  const levels = ['intern', 'junior', 'middle', 'senior', 'expert'];
  const fLevelIdx = levels.indexOf(freelancer.expertiseLevel || 'junior');
  const jLevelIdx = levels.indexOf(job.expertiseLevel || 'junior');

  if (fLevelIdx >= jLevelIdx) {
    score += WEIGHTS.EXPERTISE;
  } else if (fLevelIdx === jLevelIdx - 1) {
    score += Math.round(WEIGHTS.EXPERTISE * 0.5);
  }

  // 6. TOOLS MATCH
  const toolOverlap = job.requiredTools?.filter((t) => freelancer.tools?.includes(t)) || [];
  const toolRatio = job.requiredTools?.length > 0 ? toolOverlap.length / job.requiredTools.length : 1;
  score += Math.round(toolRatio * WEIGHTS.TOOLS);

  return Math.min(Math.round(score), 100);
};

/**
 * Get top matching freelancers for a job (Top Talent Suggestion)
 */
exports.getMatchingFreelancers = async (jobId, limit = 10) => {
  const job = await Job.findById(jobId);
  if (!job) return [];

  const freelancers = await User.find({
    role: 'freelancer',
    isActive: true,
    isBanned: false,
    niche: { $in: job.niche || [] }, // Optimization: Only fetch same industry talents
  }).select('name avatar niche subNiche skills tools rating availability expertiseLevel yearsOfExperience');

  const scored = freelancers
    .map((f) => ({ user: f, score: scoreFreelancer(f, job) }))
    .filter((f) => f.score >= 30) // Only recommend people with >30% match
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
};

/**
 * Get recommended jobs for a freelancer (The AI Feed)
 */
exports.getRecommendedJobs = async (freelancerId, limit = 10) => {
  const freelancer = await User.findById(freelancerId);
  if (!freelancer) return [];

  // Data Quality check: If user has no niche, we can't recommend well
  if (!freelancer.niche || freelancer.niche.length === 0) return [];

  // 1. Fetch Candidate Pool (Up to 200 newest jobs in the same industry)
  // We fetch minimal data first to save memory on free tiers
  const jobs = await Job.find({
    status: 'open',
    isApproved: true,
    hiredFreelancer: null,
    niche: { $in: freelancer.niche },
    client: { $nin: freelancer.blockedUsers || [] }
  })
    .select('title description niche subNiche requiredSkills requiredTools englishRequired expertiseLevel budget client createdAt')
    .sort({ createdAt: -1 })
    .limit(200); // Analyzing the top 200 most recent industry matches

  // 2. Score and Filter in Node.js
  const scored = jobs
    .map((job) => ({
      job,
      score: scoreFreelancer(freelancer, job),
    }))
    .filter((j) => j.score >= 25) // Accuracy threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // 3. Final Population (Only for the TOP matches to save resources)
  const finalResults = await Promise.all(
    scored.map(async (item) => {
      const fullJob = await Job.findById(item.job._id)
        .populate('client', 'name avatar company rating')
        .populate({ path: 'comments.user', select: 'name avatar' })
        .populate({ path: 'comments.replies.user', select: 'name avatar' });
      return { ...item, job: fullJob };
    })
  );

  return finalResults;
};
