const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

// GET /api/company
router.get('/', auth, async (req, res, next) => {
  try {
    const company = await Company.findById(req.user.companyId).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  } catch (err) { next(err); }
});

// PATCH /api/company
router.patch('/', auth, role('superadmin', 'admin', 'hr'), async (req, res, next) => {
  try {
    const { name, teamSkills, departments } = req.body;
    const update = {};
    if (name) update.name = name;
    if (teamSkills !== undefined) update.teamSkills = teamSkills;
    if (departments !== undefined) update.departments = departments;

    const company = await Company.findByIdAndUpdate(req.user.companyId, update, { new: true });
    res.json({ company });
  } catch (err) { next(err); }
});

module.exports = router;
