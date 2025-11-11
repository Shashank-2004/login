const mongoose = require('mongoose');

const drillSchema = new mongoose.Schema({
  drillName: { type: String, required: true },
  score: { type: Number, required: true }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  schoolId: { type: String },
  drills: [drillSchema],  // ✅ Important
  drillsCompleted: { type: Number, default: 0 },
  preparednessScore: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);