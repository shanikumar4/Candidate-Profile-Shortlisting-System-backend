module.exports = (...allowedRoles) => (req, res, next) => {
  console.log(`[Role] route req.user.role=${req.user?.role}, allowedRoles=${allowedRoles}`);
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    console.log(`[Role] Rejected ${req.user?.role} - not in ${allowedRoles}`);
    return res.status(403).json({ error: 'Insufficient permissions', debug: { userRole: req.user?.role, allowed: allowedRoles } });
  }
  next();
};
