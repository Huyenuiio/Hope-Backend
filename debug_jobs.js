const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function findJobs() {
  try {
    await mongoose.connect(MONGO_URI);

    // Search for any jobs in esports niche
    const jobs = await Job.find({ niche: /esports/i });
    console.log(`Found ${jobs.length} jobs in esports niche.`);
    jobs.forEach(j => {
      console.log(`ID: ${j._id} | Title: ${j.title} | Niche: ${j.niche}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findJobs();
