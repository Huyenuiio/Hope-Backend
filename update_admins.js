const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/linkedin_clone';

const updateAdmins = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected...');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);

    // 1. Update existing Superadmin (Hoài Nam -> Tô Văn Huyền 226900)
    const originalEmail = 'superadmin@hope.com';
    const updatedAdmin = await User.findOneAndUpdate(
      { email: originalEmail },
      { 
        name: 'Tô Văn Huyền 226900',
        email: 'huyen226900@hope.com'
      },
      { new: true }
    );

    if (updatedAdmin) {
      console.log(`✅ Updated account: ${originalEmail} -> huyen226900@hope.com (Tô Văn Huyền 226900)`);
    } else {
      console.log(`❌ Could not find account with email: ${originalEmail}`);
    }

    // 2. Create new Superadmin (Nguyễn Văn Hùng 226929)
    const newAdminEmail = 'hung226929@hope.com';
    const existingNewAdmin = await User.findOne({ email: newAdminEmail });
    
    if (existingNewAdmin) {
      console.log(`ℹ️ Account ${newAdminEmail} already exists. Skipping creation.`);
    } else {
      await User.create({
        name: 'Nguyễn Văn Hùng 226929',
        email: newAdminEmail,
        password: hashedPassword,
        role: 'superadmin',
        isVerified: true,
        verificationBadge: 'premium'
      });
      console.log(`✅ Created new superadmin: ${newAdminEmail} (Nguyễn Văn Hùng 226929)`);
    }

    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

updateAdmins();
