const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const { getRecommendedJobs } = require('./src/utils/matching');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function verifyAllNiches() {
  try {
    await mongoose.connect(MONGO_URI);

    const users = await User.find({ email: { $in: ['designer@test.com', 'marketer@test.com', 'finance@test.com'] } });

    for (const user of users) {
      console.log(`\n--- MATCHING TEST FOR: ${user.name} (${user.niche[0]} - ${user.subNiche[0]}) ---`);
      const recommendations = await getRecommendedJobs(user._id);

      if (recommendations.length === 0) {
        console.log('No matches found.');
      } else {
        recommendations.forEach((rec, i) => {
          console.log(`Match #${i + 1}: ${rec.job.title} | Score: ${rec.score}% | Match-Reason: ${rec.job.niche[0]}/${rec.job.subNiche[0]}`);
        });
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

verifyAllNiches();
