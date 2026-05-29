const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  companyId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title:            { type: String, required: true },
  department:       { type: String, required: true },
  location:         { type: String, default: '' },
  description:      { type: String, default: '' },
  responsibilities: [{ type: String }],
  requirements:     [{ type: String }],
  requiredSkills:   [{ type: String }],
  niceToHaveSkills: [{ type: String }],
  minExperience:    { type: Number, default: 0 },
  status:           { type: String, enum: ['open', 'paused', 'closed'], default: 'open' },
  publicFormSlug:   { type: String, unique: true },
  deadline:         { type: Date },
  totalApplicants:  { type: Number, default: 0 },
}, { timestamps: true });

// Auto-generate publicFormSlug if not set
jobSchema.pre('save', function (next) {
  if (!this.publicFormSlug) {
    const base = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    this.publicFormSlug = `${base}-${Date.now().toString(36)}`;
  }
  next();
});

module.exports = mongoose.model('Job', jobSchema);
