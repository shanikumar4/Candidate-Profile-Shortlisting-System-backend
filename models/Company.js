const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true }, // used in public form URL
  plan: { type: String, enum: ['starter', 'pro', 'enterprise'], default: 'starter' },
  teamSkills: [{ type: String }], // for Team Compatibility Analyser (Module 15)
  departments: [{ type: String }], // e.g., ["Engineering", "Sales", "Marketing"]
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
