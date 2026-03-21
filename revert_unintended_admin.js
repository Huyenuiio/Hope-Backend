const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const revertRole = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    const email = 'vanhunghaha68@gmail.com';
    const result = await User.updateOne(
      { email },
      { role: 'freelancer' }
    );

    if (result.matchedCount > 0) {
      console.log(`✅ Reverted role for: ${email} to 'freelancer'`);
    } else {
      console.log(`❌ User not found: ${email}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

revertRole();
