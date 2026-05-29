const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Company = require('../models/Company');

// GET /api/superadmin/companies
router.get('/companies', async (req, res, next) => {
  try {
    const companies = await Company.find().lean();
    
    // Get user counts and active HR info for each company
    const enrichedCompanies = await Promise.all(companies.map(async (company) => {
      const users = await User.find({ companyId: company._id }).select('-password').lean();
      const hrUsers = users.filter(u => u.role === 'admin');
      
      return {
        ...company,
        userCount: users.length,
        hrUsers,
      };
    }));
    
    res.json({ companies: enrichedCompanies });
  } catch (err) { next(err); }
});

// POST /api/superadmin/companies
router.post('/companies', async (req, res, next) => {
  try {
    const { name, plan } = req.body;
    if (!name) return res.status(400).json({ error: 'Company name is required' });
    
    // Auto-generate slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
    
    const company = await Company.create({
      name,
      slug,
      plan: plan || 'starter'
    });
    
    res.status(201).json({ company, message: 'Company created successfully' });
  } catch (err) { next(err); }
});

// POST /api/superadmin/invite
router.post('/invite', async (req, res, next) => {
  try {
    const { email, companyId, role = 'admin' } = req.body;
    if (!email || !companyId) return res.status(400).json({ error: 'Email and companyId are required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const inviteToken = crypto.randomBytes(32).toString('hex');
    await User.create({
      name: email.split('@')[0],
      email: email.toLowerCase(),
      password: crypto.randomBytes(16).toString('hex'), // placeholder
      role: role,
      companyId: company._id,
      status: 'pending',
      inviteToken,
    });

    res.status(201).json({
      message: 'Invite created',
      inviteLink: `${process.env.CLIENT_URL || 'http://localhost:5173'}/accept-invite?token=${inviteToken}`,
    });
  } catch (err) { next(err); }
});

// DELETE /api/superadmin/users/:id
router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'superadmin') return res.status(403).json({ error: 'Cannot delete superadmin' });
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User removed successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
