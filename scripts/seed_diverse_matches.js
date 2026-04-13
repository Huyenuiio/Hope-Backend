const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../src/models/User');
const Job = require('../src/models/Job');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/linkedin_clone';

async function seedDiverse() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for Seeding Diverse matches...');

    // 1. Clients
    const clientA = await User.findOne({ name: 'Mr. Boss' });
    const clientB = await User.findOne({ name: 'Test Client' }) || clientA;

    // 2. Designers
    const designer = await User.findOneAndUpdate(
      { email: 'designer@test.com' },
      {
        name: 'Alex Design',
        email: 'designer@test.com',
        password: 'password123',
        role: 'freelancer',
        niche: ['design'],
        subNiche: ['Logo / Branding'],
        expertiseLevel: 'senior',
        skills: ['Adobe Illustrator', 'Photoshop', 'Brand Guideline'],
        isActive: true
      },
      { upsert: true, new: true }
    );

    // 3. Marketers
    const marketer = await User.findOneAndUpdate(
      { email: 'marketer@test.com' },
      {
        name: 'Maria Market',
        email: 'marketer@test.com',
        password: 'password123',
        role: 'freelancer',
        niche: ['marketing'],
        subNiche: ['SEO'],
        expertiseLevel: 'expert',
        skills: ['Google Analytics', 'Ahrefs', 'Keyword Research'],
        isActive: true
      },
      { upsert: true, new: true }
    );

    // 4. Finance
    const accountant = await User.findOneAndUpdate(
      { email: 'finance@test.com' },
      {
        name: 'Mr. Accountant',
        email: 'finance@test.com',
        password: 'password123',
        role: 'freelancer',
        niche: ['finance'],
        subNiche: ['Kế toán thuế'],
        expertiseLevel: 'senior',
        skills: ['MISA', 'Tax Reporting', 'Financial Audit'],
        isActive: true
      },
      { upsert: true, new: true }
    );

    // 5. Jobs
    const jobs = [
      {
        title: 'Cần thiết kế Logo cho StarUp',
        description: 'Thiết kế logo và bộ nhận diện thương hiệu',
        niche: ['design'],
        subNiche: ['Logo / Branding'],
        expertiseLevel: 'senior',
        requiredSkills: ['Adobe Illustrator', 'Typography'],
        budget: { min: 2000000, max: 5000000, type: 'fixed', currency: 'VND' },
        client: clientA._id,
        isApproved: true,
        status: 'open'
      },
      {
        title: 'Tuyển chuyên gia SEO đẩy Web Top 1',
        description: 'Audit website và nghiên cứu từ khóa',
        niche: ['marketing'],
        subNiche: ['SEO'],
        expertiseLevel: 'expert',
        requiredSkills: ['Google Analytics', 'SEO Automation'],
        budget: { min: 5000000, max: 10000000, type: 'monthly', currency: 'VND' },
        client: clientB._id,
        isApproved: true,
        status: 'open'
      },
      {
        title: 'Dịch vụ Kế toán Thuế trọn gói',
        description: 'Làm báo cáo thuế quý và năm',
        niche: ['finance'],
        subNiche: ['Kế toán thuế'],
        expertiseLevel: 'senior',
        requiredSkills: ['Tax Reporting', 'Excel'],
        budget: { min: 3000000, max: 7000000, type: 'fixed', currency: 'VND' },
        client: clientA._id,
        isApproved: true,
        status: 'open'
      }
    ];

    await Job.insertMany(jobs);
    console.log('Seeded 3 diverse users and 3 industry-specific jobs.');

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seedDiverse();
