const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const Job = require('./src/models/Job');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hope_db');
    console.log('Connected to MongoDB');

    const jobs = await Job.find({}).select('title');
    console.log('All Job Titles:');
    jobs.forEach(j => console.log(`- ${j.title}`));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
