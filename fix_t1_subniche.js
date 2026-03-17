const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Job = require('./src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function fixJobSubNiche() {
  try {
    await mongoose.connect(MONGO_URI);
    const job = await Job.findById('69afdfb4354c61da0e701cd4');
    if (job) {
      job.subNiche = ['Pro Player'];
      await job.save();
      console.log('Updated T1 Job with subNiche: ["Pro Player"]');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixJobSubNiche();
