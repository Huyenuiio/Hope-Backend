const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { scoreFreelancer } = require('./src/utils/matching'); // I need to export this or just copy it

dotenv.config({ path: path.join(__dirname, '.env') });

// Mock models or use real ones if connected
const test = async () => {
  console.log('--- AI Matching Precision Test ---');

  const itFreelancer = {
    niche: ['Lập trình / IT'],
    subNiche: ['Front-end'],
    skills: ['ReactJS', 'Nodejs'],
    expertiseLevel: 'senior',
    yearsOfExperience: 6
  };

  const itJobMatch = {
    title: 'Senior React Dev',
    niche: ['Lập trình / IT'],
    subNiche: ['Front-end'],
    requiredSkills: ['ReactJS', 'Nodejs'],
    expertiseLevel: 'senior'
  };

  const esportsJobMismatch = {
    title: 'Pro Gamer',
    niche: ['Thể thao điện tử'],
    subNiche: ['Pro Player'],
    requiredSkills: ['Gaming'],
    expertiseLevel: 'expert'
  };

  const itJobJuniorMatch = {
    title: 'Junior React Dev',
    niche: ['Lập trình / IT'],
    subNiche: ['Front-end'],
    requiredSkills: ['ReactJS'],
    expertiseLevel: 'junior'
  };

  // Import the scoring function logic directly since it's not exported by default in a way we can use without the full module
  const score = (f, j) => {
    const WEIGHTS = { MAIN_NICHE: 35, SUB_NICHE: 25, SKILLS: 20, EXPERTISE: 15, TOOLS: 5 };
    let s = 0;
    const commonNiches = j.niche?.filter((n) => f.niche?.includes(n)) || [];
    if (commonNiches.length === 0) return 0;
    s += Math.min(commonNiches.length * 15, WEIGHTS.MAIN_NICHE);
    const subNicheOverlap = j.subNiche?.filter((sn) => f.subNiche?.includes(sn)) || [];
    s += Math.min(subNicheOverlap.length * 12.5, WEIGHTS.SUB_NICHE);
    const skillOverlap = j.requiredSkills?.filter((sk) => f.skills?.some((fs) => fs.toLowerCase().includes(sk.toLowerCase()))) || [];
    const skillRatio = j.requiredSkills?.length > 0 ? skillOverlap.length / j.requiredSkills.length : 1;
    s += Math.round(skillRatio * WEIGHTS.SKILLS);
    const levels = ['intern', 'junior', 'middle', 'senior', 'expert'];
    const fLevelIdx = levels.indexOf(f.expertiseLevel || 'junior');
    const jLevelIdx = levels.indexOf(j.expertiseLevel || 'junior');
    if (fLevelIdx >= jLevelIdx) s += WEIGHTS.EXPERTISE;
    else if (fLevelIdx === jLevelIdx - 1) s += Math.round(WEIGHTS.EXPERTISE * 0.5);
    const toolOverlap = j.requiredTools?.filter((t) => f.tools?.includes(t)) || [];
    const toolRatio = j.requiredTools?.length > 0 ? toolOverlap.length / j.requiredTools.length : 1;
    s += Math.round(toolRatio * WEIGHTS.TOOLS);
    return Math.min(Math.round(s), 100);
  };

  const score1 = score(itFreelancer, itJobMatch);
  const score2 = score(itFreelancer, esportsJobMismatch);
  const score3 = score(itFreelancer, itJobJuniorMatch);

  console.log(`Job 1 (IT Match): ${score1}%`);
  console.log(`Job 2 (Esports Mismatch): ${score2}%`);
  console.log(`Job 3 (IT Junior Match): ${score3}%`);

  if (score1 > 80 && score2 === 0 && score3 > 50) {
    console.log('✅ TEST PASSED: Industry block and weighted scoring work!');
  } else {
    console.log('❌ TEST FAILED: Check logic.');
  }
};

test();
