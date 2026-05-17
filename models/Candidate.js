const mongoose = require('mongoose');

const CandidateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  skills: {
    type: [String],
    required: [true, 'At least one skill is required'],
    validate: {
      validator: arr => arr.length > 0,
      message: 'Skills array cannot be empty'
    }
  },
  experience: {
    type: Number,
    required: [true, 'Experience is required'],
    min: [0, 'Experience cannot be negative']
  },
  bio: {
    type: String,
    default: '',
    trim: true
  },
  savedToShortlist: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true   // adds createdAt and updatedAt automatically
});

module.exports = mongoose.model('Candidate', CandidateSchema);
