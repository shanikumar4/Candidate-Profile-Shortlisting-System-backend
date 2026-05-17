const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');

// POST /api/candidates — Add a candidate
router.post('/', async (req, res) => {
  try {
    const { name, email, skills, experience, bio } = req.body;
    const candidate = await Candidate.create({ name, email, skills, experience, bio });
    res.status(201).json({ success: true, candidate });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'A candidate with this email already exists.' });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/candidates — Get all candidates
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { skills: { $elemMatch: { $regex: search, $options: 'i' } } }
        ]
      };
    }
    const candidates = await Candidate.find(query).sort({ createdAt: -1 });
    res.json({ success: true, candidates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/candidates/:id — Delete a candidate
router.delete('/:id', async (req, res) => {
  try {
    await Candidate.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/candidates/:id/save — Toggle saved to shortlist
router.patch('/:id/save', async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    candidate.savedToShortlist = !candidate.savedToShortlist;
    await candidate.save();
    res.json({ success: true, candidate });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidates/saved — Get saved shortlist
router.get('/saved', async (req, res) => {
  try {
    const candidates = await Candidate.find({ savedToShortlist: true }).sort({ createdAt: -1 });
    res.json({ success: true, candidates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
