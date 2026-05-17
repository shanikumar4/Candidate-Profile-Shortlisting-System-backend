require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const Candidate = require('./models/Candidate');

const app = express();

// Connect to MongoDB Atlas
connectDB().then(async () => {
  const count = await Candidate.countDocuments();
  if (count === 0) {
    const seedCandidates = [
      { name: "Priya Mehta",   email: "priya@example.com",  skills: ["React", "Node.js", "AWS", "TypeScript"], experience: 3, bio: "Senior full-stack engineer with production-scale SaaS experience." },
      { name: "Rahul Sharma",  email: "rahul@example.com",  skills: ["React", "Node.js", "MongoDB"],           experience: 2, bio: "Built 3 MERN stack apps. Comfortable with REST APIs and state management." },
      { name: "Ankit Verma",   email: "ankit@example.com",  skills: ["HTML", "CSS", "JavaScript"],             experience: 1, bio: "Frontend developer, primarily builds landing pages and marketing sites." },
      { name: "Sara Kapoor",   email: "sara@example.com",   skills: ["React", "Redux", "Firebase", "Figma"],   experience: 2, bio: "Frontend-focused engineer with strong UI/UX sensibility and design skills." },
      { name: "Dev Patel",     email: "dev@example.com",    skills: ["Python", "Django", "PostgreSQL", "Docker"], experience: 4, bio: "Backend-heavy engineer. No JavaScript framework experience." }
    ];
    await Candidate.insertMany(seedCandidates);
    console.log('🌱 Seed data inserted into MongoDB');
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/match', require('./routes/match'));
app.use('/api/ai', require('./routes/ai'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'MongoDB Atlas' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
