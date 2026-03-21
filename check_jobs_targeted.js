const mongoose = require('mongoose');
const Job = require('./src/models/Job');

async function check() {
  try {
    const mongoUri = 'mongodb+srv://huyencfvtc_db_user:ZX473clx2jFrH2fu@cluster0.qnchkmh.mongodb.net/hope-platform?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoUri);

    console.log('Searching for "lck" or "mid" in titles...');
    const jobs = await Job.find({
      $or: [
        { title: /lck/i },
        { title: /mid/i },
        { title: /thi đấu/i }
      ]
    }).select('title');

    if (jobs.length === 0) {
      console.log('No matching jobs found.');
    } else {
      jobs.forEach(j => console.log(`MATCH: ${j.title}`));
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
