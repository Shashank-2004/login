require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const User = require('./models/User');
const { authMiddleware, requireAdmin } = require('./middleware/auth');

const app = express();

// ✅ Allow your GitHub Pages frontend to communicate
app.use(cors({
    origin: 'https://shashank-2004.github.io',
    credentials: true
}));

app.use(bodyParser.json());

// ✅ Port and keys
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const SECRET_KEY = process.env.SECRET_KEY || 'KiphT3fMKYK174IR';

// ✅ MongoDB Connection
if (!MONGO_URI) {
    console.error('MONGO_URI not set. Set it in .env or environment.');
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

/**
 * ✅ POST /api/register
 * Registers a new user
 */
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role, schoolId } = req.body;

        if (!name || !email || !password || !role || !schoolId) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email, role });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email and role' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
            schoolId,
            drillsCompleted: 0,
            preparednessScore: 0
        });

        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

/**
 * ✅ POST /api/login
 * Body: { email, password, role }
 */
app.post('/api/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        if (!email || !password || !role)
            return res.status(400).json({ message: 'Missing required fields' });

        const user = await User.findOne({ email, role });
        if (!user)
            return res.status(400).json({ message: 'Invalid credentials (email/role mismatch)' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id, role: user.role, schoolId: user.schoolId },
            SECRET_KEY,
            { expiresIn: '1d' }
        );

        res.json({
            token,
            role: user.role,
            schoolId: user.schoolId,
            message: 'Login successful'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * ✅ GET /api/me
 * Returns current user info (requires auth)
 */
app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

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
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * ✅ GET /api/admin/students
 * Admin-only route
 */
app.get('/api/admin/students', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        if (!schoolId) return res.status(400).json({ message: 'Admin has no schoolId' });

        const students = await User.find({ role: 'student', schoolId }).select('-password');
        res.json(students);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * ✅ POST /api/students/update
 * Updates student's preparednessScore and drillsCompleted
 */
app.post('/api/students/update', authMiddleware, async (req, res) => {
    try {
        const { preparednessScore, drillsCompleted } = req.body;
        const student = await User.findById(req.user.id);

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
 * ✅ POST /api/students/complete-drill
 * Marks a drill as completed and updates preparedness score
 */
app.post('/api/students/complete-drill', authMiddleware, async (req, res) => {
    try {
        const { drillName, score } = req.body;
        const student = await User.findById(req.user.id);

        if (!student) return res.status(404).json({ message: 'Student not found' });
        if (!drillName || typeof score !== 'number')
            return res.status(400).json({ message: 'drillName and score are required' });

        if (!student.drills) student.drills = [];

        const existing = student.drills.find(d => d.drillName === drillName);
        if (existing) {
            existing.score = score;
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
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ✅ Serve static frontend (if any)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ Start server (Render requires process.env.PORT)
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));