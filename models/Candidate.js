const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  author:    { type: String },
  text:      { type: String },
  createdAt: { type: Date, default: Date.now },
});

const stageHistorySchema = new mongoose.Schema({
  stage:     { type: String },
  enteredAt: { type: Date, default: Date.now },
  exitedAt:  { type: Date },
});

const candidateSchema = new mongoose.Schema({
  companyId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  name:            { type: String, required: true, trim: true },
  email:           { type: String, required: true,
                     match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'] },
  phone:           { type: String, default: '' },
  experience:      { type: Number, required: true, min: 0 },
  skills:          [{ type: String }],
  resumeText:      { type: String, default: '' },
  resumeUrl:       { type: String, default: '' },
  linkedinUrl:     { type: String, default: '' },
  portfolioUrl:    { type: String, default: '' },
  coverNote:       { type: String, default: '' },

  // AI fields
  matchScore:      { type: Number, default: null },
  aiSummary:       { type: String, default: '' },
  aiFlags:         [{ type: String }],
  aiStrengths:     [{ type: String }],
  aiGaps:          [{ type: String }],
  teamFitScore:    { type: Number, default: null },
  teamFitReason:   { type: String, default: '' },

  // Pipeline
  stage: {
    type: String,
    enum: ['applied', 'screening', 'interview', 'offer', 'rejected', 'hired'],
    default: 'applied',
  },
  stageHistory:    [stageHistorySchema],
  savedToShortlist:{ type: Boolean, default: false },
  ghostRisk:       { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  notes:           [noteSchema],
  source:          { type: String, enum: ['form', 'manual', 'import'], default: 'manual' },

  // Candidate experience tracking (Module 18)
  followUpCount:   { type: Number, default: 0 },
  candidateExpScore: { type: Number, default: null },
}, { timestamps: true });

// Text index for search
candidateSchema.index({ name: 'text', email: 'text' });

module.exports = mongoose.model('Candidate', candidateSchema);
