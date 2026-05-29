const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password').lean();
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    if (req.user.status !== 'active') return res.status(403).json({ error: 'Account disabled' });

    // Superadmin strict isolation: Cannot access standard SaaS endpoints.
    // They can only access /api/superadmin and /api/auth endpoints.
    if (req.user.role === 'superadmin') {
      const isSuperadminRoute = req.originalUrl.startsWith('/api/superadmin');
      const isAuthRoute = req.originalUrl.startsWith('/api/auth');
      if (!isSuperadminRoute && !isAuthRoute) {
        return res.status(403).json({ error: 'Super Admins cannot access tenant data endpoints' });
      }
    } else {
      // Normal users MUST have a companyId
      if (!req.user.companyId) {
        return res.status(403).json({ error: 'Tenant context missing' });
      }
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
