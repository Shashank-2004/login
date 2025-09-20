require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// Define Schema & Model
const DrillSchema = new mongoose.Schema({
  studentId: String,
  completed: Number,
  total: Number
});

const Drill = mongoose.model("Drill", DrillSchema);

// Example API endpoint to get drill data
app.get("/api/drills/:studentId", async (req, res) => {
  try {
    const drillData = await Drill.findOne({ studentId: req.params.studentId });
    res.json(drillData);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch drills" });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));