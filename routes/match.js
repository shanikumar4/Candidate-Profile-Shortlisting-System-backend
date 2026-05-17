const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');

// POST /api/match
router.post('/', async (req, res) => {
  try {
    const { requiredSkills, minExperience, preferredSkills = [] } = req.body;

    if (!requiredSkills || requiredSkills.length === 0) {
      return res.status(400).json({ success: false, error: 'requiredSkills cannot be empty.' });
    }

    // Fetch all candidates from MongoDB
    const allCandidates = await Candidate.find({ experience: { $gte: Number(minExperience) || 0 } });

    const results = allCandidates.map(candidate => {
      const reqLower = requiredSkills.map(s => s.toLowerCase());
      const prefLower = preferredSkills.map(s => s.toLowerCase());
      const candidateSkillsLower = candidate.skills.map(s => s.toLowerCase());

      const matchedRequired = candidate.skills.filter(s => reqLower.includes(s.toLowerCase()));
      const matchedPreferred = candidate.skills.filter(s => prefLower.includes(s.toLowerCase()));
      const missingSkills = requiredSkills.filter(s => !candidateSkillsLower.includes(s.toLowerCase()));

      const requiredScore = matchedRequired.length / requiredSkills.length;
      const preferredScore = preferredSkills.length > 0
        ? matchedPreferred.length / preferredSkills.length
        : 0;
      const rawScore = (requiredScore * 0.75) + (preferredScore * 0.25);
      const matchScore = Math.round(rawScore * 100);

      const tier = matchScore >= 75 ? 'high' : matchScore >= 40 ? 'medium' : 'low';

      return {
        candidate,
        matchScore,
        matchedRequired,
        matchedPreferred,
        missingSkills,
        tier
      };
    }).sort((a, b) => b.matchScore - a.matchScore);

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
