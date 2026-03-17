const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function findData() {
  try {
    await mongoose.connect(MONGO_URI);

    const faker = await User.findOne({ name: /Faker/i });
    const t1Job = await Job.findOne({ title: /T1/i });

    if (!faker) console.log('User "Faker" not found.');
    else console.log('Faker Profile:', JSON.stringify(faker, null, 2));

    if (!t1Job) console.log('Job "T1" not found.');
    else console.log('T1 Job Details:', JSON.stringify(t1Job, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findData();
