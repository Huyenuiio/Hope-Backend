const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/linkedin_clone';

const seedAdmins = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected For Seeding...');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);

    const admins = [
      {
        name: 'Tô Văn Huyền 226900',
        email: 'huyen226900@hope.com',
        password: hashedPassword,
        role: 'superadmin',
        isVerified: true,
        verificationBadge: 'premium'
      },
      {
        name: 'Nguyễn Văn Hùng 226929',
        email: 'hung226929@hope.com',
        password: hashedPassword,
        role: 'superadmin',
        isVerified: true,
        verificationBadge: 'premium'
      },
      {
        name: 'Tuấn Đạt (Content Moderator)',
        email: 'moderator@hope.com',
        password: hashedPassword,
        role: 'moderator',
        isVerified: true
      },
      {
        name: 'Ngọc Mai (Conflict Support)',
        email: 'support@hope.com',
        password: hashedPassword,
        role: 'support',
        isVerified: true
      }
    ];

    for (const adminData of admins) {
      const existingAdmin = await User.findOne({ email: adminData.email });
      if (existingAdmin) {
        console.log(`User ${adminData.email} already exists. Skipping.`);
      } else {
        await User.create(adminData);
        console.log(`Created admin account: ${adminData.email} - Role: ${adminData.role}`);
      }
    }

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seedAdmins();
