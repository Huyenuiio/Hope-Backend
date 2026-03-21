const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const syncAvatars = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    // 1. Get avatar from Hung
    const hung = await User.findOne({ email: 'hung226929@hope.com' });
    if (!hung) {
      console.log('❌ Could not find user: hung226929@hope.com');
      process.exit(1);
    }

    const avatarUrl = hung.avatar;
    console.log(`✅ Found avatar for Hung: ${avatarUrl}`);

    // 2. Update Huyen's avatar
    const huyenResult = await User.updateOne(
      { email: 'huyen226900@hope.com' },
      { avatar: avatarUrl }
    );

    if (huyenResult.matchedCount > 0) {
      console.log(`✅ Updated avatar for Huyen: TO MATCH ${avatarUrl}`);
    } else {
      console.log('❌ Could not find user: huyen226900@hope.com');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

syncAvatars();
