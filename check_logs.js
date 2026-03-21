const mongoose = require('mongoose');
const AccessLog = require('./src/models/AccessLog');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const checkLogs = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    // Find logs related to role changes or admin access
    const logs = await AccessLog.find({
      $or: [
        { path: /role/ },
        { path: /admin/ },
        { email: 'vanhunghaha68@gmail.com' }
      ]
    })
      .sort('-createdAt')
      .limit(50);

    console.log('\n--- Recent Relevant Logs ---');
    logs.forEach(l => {
      console.log(`[${l.createdAt.toISOString()}] ${l.method} ${l.path} - IP: ${l.ip} - User: ${l.user || 'Guest'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

checkLogs();
