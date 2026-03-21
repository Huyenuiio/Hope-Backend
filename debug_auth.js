const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const debugAuth = async () => {
  try {
    if (!MONGO_URI) {
      console.error('MONGO_URI not found in .env!');
      process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('Connected to:', MONGO_URI.split('@')[1]); // Show cluster info only

    const emails = ['huyen226900@hope.com', 'hung226929@hope.com'];

    for (const email of emails) {
      const user = await User.findOne({ email }).select('+password');
      if (user) {
        console.log(`\n--- User Info: ${email} ---`);
        console.log('ID:', user._id);
        console.log('Name:', user.name);
        console.log('Role:', user.role);
        console.log('Is Banned:', user.isBanned);
        console.log('Has Password:', !!user.password);

        if (user.password) {
          const isMatch = await bcrypt.compare('Admin@123', user.password);
          console.log('Password Match ("Admin@123"):', isMatch ? '✅ YES' : '❌ NO');
        }
      } else {
        console.log(`\n❌ User NOT FOUND: ${email}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

debugAuth();
