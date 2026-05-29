const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true,
                 match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'] },
  password:    { type: String, required: true, minlength: 8 },
  role:        { type: String, enum: ['superadmin', 'admin', 'manager', 'hr'], default: 'hr' },
  department:  { type: String },
  companyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: function() { return this.role !== 'superadmin'; } },
  status:      { type: String, enum: ['active', 'pending', 'disabled'], default: 'active' },
  inviteToken: { type: String, default: null },
  lastLogin:   { type: Date },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
