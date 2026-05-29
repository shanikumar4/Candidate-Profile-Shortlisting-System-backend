const express = require('express');
const app = express();

const auth = require('./middleware/auth');
const role = require('./middleware/role');
const superadminRouter = require('./routes/superadmin');

app.use('/api/superadmin', auth, role('superadmin'), superadminRouter);

console.log("Superadmin router layers:");
superadminRouter.stack.forEach(r => {
  if (r.route && r.route.path) {
    console.log(r.route.path, Object.keys(r.route.methods));
  }
});
