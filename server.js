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
    origin: ['https://yourfrontenddomain.com'], // replace with frontend domain
    credentials: true
}));
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const SECRET_KEY = process.env.SECRET_KEY || 'SECRET123';

if (!MONGO_URI) {
    console.error('MONGO_URI not set. Set it in .env or environment.');
    process.exit(1);
}

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

/**
 * POST /api/register
 * Body: { name, email, password, role, schoolId }
 */
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role, schoolId } = req.body;
        if (!email || !password || !role) return res.status(400).json({ message: 'Missing required fields' });

        if (role === 'student' && !schoolId) {
            return res.status(400).json({ message: 'Students must provide schoolId' });
        }
        if (role === 'admin' && !schoolId) {
            return res.status(400).json({ message: 'Admin must provide schoolId' });
        }

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ message: 'User already exists with this email' });

        if (role === 'admin') {
            const existingAdmin = await User.findOne({ role: 'admin', schoolId });
            if (existingAdmin) {
                return res.status(400).json({ message: 'An admin account for this school already exists' });
            }
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashed, role, schoolId });
        await user.save();
        return res.json({ message: 'Registration successful' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
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
 */
app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
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
 */
app.post('/api/students/complete-drill', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { drillName, score } = req.body;
        const student = await User.findById(userId);

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        // Ensure the drills array exists
        if (!student.drills) {
            student.drills = [];
        }

        // Find and update the score for the specific drill
        const existingDrillIndex = student.drills.findIndex(d => d.drillName === drillName);
        if (existingDrillIndex > -1) {
            // Update existing drill score
            student.drills[existingDrillIndex].score = score;
        } else {
            // Add new drill completion
            student.drills.push({ drillName, score });
        }
        
        // Increment total drills completed
        student.drillsCompleted = student.drills.length;
        
        // Recalculate preparednessScore based on average of all drills
        const totalScore = student.drills.reduce((sum, drill) => sum + drill.score, 0);
        student.preparednessScore = Math.round(totalScore / student.drills.length);

        await student.save();
        res.json({ message: 'Drill completion and score recorded', user: student });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));