require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const User = require('./models/User');
const { authMiddleware, requireAdmin } = require('./middleware/auth');

const app = express();

app.use(cors({
    origin: 'https://shashank-2004.github.io',
    credentials: true
}));

app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const SECRET_KEY = process.env.SECRET_KEY || 'KiphT3fMKYK174IR';

if (!MONGO_URI) {
    console.error('MONGO_URI not set. Set it in .env or environment.');
    process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

/**
 * POST /api/register
 * Body: { name, email, password, role, schoolId }
 */
app.post('/api/students/complete-drill', authMiddleware, async (req, res) => {
  const { drillName, score } = req.body;
  if (!drillName || typeof score !== 'number') {
    return res.status(400).json({ message: 'drillName and score are required' });
  }

  const student = await User.findById(req.user.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });

  if (!student.drills) student.drills = [];

  const existingDrill = student.drills.find(d => d.drillName === drillName);
  if (existingDrill) {
    existingDrill.score = score;
  } else {
    student.drills.push({ drillName, score });
  }

  student.drillsCompleted = student.drills.length;
  const totalScore = student.drills.reduce((sum, d) => sum + d.score, 0);
  student.preparednessScore = Math.round(totalScore / student.drills.length);

  await student.save();

  res.json({
    message: 'Drill completion recorded successfully',
    drillsCompleted: student.drillsCompleted,
    preparednessScore: student.preparednessScore,
    completedDrills: student.drills.map(d => d.drillName)
  });
});

/**
 * POST /api/login
 * Body: { email, password, role }
 * Returns: { token, role, schoolId }
 */
app.post('/api/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        if (!email || !password || !role) return res.status(400).json({ message: 'Missing required fields' });

        const user = await User.findOne({ email, role });
        if (!user) return res.status(400).json({ message: 'Invalid credentials (email/role mismatch)' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, role: user.role, schoolId: user.schoolId }, SECRET_KEY, { expiresIn: '1d' });
        return res.json({ token, role: user.role, schoolId: user.schoolId, message: 'Login successful' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET /api/me
 * Authenticated route that returns current user (without password)
 * ✅ NOW INCLUDES completedDrills ARRAY
 */
app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        // ✅ Extract completed drill names
        const completedDrills = (user.drills || []).map(d => d.drillName);

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            preparednessScore: user.preparednessScore || 0,
            drillsCompleted: user.drillsCompleted || 0,
            completedDrills: completedDrills  // ✅ Added this
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET /api/admin/students
 * Admin-only: returns students of the admin's school (based on token)
 */
app.get('/api/admin/students', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        if (!schoolId) return res.status(400).json({ message: 'Admin has no schoolId' });
        const students = await User.find({ role: 'student', schoolId }).select('-password');
        res.json(students);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * POST /api/students/update
 * Protected: updates student's general info
 * Body: { preparednessScore, drillsCompleted }
 */
app.post('/api/students/update', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { preparednessScore, drillsCompleted } = req.body;
        
        const student = await User.findById(userId);
        if (!student) return res.status(404).json({ message: 'User not found' });
        
        if (typeof preparednessScore === 'number') student.preparednessScore = preparednessScore;
        if (typeof drillsCompleted === 'number') student.drillsCompleted = drillsCompleted;
        
        await student.save();
        res.json(student);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * POST /api/students/complete-drill
 * Protected: increments the user's drillsCompleted count and updates their score for a specific drill.
 * Body: { drillName, score }
 * ✅ IMPROVED: Better handling of drill completion
 */
app.post('/api/students/complete-drill', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { drillName, score } = req.body;

        // ✅ Validate input
        if (!drillName || typeof score !== 'number') {
            return res.status(400).json({ message: 'drillName and score are required' });
        }

        const student = await User.findById(userId);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        // ✅ Initialize drills array if it doesn't exist
        if (!student.drills) {
            student.drills = [];
        }

        // ✅ Check if drill already completed
        const existingDrillIndex = student.drills.findIndex(d => d.drillName === drillName);
        
        if (existingDrillIndex > -1) {
            // Update existing drill score
            student.drills[existingDrillIndex].score = score;
        } else {
            // Add new drill
            student.drills.push({ drillName, score });
        }
        
        // ✅ Update drillsCompleted count
        student.drillsCompleted = student.drills.length;
        
        // ✅ Calculate average preparedness score from all completed drills
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
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));