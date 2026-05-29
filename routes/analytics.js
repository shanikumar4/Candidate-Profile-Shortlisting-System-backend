const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const auth = require('../middleware/auth');

// GET /api/analytics/overview
router.get('/overview', auth, async (req, res, next) => {
  try {
    const cid = req.user.companyId;
    let allowedJobIds = null;
    let jobQuery = { companyId: cid };
    let candidateQuery = { companyId: cid };

    if (req.user.role === 'manager') {
      const allowedJobs = await Job.find({ companyId: cid, department: req.user.department }).select('_id').lean();
      allowedJobIds = allowedJobs.map(j => j._id);
      jobQuery.department = req.user.department;
      candidateQuery.jobId = { $in: allowedJobIds };
    }

    const [total, shortlisted, hired, scored, jobs] = await Promise.all([
      Candidate.countDocuments(candidateQuery),
      Candidate.countDocuments({ ...candidateQuery, savedToShortlist: true }),
      Candidate.countDocuments({ ...candidateQuery, stage: 'hired' }),
      Candidate.find({ ...candidateQuery, matchScore: { $ne: null } }).select('matchScore').lean(),
      Job.countDocuments(jobQuery),
    ]);

    const avgScore = scored.length
      ? Math.round(scored.reduce((s, c) => s + c.matchScore, 0) / scored.length)
      : 0;

    // Time-to-hire: avg days from createdAt to hired stageHistory entry
    const hiredCandidates = await Candidate.find({ ...candidateQuery, stage: 'hired' }).lean();
    let avgTimeToHire = 0;
    if (hiredCandidates.length) {
      const times = hiredCandidates.map(c => {
        const hiredEntry = c.stageHistory?.find(s => s.stage === 'hired');
        return hiredEntry ? Math.round((new Date(hiredEntry.enteredAt) - new Date(c.createdAt)) / (1000 * 60 * 60 * 24)) : 0;
      });
      avgTimeToHire = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    }

    // Candidate experience scores (Module 18)
    const expScored = await Candidate.find({ ...candidateQuery, candidateExpScore: { $ne: null } }).select('candidateExpScore').lean();
    const avgCandidateExp = expScored.length
      ? Math.round(expScored.reduce((s, c) => s + c.candidateExpScore, 0) / expScored.length)
      : null;

    res.json({ total, shortlisted, hired, avgScore, jobs, avgTimeToHire, avgCandidateExp });
  } catch (err) { next(err); }
});

// GET /api/analytics/funnel
router.get('/funnel', auth, async (req, res, next) => {
  try {
    let candidateQuery = { companyId: req.user.companyId };
    if (req.user.role === 'manager') {
      const allowedJobs = await Job.find({ companyId: req.user.companyId, department: req.user.department }).select('_id').lean();
      candidateQuery.jobId = { $in: allowedJobs.map(j => j._id) };
    }

    const stages = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
    const results = await Promise.all(
      stages.map(async (stage) => ({
        stage,
        count: await Candidate.countDocuments({ ...candidateQuery, stage }),
      }))
    );
    res.json({ funnel: results });
  } catch (err) { next(err); }
});

// GET /api/analytics/timeline  (last 30 days)
router.get('/timeline', auth, async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let candidateQuery = {
      companyId: req.user.companyId,
      createdAt: { $gte: thirtyDaysAgo },
    };
    if (req.user.role === 'manager') {
      const allowedJobs = await Job.find({ companyId: req.user.companyId, department: req.user.department }).select('_id').lean();
      candidateQuery.jobId = { $in: allowedJobs.map(j => j._id) };
    }

    const candidates = await Candidate.find(candidateQuery).select('createdAt').lean();

    const counts = {};
    candidates.forEach(c => {
      const date = c.createdAt.toISOString().split('T')[0];
      counts[date] = (counts[date] || 0) + 1;
    });

    // Fill in missing days
    const timeline = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      timeline.push({ date: key, count: counts[key] || 0 });
    }

    res.json({ timeline });
  } catch (err) { next(err); }
});

// GET /api/analytics/skills
router.get('/skills', auth, async (req, res, next) => {
  try {
    let candidateQuery = { companyId: req.user.companyId };
    if (req.user.role === 'manager') {
      const allowedJobs = await Job.find({ companyId: req.user.companyId, department: req.user.department }).select('_id').lean();
      candidateQuery.jobId = { $in: allowedJobs.map(j => j._id) };
    }

    const candidates = await Candidate.find(candidateQuery).select('skills').lean();
    const counts = {};
    candidates.forEach(c => c.skills.forEach(s => {
      const normalized = s.trim();
      counts[normalized] = (counts[normalized] || 0) + 1;
    }));

    const skills = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

    res.json({ skills });
  } catch (err) { next(err); }
});

// GET /api/analytics/time-to-hire
router.get('/time-to-hire', auth, async (req, res, next) => {
  try {
    let jobQuery = { companyId: req.user.companyId };
    if (req.user.role === 'manager') jobQuery.department = req.user.department;

    const jobs = await Job.find(jobQuery).lean();
    const results = [];

    for (const job of jobs) {
      const hiredCandidates = await Candidate.find({
        companyId: req.user.companyId,
        jobId: job._id,
        stage: 'hired',
      }).lean();

      if (!hiredCandidates.length) continue;

      const times = hiredCandidates.map(c => {
        const hiredEntry = c.stageHistory?.find(s => s.stage === 'hired');
        return hiredEntry ? Math.round((new Date(hiredEntry.enteredAt) - new Date(c.createdAt)) / (1000 * 60 * 60 * 24)) : null;
      }).filter(Boolean);

      if (times.length) {
        results.push({
          jobId: job._id,
          jobTitle: job.title,
          avgDays: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
          hiredCount: times.length,
        });
      }
    }

    res.json({ timeToHire: results });
  } catch (err) { next(err); }
});

// GET /api/analytics/candidate-experience  (Module 18)
router.get('/candidate-experience', auth, async (req, res, next) => {
  try {
    let candidateQuery = {
      companyId: req.user.companyId,
      candidateExpScore: { $ne: null },
    };
    if (req.user.role === 'manager') {
      const allowedJobs = await Job.find({ companyId: req.user.companyId, department: req.user.department }).select('_id').lean();
      candidateQuery.jobId = { $in: allowedJobs.map(j => j._id) };
    }

    const candidates = await Candidate.find(candidateQuery).select('name stage candidateExpScore followUpCount createdAt').lean();

    const avg = candidates.length
      ? Math.round(candidates.reduce((s, c) => s + c.candidateExpScore, 0) / candidates.length)
      : null;

    res.json({ candidates, avg });
  } catch (err) { next(err); }
});

module.exports = router;
