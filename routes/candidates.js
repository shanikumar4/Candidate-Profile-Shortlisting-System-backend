const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const Company = require('../models/Company');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { scoreCandidate, generateInterviewQuestions, generateEmailTemplate, explainScore } = require('../services/aiService');

// Multer setup for resume uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── GET /api/candidates ──
router.get('/', auth, async (req, res, next) => {
  try {
    const { jobId, stage, ghostRisk, search, sort = '-matchScore -createdAt', shortlisted, page = 1, limit = 50 } = req.query;
    const query = { companyId: req.user.companyId };

    if (req.user.role === 'manager') {
      const allowedJobs = await Job.find({ companyId: req.user.companyId, department: req.user.department }).select('_id').lean();
      const allowedJobIds = allowedJobs.map(j => j._id);
      if (jobId && !allowedJobIds.some(id => id.toString() === jobId)) {
        return res.status(403).json({ error: 'Access denied to this job\'s candidates' });
      }
      if (!jobId) query.jobId = { $in: allowedJobIds };
      else query.jobId = jobId;
    } else {
      if (jobId) query.jobId = jobId;
    }
    if (stage) query.stage = stage;
    if (ghostRisk) query.ghostRisk = ghostRisk;
    if (shortlisted === 'true') query.savedToShortlist = true;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { skills: { $elemMatch: { $regex: search, $options: 'i' } } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [candidates, total] = await Promise.all([
      Candidate.find(query).sort(sort).skip(skip).limit(Number(limit)).lean(),
      Candidate.countDocuments(query),
    ]);

    res.json({ candidates, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
});

// ── POST /api/candidates ── (manual add)
router.post('/', auth, upload.single('resume'), async (req, res, next) => {
  try {
    const { name, email, phone, experience, skills, linkedinUrl, portfolioUrl, coverNote, jobId } = req.body;
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
      } catch (_) { /* pdf-parse optional */ }
    }

    const candidate = await Candidate.create({
      companyId: req.user.companyId,
      jobId: jobId || undefined,
      name, email, phone, experience: Number(experience),
      skills: parsedSkills,
      resumeText, resumeUrl,
      linkedinUrl, portfolioUrl, coverNote,
      source: 'manual',
    });

    if (jobId) await Job.findByIdAndUpdate(jobId, { $inc: { totalApplicants: 1 } });

    res.status(201).json({ candidate });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Candidate email already exists' });
    next(err);
  }
});

// ── GET /api/candidates/export ── (CSV)
router.get('/export', auth, async (req, res, next) => {
  try {
    const { jobId, stage } = req.query;
    const query = { companyId: req.user.companyId };
    if (jobId) query.jobId = jobId;
    if (stage) query.stage = stage;

    const candidates = await Candidate.find(query).lean();
    const header = 'Name,Email,Phone,Experience,Skills,Stage,MatchScore,GhostRisk,Shortlisted\n';
    const rows = candidates.map(c =>
      `"${c.name}","${c.email}","${c.phone || ''}",${c.experience},"${c.skills.join('; ')}","${c.stage}",${c.matchScore || ''},"${c.ghostRisk}","${c.savedToShortlist}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=candidates.csv');
    res.send(header + rows);
  } catch (err) { next(err); }
});

// ── GET /api/candidates/:id ──
router.get('/:id', auth, async (req, res, next) => {
  try {
    const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId })
      .populate('jobId', 'title requiredSkills niceToHaveSkills minExperience department')
      .lean();
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    if (req.user.role === 'manager') {
      const job = candidate.jobId;
      if (job && job.department !== req.user.department) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({ candidate });
  } catch (err) { next(err); }
});

// ── PATCH /api/candidates/:id ──
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['stage', 'savedToShortlist', 'ghostRisk', 'jobId'];
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    const existing = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId }).populate('jobId');
    if (!existing) return res.status(404).json({ error: 'Candidate not found' });

    if (req.user.role === 'manager') {
      const job = existing.jobId;
      if (job && job.department !== req.user.department) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Track stage history
    if (update.stage && update.stage !== existing.stage) {
      const now = new Date();
      const lastEntry = existing.stageHistory[existing.stageHistory.length - 1];
      if (lastEntry && !lastEntry.exitedAt) lastEntry.exitedAt = now;
      existing.stageHistory.push({ stage: update.stage, enteredAt: now });

      // Automatically sync savedToShortlist flag with the new stage
      if (['screening', 'interview', 'offer', 'hired'].includes(update.stage)) {
        update.savedToShortlist = true;
      } else if (update.stage === 'rejected' || update.stage === 'applied') {
        update.savedToShortlist = false;
      }

      // Module 18: compute candidate experience score on hired/rejected
      if (update.stage === 'hired' || update.stage === 'rejected') {
        const totalDays = Math.round((now - existing.createdAt) / (1000 * 60 * 60 * 24));
        const expScore = Math.max(0, Math.round(100 - (totalDays - 7) * 3));
        existing.candidateExpScore = Math.min(100, expScore);
      }
    }

    Object.assign(existing, update);
    await existing.save();
    res.json({ candidate: existing });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/:id/note ──
router.post('/:id/note', auth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Note text required' });
    const candidate = await Candidate.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { $push: { notes: { author: req.user.name, text, createdAt: new Date() } } },
      { new: true }
    );
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    res.json({ notes: candidate.notes });
  } catch (err) { next(err); }
});

// ── DELETE /api/candidates/:id ──
router.delete('/:id', auth, role('admin', 'manager'), async (req, res, next) => {
  try {
    const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId }).populate('jobId');
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    if (req.user.role === 'manager') {
      const job = candidate.jobId;
      if (job && job.department !== req.user.department) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    await Candidate.deleteOne({ _id: req.params.id });
    if (candidate.jobId) await Job.findByIdAndUpdate(candidate.jobId, { $inc: { totalApplicants: -1 } });
    res.json({ message: 'Candidate deleted' });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/:id/score ──  (Module 1 AI Scoring)
router.post('/:id/score', auth, async (req, res, next) => {
  try {
    const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const job = candidate.jobId
      ? await Job.findById(candidate.jobId).lean()
      : await Job.findOne({ companyId: req.user.companyId }).lean();
    if (!job) return res.status(400).json({ error: 'No job found to score against' });

    const company = await Company.findById(req.user.companyId).lean();
    const teamSkills = company?.teamSkills || [];

    const result = await scoreCandidate(candidate, job, teamSkills);

    candidate.matchScore = result.matchScore;
    candidate.aiSummary = result.summary;
    candidate.aiStrengths = result.strengths || [];
    candidate.aiGaps = result.gaps || [];
    candidate.ghostRisk = result.ghostRisk || 'low';
    candidate.teamFitScore = result.teamFitScore ?? null;
    candidate.teamFitReason = result.teamFitReason || '';
    if (result.inferredMatches?.length) {
      candidate.aiFlags = result.inferredMatches;
    }
    
    const newStage = result.matchScore >= 60 ? 'screening' : 'rejected';
    
    if (candidate.stage !== newStage) {
      candidate.stage = newStage;
      candidate.stageHistory.push({ stage: newStage, enteredAt: new Date() });
      candidate.savedToShortlist = (newStage === 'screening');
    }
    
    await candidate.save();

    res.json({ candidate });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/bulk-score ──
router.post('/bulk-score', auth, async (req, res, next) => {
  try {
    const { jobId } = req.body;
    const query = { companyId: req.user.companyId, matchScore: null };
    if (jobId) query.jobId = jobId;

    const candidates = await Candidate.find(query).lean();
    if (!candidates.length) return res.json({ message: 'No unscored candidates', scored: 0 });

    const job = jobId
      ? await Job.findById(jobId).lean()
      : await Job.findOne({ companyId: req.user.companyId }).lean();
    if (!job) return res.status(400).json({ error: 'No job found' });

    const company = await Company.findById(req.user.companyId).lean();
    const teamSkills = company?.teamSkills || [];

    let scored = 0;
    for (const c of candidates) {
      try {
        const result = await scoreCandidate(c, job, teamSkills);
        const newStage = result.matchScore >= 60 ? 'screening' : 'rejected';
        
        let updateQuery = {
          $set: {
            matchScore: result.matchScore,
            aiSummary: result.summary,
            aiStrengths: result.strengths || [],
            aiGaps: result.gaps || [],
            ghostRisk: result.ghostRisk || 'low',
            teamFitScore: result.teamFitScore ?? null,
            teamFitReason: result.teamFitReason || ''
          }
        };

        if (c.stage !== newStage) {
          updateQuery.$set.stage = newStage;
          updateQuery.$push = { stageHistory: { stage: newStage, enteredAt: new Date() } };
          updateQuery.$set.savedToShortlist = (newStage === 'screening');
        }

        await Candidate.findByIdAndUpdate(c._id, updateQuery);
        scored++;
      } catch (_) { /* skip failed candidates */ }
    }

    res.json({ message: `Scored ${scored} candidates`, scored });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/bulk-stage ──
router.post('/bulk-stage', auth, async (req, res, next) => {
  try {
    const { ids, stage } = req.body;
    if (!ids?.length || !stage) return res.status(400).json({ error: 'ids and stage required' });

    const updatePayload = { stage };
    if (['screening', 'interview', 'offer', 'hired'].includes(stage)) {
      updatePayload.savedToShortlist = true;
    } else if (stage === 'rejected' || stage === 'applied') {
      updatePayload.savedToShortlist = false;
    }

    await Candidate.updateMany(
      { _id: { $in: ids }, companyId: req.user.companyId },
      { $set: updatePayload }
    );
    res.json({ message: `Updated ${ids.length} candidates to ${stage}` });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/:id/interview-questions ──  (Module 3)
router.post('/:id/interview-questions', auth, async (req, res, next) => {
  try {
    const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId }).lean();
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    const job = candidate.jobId
      ? await Job.findById(candidate.jobId).lean()
      : await Job.findOne({ companyId: req.user.companyId }).lean();
    const questions = await generateInterviewQuestions(candidate, job || { title: 'this role', requiredSkills: [] });
    res.json({ questions });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/:id/note ──
router.post('/:id/note', auth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Note text required' });
    const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    
    candidate.notes.push({ author: req.user.name, text });
    await candidate.save();
    res.json({ notes: candidate.notes });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/:id/email-template ──  (Module 7)
router.post('/:id/email-template', auth, async (req, res, next) => {
  try {
    const { type } = req.body;
    if (!['screening', 'interview', 'rejection', 'offer'].includes(type)) {
      return res.status(400).json({ error: 'Invalid email type' });
    }
    const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId }).lean();
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    const job = candidate.jobId ? await Job.findById(candidate.jobId).lean() : { title: 'the role' };
    const company = await Company.findById(req.user.companyId).lean();
    const template = await generateEmailTemplate(type, candidate, job, company?.name || 'HireIQ');
    res.json({ template });
  } catch (err) { next(err); }
});

// ── POST /api/candidates/:id/explain-score ──  (Module 17 XAI)
router.post('/:id/explain-score', auth, async (req, res, next) => {
  try {
    const candidate = await Candidate.findOne({ _id: req.params.id, companyId: req.user.companyId }).lean();
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    if (!candidate.matchScore) return res.status(400).json({ error: 'Candidate not yet scored' });
    const job = candidate.jobId ? await Job.findById(candidate.jobId).lean() : await Job.findOne({ companyId: req.user.companyId }).lean();
    const explanation = await explainScore(candidate, job || { requiredSkills: [], minExperience: 0 });
    res.json({ explanation });
  } catch (err) { next(err); }
});

module.exports = router;
