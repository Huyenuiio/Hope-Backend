const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');

const seedUser = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const email = 'dev1@gmail.com';
    const password = 'password123';

    let user = await User.findOne({ email });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user) {
      user.password = hashedPassword;
      // Ensure role is freelancer for dashboard test
      user.role = 'freelancer';
      await user.save();
      console.log('User dev1@gmail.com updated with password123');
    } else {
      user = await User.create({
        name: 'Dev Test User',
        email,
        password: hashedPassword,
        role: 'freelancer',
        isVerified: true
      });
      console.log('User dev1@gmail.com created with password123');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedUser();
