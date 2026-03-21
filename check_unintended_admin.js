const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const checkUser = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    const email = 'vanhunghaha68@gmail.com';
    const user = await User.findOne({ email }).select('+password');

    if (user) {
      console.log('\n--- User Found ---');
      console.log('ID:', user._id);
      console.log('Name:', user.name);
      console.log('Email:', user.email);
      console.log('Role:', user.role);
      console.log('GoogleId:', user.googleId);
      console.log('isVerified:', user.isVerified);
      console.log('CreatedAt:', user.createdAt);
      console.log('UpdatedAt:', user.updatedAt);
    } else {
      console.log('\n❌ User not found:', email);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

checkUser();
