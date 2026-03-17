const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Job = require('./src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function getJob() {
  try {
    await mongoose.connect(MONGO_URI);
    const job = await Job.findById('69afdfb4354c61da0e701cd4');
    console.log('T1 Job Details:', JSON.stringify(job, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

getJob();
