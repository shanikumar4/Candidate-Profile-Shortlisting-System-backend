const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.status === 'disabled') return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'pending') return res.status(401).json({ error: 'Account not yet activated' });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        companyId: user.companyId,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/invite
router.post('/invite', auth, role('superadmin', 'admin', 'hr'), async (req, res, next) => {
  try {
    const { email, role: userRole = 'hr', department } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const inviterRole = req.user.role;
    if (inviterRole === 'hr' && userRole !== 'manager') {
      return res.status(403).json({ error: 'HR can only invite Managers' });
    }
    if (inviterRole === 'admin' && !['hr', 'manager'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin can only invite HR and Managers' });
    }
    if (inviterRole === 'superadmin' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Super Admin can only invite Admins' });
    }

    if (userRole === 'manager' && !department) {
      return res.status(400).json({ error: 'Department is required for managers' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const inviteToken = crypto.randomBytes(32).toString('hex');
    await User.create({
      name: email.split('@')[0],
      email: email.toLowerCase(),
      password: crypto.randomBytes(16).toString('hex'), // placeholder — never used
      role: userRole,
      department: userRole === 'manager' ? department : undefined,
      companyId: req.user.companyId,
      status: 'pending',
      inviteToken,
    });

    res.status(201).json({
      message: 'Invite created',
      inviteLink: `${process.env.CLIENT_URL || 'http://localhost:5173'}/accept-invite?token=${inviteToken}`,
    });
  } catch (err) { next(err); }
});

// POST /api/auth/accept-invite
router.post('/accept-invite', async (req, res, next) => {
  try {
    const { token, email, name, password } = req.body;
    if (!token || !email || !name || !password) return res.status(400).json({ error: 'Token, email, name and password required' });

    const user = await User.findOne({ inviteToken: token, status: 'pending' });
    if (!user) return res.status(400).json({ error: 'Invalid or expired invite token' });

    if (user.email !== email.toLowerCase()) {
      return res.status(403).json({ error: 'This invite link is only valid for the original email address it was sent to.' });
    }

    user.name = name.trim();
    user.password = password;
    user.status = 'active';
    user.inviteToken = null;
    await user.save();

    const jwtToken = signToken(user._id);
    res.json({ token: jwtToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, department: user.department } });
  } catch (err) { next(err); }
});

// GET /api/auth/users
router.get('/users', auth, role('superadmin', 'admin', 'hr', 'manager'), async (req, res, next) => {
  try {
    const users = await User.find({ companyId: req.user.companyId }).select('-password').lean();
    res.json({ users });
  } catch (err) { next(err); }
});

// PATCH /api/auth/users/:id  [admin only]
router.patch('/users/:id', auth, role('admin'), async (req, res, next) => {
  try {
    const { status, role: newRole } = req.body;
    const update = {};
    if (status) update.status = status;
    if (newRole) update.role = newRole;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      update, { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) { next(err); }
});

module.exports = router;
