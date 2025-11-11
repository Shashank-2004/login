const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./middleware/auth');
const User = require('./models/User');

/**
 * GET /api/student/dashboard
 * Returns logged-in student's data
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Student not found' });

    if (user.role !== 'student') {
      return res.status(403).json({ message: 'Access denied: not a student' });
    }

    const completedDrills = (user.drills || []).map(d => d.drillName);

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      preparednessScore: user.preparednessScore || 0,
      drillsCompleted: user.drillsCompleted || 0,
      completedDrills
    });
  } catch (err) {
    console.error('Error fetching student dashboard:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/student/complete-drill
 * Updates drill progress and preparedness score
 */
router.post('/complete-drill', authMiddleware, async (req, res) => {
  try {
    const { drillName, score } = req.body;

    if (!drillName || typeof score !== 'number') {
      return res.status(400).json({ message: 'drillName and score are required' });
    }

    const student = await User.findById(req.user.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (student.role !== 'student') {
      return res.status(403).json({ message: 'Access denied: not a student' });
    }

    if (!student.drills) {
    student.drills = [];
}

const existingDrillIndex = student.drills.findIndex(d => d.drillName === drillName);

if (existingDrillIndex > -1) {
    student.drills[existingDrillIndex].score = score;
} else {
    student.drills.push({ drillName, score });
}

student.drillsCompleted = student.drills.length;

const totalScore = student.drills.reduce((sum, drill) => sum + drill.score, 0);
const averageScore = Math.round(totalScore / student.drills.length);
student.preparednessScore = averageScore;

await student.save();

    res.json({
      message: 'Drill completion recorded successfully',
      drillsCompleted: student.drillsCompleted,
      preparednessScore: student.preparednessScore,
      completedDrills: student.drills.map(d => d.drillName)
    });
  } catch (err) {
    console.error('Error completing drill:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;