const mongoose = require('mongoose');

const Job = require('./src/models/Job');

async function check() {
  try {
    const mongoUri = 'mongodb+srv://huyencfvtc_db_user:ZX473clx2jFrH2fu@cluster0.qnchkmh.mongodb.net/hope-platform?retryWrites=true&w=majority&appName=Cluster0';
    console.log('Connecting to Cloud MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    const jobs = await Job.find({}).select('title');
    console.log('--- ALL JOB TITLES ---');
    if (jobs.length === 0) {
      console.log('No jobs found.');
    } else {
      jobs.forEach(j => console.log(`- ${j.title}`));
    }
    console.log('----------------------');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
