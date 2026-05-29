const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { generateJobDescription } = require('../services/aiService');

// GET /api/jobs
router.get('/', auth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { companyId: req.user.companyId };
    if (req.user.role === 'manager') query.department = req.user.department;
    if (status) query.status = status;
    const jobs = await Job.find(query).sort('-createdAt').lean();
    res.json({ jobs });
  } catch (err) { next(err); }
});

// POST /api/jobs
router.post('/', auth, role('admin', 'hr'), async (req, res, next) => {
  try {
    const {
      title, department, description, requiredSkills, niceToHaveSkills,
      minExperience, deadline, responsibilities, requirements
    } = req.body;

    const job = await Job.create({
      companyId: req.user.companyId,
      createdBy: req.user._id,
      title, department, description,
      requiredSkills: requiredSkills || [],
      niceToHaveSkills: niceToHaveSkills || [],
      minExperience: Number(minExperience) || 0,
      deadline: deadline ? new Date(deadline) : undefined,
      responsibilities: responsibilities || [],
      requirements: requirements || [],
    });
    res.status(201).json({ job });
  } catch (err) { next(err); }
});

// GET /api/jobs/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const query = { _id: req.params.id, companyId: req.user.companyId };
    if (req.user.role === 'manager') query.department = req.user.department;
    const job = await Job.findOne(query).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  } catch (err) { next(err); }
});

// PATCH /api/jobs/:id
router.patch('/:id', auth, role('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const allowed = ['title', 'department', 'description', 'requiredSkills', 'niceToHaveSkills',
                     'minExperience', 'status', 'deadline', 'responsibilities', 'requirements', 'niceToHaveSkills'];
    
    if (req.user.role === 'manager') {
      const idx = allowed.indexOf('status');
      if (idx > -1) allowed.splice(idx, 1);
    }
    
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    const query = { _id: req.params.id, companyId: req.user.companyId };
    if (req.user.role === 'manager') query.department = req.user.department;

    const job = await Job.findOneAndUpdate(
      query,
      update, { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  } catch (err) { next(err); }
});

// DELETE /api/jobs/:id  [admin/hr only]
router.delete('/:id', auth, role('admin', 'hr'), async (req, res, next) => {
  try {
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      { status: 'closed' }, { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ message: 'Job closed', job });
  } catch (err) { next(err); }
});

// POST /api/jobs/:id/generate-jd  (Module 16 Reverse JD Generator)
router.post('/:id/generate-jd', auth, role('admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const { bulletPoints } = req.body;
    if (!bulletPoints) return res.status(400).json({ error: 'bulletPoints required' });

    const query = { _id: req.params.id, companyId: req.user.companyId };
    if (req.user.role === 'manager') query.department = req.user.department;

    const job = await Job.findOne(query);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const generated = await generateJobDescription(bulletPoints, job.title);

    job.description = generated.description || job.description;
    job.responsibilities = generated.responsibilities || [];
    job.requirements = generated.requirements || [];
    if (generated.requiredSkills?.length) job.requiredSkills = generated.requiredSkills;
    if (generated.minExperience) job.minExperience = generated.minExperience;
    await job.save();

    res.json({ job, generated });
  } catch (err) { next(err); }
});

// POST /api/jobs/generate-jd-preview  (for new job creation)
router.post('/generate-jd-preview', auth, role('admin', 'hr'), async (req, res, next) => {
  try {
    const { bulletPoints, title } = req.body;
    if (!bulletPoints || !title) return res.status(400).json({ error: 'bulletPoints and title required' });
    const generated = await generateJobDescription(bulletPoints, title);
    res.json({ generated });
  } catch (err) { next(err); }
});

module.exports = router;
