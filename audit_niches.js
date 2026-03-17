const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function auditNiches() {
  try {
    await mongoose.connect(MONGO_URI);

    console.log('--- USER NICHES ---');
    const users = await User.find({}).select('name niche');
    users.forEach(u => console.log(`${u.name}: ${JSON.stringify(u.niche)}`));

    console.log('\n--- JOB NICHES ---');
    const jobs = await Job.find({}).select('title niche');
    jobs.forEach(j => console.log(`${j.title}: ${JSON.stringify(j.niche)}`));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

auditNiches();
