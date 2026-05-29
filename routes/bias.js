const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { analyzeForBias } = require('../services/aiService');

// POST /api/bias/report  [manager/admin only]
router.post('/report', auth, role('admin', 'manager'), async (req, res, next) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const job = await Job.findOne({ _id: jobId, companyId: req.user.companyId }).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const shortlist = await Candidate.find({
      companyId: req.user.companyId,
      jobId,
      savedToShortlist: true,
    }).lean();

    if (shortlist.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 shortlisted candidates to run bias report' });
    }

    // Module 10: compute DEI score combining Four-Fifths + AI
    const allCandidates = await Candidate.find({ companyId: req.user.companyId, jobId }).lean();

    // Four-Fifths Rule by experience tier
    const tiers = [
      { label: '0-2yr', min: 0, max: 2 },
      { label: '3-5yr', min: 3, max: 5 },
      { label: '6+yr', min: 6, max: 999 },
    ];

    const tierData = tiers.map(t => {
      const applied = allCandidates.filter(c => c.experience >= t.min && c.experience <= t.max).length;
      const shortlisted = shortlist.filter(c => c.experience >= t.min && c.experience <= t.max).length;
      const rate = applied > 0 ? shortlisted / applied : 0;
      return { tier: t.label, applied, shortlisted, rate: Math.round(rate * 100) / 100 };
    }).filter(t => t.applied > 0);

    // Check Four-Fifths compliance (highest rate * 0.8 >= other rates)
    const maxRate = Math.max(...tierData.map(t => t.rate));
    const fourFifthsScore = tierData.every(t => t.rate >= maxRate * 0.8) ? 100 : 60;

    // Run AI bias analysis
    const aiResult = await analyzeForBias(shortlist, job);

    // Composite DEI score: Four-Fifths 40% + keyword mismatch 30% + AI 30%
    const keywordMismatchScore = 100 - Math.min(100, (aiResult.keywordFlags?.length || 0) * 15);
    const compositeScore = Math.round(fourFifthsScore * 0.4 + keywordMismatchScore * 0.3 + aiResult.overallFairnessScore * 0.3);

    res.json({
      jobId,
      jobTitle: job.title,
      overallFairnessScore: aiResult.overallFairnessScore,
      deiScore: compositeScore,
      keywordFlags: aiResult.keywordFlags || [],
      fourFifthsResults: tierData,
      aiSummary: aiResult.summary,
      shortlistCount: shortlist.length,
      totalApplicants: allCandidates.length,
    });
  } catch (err) { next(err); }
});

module.exports = router;
