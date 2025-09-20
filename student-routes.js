// server.js (or student-routes.js)
const express = require('express');
const router = express.Router();
const auth = require('./auth'); // Path to your middleware
const User = require('./models/User'); // Mongoose model for your User schema

// @route    GET /api/student/dashboard
// @desc     Get student dashboard data
// @access   Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    // Fetch the user from the database using the ID from the JWT token
    const user = await User.findById(req.user.id).select('-password'); 
    if (!user || user.role !== 'student') {
      return res.status(404).json({ message: 'Student not found or unauthorized' });
    }
    // Respond with the specific data
    res.json({
      name: user.name,
      preparednessScore: user.preparednessScore,
      drillsCompleted: user.drillsCompleted,
      email: user.email // You can send other details if needed
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});