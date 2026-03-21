const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const updateAvatars = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    // Update both superadmins
    const result = await User.updateMany(
      { email: { $in: ['huyen226900@hope.com', 'hung226929@hope.com'] } },
      { avatar: '/admin-avatar.png' }
    );

    console.log(`✅ Updated ${result.modifiedCount} superadmin avatars to '/admin-avatar.png'`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

updateAvatars();
