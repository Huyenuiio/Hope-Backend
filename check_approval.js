const mongoose = require('mongoose');
const Job = require('./src/models/Job');

async function check() {
  try {
    const mongoUri = 'mongodb+srv://huyencfvtc_db_user:ZX473clx2jFrH2fu@cluster0.qnchkmh.mongodb.net/hope-platform?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoUri);

    const jobs = await Job.find({ title: /lck/i }).select('title isApproved status');
    console.log('Results:');
    jobs.forEach(j => console.log(`- Title: ${j.title}, Approved: ${j.isApproved}, Status: ${j.status}`));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
