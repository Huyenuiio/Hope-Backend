const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../src/models/User');
const Job = require('../src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

const NICHE_MAP = {
  'Viết lách / Nội dung': 'writing',
  'Viết lách / Copywriter': 'writing',
  'Thiết kế / Sáng tạo': 'design',
  'Video Editor / Media': 'video',
  'Lập trình / IT': 'dev',
  'Digital Marketing': 'marketing',
  'Thể thao điện tử': 'esports',
  'Tài chính / Kế toán': 'finance',
  'Giáo dục / Gia sư': 'education',
  'Bán hàng / Kinh doanh': 'sales',
  'Y tế / Sức khỏe': 'health',
  'Làm đẹp / Thời trang': 'beauty',
  'Nhiếp ảnh / Film': 'photography',
  'Biên phiên dịch': 'translation',
  'Sự kiện / Ẩm thực': 'event',
  'Trợ lý ảo / Admin': 'va',
  'Pháp lý / Tư vấn': 'legal',
  'Khác': 'other'
};

async function globalMigrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for Global Migration...');

    // 1. Migrate Jobs
    const jobs = await Job.find({});
    let jobUpdates = 0;
    for (const job of jobs) {
      if (job.niche && job.niche.length > 0) {
        const newNiches = [...new Set(job.niche.map(n => NICHE_MAP[n] || n))];
        if (JSON.stringify(newNiches) !== JSON.stringify(job.niche)) {
          job.niche = newNiches;
          await job.save();
          jobUpdates++;
        }
      }
    }
    console.log(`Migrated ${jobUpdates} jobs to standardized Niche IDs.`);

    // 2. Migrate Users
    const users = await User.find({});
    let userUpdates = 0;
    for (const user of users) {
      if (user.niche && user.niche.length > 0) {
        const newNiches = [...new Set(user.niche.map(n => NICHE_MAP[n] || n))];
        if (JSON.stringify(newNiches) !== JSON.stringify(user.niche)) {
          user.niche = newNiches;
          await user.save();
          userUpdates++;
        }
      }
    }
    console.log(`Migrated ${userUpdates} users to standardized Niche IDs.`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

globalMigrate();
