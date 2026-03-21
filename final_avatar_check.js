const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const finalCheck = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    const huyen = await User.findOne({ email: 'huyen226900@hope.com' });
    const hung = await User.findOne({ email: 'hung226929@hope.com' });

    console.log('\n--- Final Admin Avatar Verification ---');
    if (huyen) console.log(`- Huyen: Name="${huyen.name}", Avatar="${huyen.avatar}"`);
    if (hung) console.log(`- Hung:  Name="${hung.name}", Avatar="${hung.avatar}"`);

    if (huyen && hung && huyen.avatar === hung.avatar) {
      console.log('\n✅ MATCH: Both avatars are identical!');
    } else {
      console.log('\n❌ MISMATCH: Avatars do not match.');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

finalCheck();
