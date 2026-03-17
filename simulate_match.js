const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');
const { getRecommendedJobs } = require('./src/utils/matching');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function testMatching() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('--- AI MATCHING TEST RESULTS ---\n');

    const testers = await User.find({ email: { $in: ['gamer@test.com', 'dev@test.com', 'editor@test.com'] } });

    for (const user of testers) {
      console.log(`User: ${user.name} (Niche: ${user.niche[0]})`);
      const recommendations = await getRecommendedJobs(user._id);

      if (recommendations.length === 0) {
        console.log('  [!] No matches found (Score below 25 or Niche mismatch)');
      } else {
        recommendations.forEach((rec, i) => {
          console.log(`  Match #${i + 1}: ${rec.job.title}`);
          console.log(`  Score: ${rec.score}%`);
          console.log(`  Reason: ${rec.score >= 80 ? 'Perfect Fit' : rec.score >= 50 ? 'Good Fit' : 'Fair Fit'}`);
        });
      }
      console.log('--------------------------------');
    }

    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

testMatching();
