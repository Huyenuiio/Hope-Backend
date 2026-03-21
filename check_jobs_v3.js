const mongoose = require('mongoose');

const Job = require('./src/models/Job');

async function check() {
  try {
    const mongoUri = 'mongodb://localhost:27017/hope_db';
    console.log(`Connecting to ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const jobs = await Job.find({}).select('title');
    console.log('--- ALL JOB TITLES ---');
    if (jobs.length === 0) {
      console.log('No jobs found in database.');
    } else {
      jobs.forEach(j => console.log(`- ${j.title}`));
    }
    console.log('----------------------');

    process.exit(0);
  } catch (err) {
    console.error('Error during check:', err);
    process.exit(1);
  }
}

check();
