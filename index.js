require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');
const seed = require('./services/seedService');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Security ──
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Rate Limiting ──
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many attempts, try again later' },
  }));
}

// ── Logging ──
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// ── Body Parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static uploads ──
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/bias', require('./routes/bias'));
app.use('/api/public', require('./routes/public'));
app.use('/api/company', require('./routes/company'));

// Super Admin Route
const auth = require('./middleware/auth');
const role = require('./middleware/role');
app.use('/api/superadmin', auth, role('superadmin'), require('./routes/superadmin'));

// ── Health ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// ── 404 ──
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error Handler ──
app.use(errorHandler);

// ── Start ──
const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await seed();
  app.listen(PORT, () => console.log(`🚀 HireIQ Server → http://localhost:${PORT}`));
});
