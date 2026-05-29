const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Company = require('../models/Company');
const User = require('../models/User');
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');

const seed = async () => {
  try {
    // ── 1. Company ──
    let company = await Company.findOne({ slug: 'hireiq-demo' });
    if (!company) {
      company = await Company.create({
        name: 'HireIQ Demo Co.',
        slug: 'hireiq-demo',
        plan: 'pro',
        teamSkills: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
      });
      console.log('🏢 Company seeded');
    }

    // ── 2. Admin User ──
    let admin = await User.findOne({ email: 'admin@hireiq.app' });
    if (!admin) {
      admin = await User.create({
        name: 'Admin User',
        email: 'admin@hireiq.app',
        password: 'HireIQ@2024',
        role: 'admin',
        companyId: company._id,
        status: 'active',
      });
      console.log('👤 Admin seeded: admin@hireiq.app / HireIQ@2024');
    }

    // ── 3. Demo Job ──
    let job = await Job.findOne({ companyId: company._id });
    if (!job) {
      job = await Job.create({
        companyId: company._id,
        createdBy: admin._id,
        title: 'Senior Frontend Engineer',
        department: 'Engineering',
        description: 'We are looking for a senior frontend engineer to lead our React-based dashboard platform.',
        requiredSkills: ['React', 'TypeScript', 'Node.js'],
        niceToHaveSkills: ['GraphQL', 'Docker', 'AWS'],
        minExperience: 3,
        status: 'open',
        publicFormSlug: 'senior-frontend-engineer',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        totalApplicants: 5,
      });
      console.log('💼 Job seeded');
    }

    // ── 4. Candidates ──
    const count = await Candidate.countDocuments({ companyId: company._id });
    if (count === 0) {
      const now = new Date();
      const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000);

      await Candidate.insertMany([
        {
          companyId: company._id,
          jobId: job._id,
          name: 'Priya Sharma',
          email: 'priya@example.com',
          phone: '+91-9876543210',
          experience: 3,
          skills: ['React', 'TypeScript', 'Node.js', 'MongoDB'],
          coverNote: 'Passionate about building scalable frontends.',
          matchScore: 88,
          aiSummary: 'Strong full-stack match with direct experience in required stack.',
          aiStrengths: ['React', 'TypeScript', 'Node.js'],
          aiGaps: ['GraphQL'],
          stage: 'interview',
          ghostRisk: 'low',
          source: 'form',
          savedToShortlist: true,
          createdAt: daysAgo(12),
          stageHistory: [
            { stage: 'applied', enteredAt: daysAgo(12), exitedAt: daysAgo(10) },
            { stage: 'screening', enteredAt: daysAgo(10), exitedAt: daysAgo(7) },
            { stage: 'interview', enteredAt: daysAgo(7) },
          ],
        },
        {
          companyId: company._id,
          jobId: job._id,
          name: 'Rohan Mehta',
          email: 'rohan@example.com',
          phone: '+91-9123456789',
          experience: 5,
          skills: ['Python', 'Django', 'PostgreSQL', 'AWS'],
          coverNote: 'Backend engineer looking to pivot to full-stack roles.',
          matchScore: 74,
          aiSummary: 'Solid backend skills but lacks frontend React experience.',
          aiStrengths: ['AWS', 'PostgreSQL'],
          aiGaps: ['React', 'TypeScript'],
          stage: 'screening',
          ghostRisk: 'medium',
          source: 'manual',
          createdAt: daysAgo(18),
          stageHistory: [
            { stage: 'applied', enteredAt: daysAgo(18), exitedAt: daysAgo(15) },
            { stage: 'screening', enteredAt: daysAgo(15) },
          ],
        },
        {
          companyId: company._id,
          jobId: job._id,
          name: 'Anjali Verma',
          email: 'anjali@example.com',
          experience: 1,
          skills: ['HTML', 'CSS', 'JavaScript', 'Vue'],
          coverNote: 'Junior developer eager to grow.',
          matchScore: 51,
          aiSummary: 'Too junior for this role; missing core required skills.',
          aiStrengths: ['JavaScript'],
          aiGaps: ['React', 'TypeScript', 'Node.js'],
          stage: 'applied',
          ghostRisk: 'low',
          source: 'form',
          createdAt: daysAgo(5),
          stageHistory: [{ stage: 'applied', enteredAt: daysAgo(5) }],
        },
        {
          companyId: company._id,
          jobId: job._id,
          name: 'Karan Singh',
          email: 'karan@example.com',
          phone: '+91-9988776655',
          experience: 7,
          skills: ['React', 'GraphQL', 'Docker', 'Kubernetes', 'TypeScript'],
          coverNote: 'Senior engineer with 7 years of full-stack experience.',
          matchScore: 95,
          aiSummary: 'Exceptional match — exceeds all requirements with bonus skills.',
          aiStrengths: ['React', 'GraphQL', 'Docker', 'TypeScript'],
          aiGaps: [],
          stage: 'offer',
          ghostRisk: 'low',
          source: 'manual',
          savedToShortlist: true,
          createdAt: daysAgo(25),
          stageHistory: [
            { stage: 'applied', enteredAt: daysAgo(25), exitedAt: daysAgo(22) },
            { stage: 'screening', enteredAt: daysAgo(22), exitedAt: daysAgo(18) },
            { stage: 'interview', enteredAt: daysAgo(18), exitedAt: daysAgo(10) },
            { stage: 'offer', enteredAt: daysAgo(10) },
          ],
        },
        {
          companyId: company._id,
          jobId: job._id,
          name: 'Sneha Patel',
          email: 'sneha@example.com',
          experience: 2,
          skills: ['React Native', 'Firebase', 'JavaScript'],
          coverNote: 'Mobile developer with some React experience.',
          matchScore: 63,
          aiSummary: 'Mobile focus with React Native experience partially overlaps requirements.',
          aiStrengths: ['JavaScript', 'React Native ≈ React'],
          aiGaps: ['TypeScript', 'Node.js'],
          stage: 'applied',
          ghostRisk: 'high',
          source: 'form',
          createdAt: daysAgo(3),
          stageHistory: [{ stage: 'applied', enteredAt: daysAgo(3) }],
        },
      ]);
      console.log('🌱 5 candidates seeded');
    }

    console.log('✅ Seed complete');
  } catch (err) {
    console.error('❌ Seed error:', err.message);
  }
};

module.exports = seed;
