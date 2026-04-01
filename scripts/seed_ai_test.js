const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Job = require('./src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function seedTestData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding AI Match test data...');

    // Clear existing test data
    await User.deleteMany({ email: { $in: ['gamer@test.com', 'dev@test.com', 'editor@test.com', 'boss@test.com'] } });
    await Job.deleteMany({ title: { $regex: /Test AI/ } });

    // 1. Create a Client/Employer
    const client = await User.create({
      name: 'Mr. Boss',
      email: 'boss@test.com',
      password: 'password123',
      role: 'client',
      company: 'Testing Corp',
      isActive: true
    });

    // 2. Create Diverse Freelancer Profiles
    const gamer = await User.create({
      name: 'Pro Gamer Xuan Tai',
      email: 'gamer@test.com',
      password: 'password123',
      role: 'freelancer',
      niche: ['esports'],
      subNiche: ['Pro Player', 'Coach (Huấn luyện viên)'],
      skills: ['Micro-management', 'Call-team', 'Macro'],
      expertiseLevel: 'expert',
      languages: [{ name: 'Tiếng Anh', level: 'Conversational' }, { name: 'Tiếng Nhật', level: 'N2' }],
      isActive: true
    });

    const developer = await User.create({
      name: 'Senior Dev Minh',
      email: 'dev@test.com',
      password: 'password123',
      role: 'freelancer',
      niche: ['dev'],
      subNiche: ['Full-stack', 'Back-end'],
      skills: ['ReactJS', 'Node.js', 'MongoDB'],
      expertiseLevel: 'senior',
      languages: [{ name: 'Tiếng Anh', level: 'IELTS 7.5' }],
      isActive: true
    });

    const editor = await User.create({
      name: 'Media Editor Linh',
      email: 'editor@test.com',
      password: 'password123',
      role: 'freelancer',
      niche: ['video'],
      subNiche: ['Talking Head', 'Reels/Shorts'],
      skills: ['Premiere Pro', 'After Effects', 'Color Grading'],
      expertiseLevel: 'middle',
      languages: [{ name: 'Tiếng Anh', level: 'Basic' }],
      isActive: true
    });

    // 3. Create Diverse Jobs
    await Job.create([
      {
        title: 'Test AI: Cần Pro Player thi đấu giải VCS',
        description: 'Yêu cầu kỹ năng call-team tốt và trình độ Cao Thủ trở lên.',
        niche: ['esports'],
        requiredSkills: ['Call-team', 'Macro'],
        expertiseLevel: 'expert',
        requiredLanguages: [{ name: 'Tiếng Nhật', level: 'N2' }],
        client: client._id,
        status: 'open',
        isApproved: true
      },
      {
        title: 'Test AI: Tuyển Node.js Back-end Senior',
        description: 'Xây dựng hệ thống Microservices quy mô lớn.',
        niche: ['dev'],
        requiredSkills: ['Node.js', 'MongoDB'],
        expertiseLevel: 'senior',
        requiredLanguages: [{ name: 'Tiếng Anh', level: 'IELTS 7.5' }],
        client: client._id,
        status: 'open',
        isApproved: true
      },
      {
        title: 'Test AI: Editor video ngắn cho Youtube',
        description: 'Dựng video 60s, tone màu hiện đại.',
        niche: ['video'],
        requiredSkills: ['Premiere Pro'],
        expertiseLevel: 'middle',
        client: client._id,
        status: 'open',
        isApproved: true
      }
    ]);

    console.log('Seeding samples completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seedTestData();
