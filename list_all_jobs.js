const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function listAllJobs() {
  try {
    await mongoose.connect(MONGO_URI);

    const jobs = await Job.find({}).populate('client', 'name company');
    console.log(`--- TOTAL JOBS: ${jobs.length} ---`);
    jobs.forEach(j => {
      console.log(`ID: ${j._id} | Title: ${j.title} | Niche: ${j.niche} | Client: ${j.client?.name || j.client?.company || 'N/A'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

listAllJobs();
