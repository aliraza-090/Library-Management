// This is the full updated code for backend/controllers/authController.js (updated register to check duplicate CNIC too, login to send specific msgs for pending/rejected, no other changes)
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
  try {
    const { email, cnic } = req.body;

    // Check duplicate email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) return res.status(400).json({ msg: "Email already registered" });

    // Check duplicate CNIC
    const existingCnic = await User.findOne({ cnic });
    if (existingCnic) return res.status(400).json({ msg: "CNIC already registered" });

    const hashed = await bcrypt.hash(req.body.password, 10);

    const user = new User({ ...req.body, password: hashed });
    await user.save();

    res.json({ msg: "Registration successful! Wait for admin approval." });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      // Mongo duplicate error (for unique fields)
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({ msg: `${field.charAt(0).toUpperCase() + field.slice(1)} already registered` });
    }
    res.status(500).json({ msg: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ msg: "User not found" });

    if (user.status === "pending") {
      return res.status(403).json({ msg: "Your account is pending admin approval" });
    }

    if (user.status === "rejected") {
      return res.status(403).json({ msg: "Your account has been rejected by admin" });
    }

    const match = await bcrypt.compare(req.body.password, user.password);
    if (!match) return res.status(400).json({ msg: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};