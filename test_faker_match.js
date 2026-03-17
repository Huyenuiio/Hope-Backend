const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');
const { getRecommendedJobs } = require('./src/utils/matching');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function testFakerMatch() {
  try {
    await mongoose.connect(MONGO_URI);

    const faker = await User.findOne({ name: /Faker/i });
    if (!faker) {
      console.log('Faker not found');
      process.exit(1);
    }

    console.log(`--- MATCHING TEST FOR: ${faker.name} ---`);
    const recommendations = await getRecommendedJobs(faker._id);

    if (recommendations.length === 0) {
      console.log('No matches found.');
    } else {
      recommendations.forEach((rec, i) => {
        console.log(`Match #${i + 1}: ${rec.job.title} | Score: ${rec.score}%`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testFakerMatch();
