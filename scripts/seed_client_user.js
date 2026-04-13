const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, select: false },
  role: String,
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', UserSchema);

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const hashedPassword = await bcrypt.hash('password123', 10);

    await User.findOneAndUpdate(
      { email: 'client1@gmail.com' },
      {
        name: 'Test Client',
        email: 'client1@gmail.com',
        password: hashedPassword,
        role: 'client',
        isActive: true
      },
      { upsert: true, new: true }
    );

    console.log('Client user seeded: client1@gmail.com / password123');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
