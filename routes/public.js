const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');
const { scoreCandidate } = require('../services/aiService');

// Rate limit: 3 submissions per IP per hour
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many applications from this IP, please try again later' },
});

// Multer for resume
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/public/form/:slug
router.get('/form/:slug', async (req, res, next) => {
  try {
    const job = await Job.findOne({ publicFormSlug: req.params.slug, status: 'open' })
      .select('title department description requiredSkills deadline companyId')
      .lean();
    if (!job) return res.status(404).json({ error: 'Job not found or no longer accepting applications' });

    if (job.deadline && new Date(job.deadline) < new Date()) {
      return res.status(410).json({ error: 'Application deadline has passed' });
    }

    res.json({ job });
  } catch (err) { next(err); }
});

// POST /api/public/apply/:slug
router.post('/apply/:slug', applyLimiter, upload.single('resume'), async (req, res, next) => {
  try {
    const job = await Job.findOne({ publicFormSlug: req.params.slug, status: 'open' }).lean();
    if (!job) return res.status(404).json({ error: 'Job not found or closed' });
    if (job.deadline && new Date(job.deadline) < new Date()) {
      return res.status(410).json({ error: 'Application deadline has passed' });
    }

    const { name, email, phone, experience, skills, linkedinUrl, portfolioUrl, coverNote } = req.body;
    if (!name || !email || !experience) {
      return res.status(400).json({ error: 'Name, email and experience are required' });
    }

    const parsedSkills = typeof skills === 'string' ? JSON.parse(skills) : skills || [];

    let resumeText = '';
    let resumeUrl = '';
    if (req.file) {
      resumeUrl = `/uploads/${req.file.filename}`;
      try {
        const pdfParse = require('pdf-parse');
        const buf = fs.readFileSync(req.file.path);
        const parsed = await pdfParse(buf);
        resumeText = parsed.text;
      } catch (_) { /* optional */ }
    }

    // Check for existing application
    const existing = await Candidate.findOne({ email: email.toLowerCase(), jobId: job._id });
    if (existing) return res.status(409).json({ error: 'You have already applied for this position' });

    const candidate = await Candidate.create({
      companyId: job.companyId,
      jobId: job._id,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || '',
      experience: Number(experience),
      skills: parsedSkills,
      resumeText,
      resumeUrl,
      linkedinUrl: linkedinUrl || '',
      portfolioUrl: portfolioUrl || '',
      coverNote: coverNote || '',
      source: 'form',
      stage: 'applied',
      stageHistory: [{ stage: 'applied', enteredAt: new Date() }],
    });

    await Job.findByIdAndUpdate(job._id, { $inc: { totalApplicants: 1 } });

    // Trigger AI scoring in background (non-blocking)
    setImmediate(async () => {
      try {
        const result = await scoreCandidate(candidate, job, []);
        const newStage = result.matchScore >= 60 ? 'screening' : 'rejected';
        
        await Candidate.findByIdAndUpdate(candidate._id, {
          $set: {
            matchScore: result.matchScore,
            aiSummary: result.summary,
            aiStrengths: result.strengths || [],
            aiGaps: result.gaps || [],
            ghostRisk: result.ghostRisk || 'low',
            teamFitScore: result.teamFitScore ?? null,
            teamFitReason: result.teamFitReason || '',
            stage: newStage
          },
          $push: { stageHistory: { stage: newStage, enteredAt: new Date() } }
        });
      } catch (_) { /* silent fail */ }
    });

    res.status(201).json({
      message: 'Application submitted successfully! We will be in touch.',
      candidateId: candidate._id,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already used for this position' });
    next(err);
  }
});

module.exports = router;
