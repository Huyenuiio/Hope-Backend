const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const listAdmins = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    const admins = await User.find({ role: 'superadmin' });

    console.log(`\nFound ${admins.length} Superadmins:`);
    admins.forEach(a => {
      console.log(`- ${a.name} (${a.email}) - Created: ${a.createdAt}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

listAdmins();
