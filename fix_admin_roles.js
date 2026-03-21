const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const fixRoles = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const emails = ['huyen226900@hope.com', 'hung226929@hope.com'];

    for (const email of emails) {
      const result = await User.updateOne(
        { email },
        {
          role: 'superadmin',
          isVerified: true,
          verificationBadge: 'premium'
        }
      );
      if (result.matchedCount > 0) {
        console.log(`✅ Fixed role for: ${email}`);
      } else {
        console.log(`❌ User not found: ${email}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

fixRoles();
