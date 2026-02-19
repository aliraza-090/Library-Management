const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");



// ================= REGISTER =================
exports.register = async (req, res) => {
  try {
    const { email, cnic } = req.body;

    const existingEmail = await User.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ msg: "Email already registered" });

    const existingCnic = await User.findOne({ cnic });
    if (existingCnic)
      return res.status(400).json({ msg: "CNIC already registered" });

    const hashed = await bcrypt.hash(req.body.password, 10);

    const user = new User({ ...req.body, password: hashed });
    await user.save();

    res.json({ msg: "Registration successful! Wait for admin approval." });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        msg: `${field.charAt(0).toUpperCase() + field.slice(1)} already registered`,
      });
    }
    res.status(500).json({ msg: "Server error" });
  }
};



// ================= LOGIN =================
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

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};



// ================= FORGOT PASSWORD =================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetLink = `http://localhost:5173/reset-password/${token}`;

    const html = `
      <h3>Password Reset Request</h3>
      <p>Click the link below to reset your password:</p>
      <a href="${resetLink}">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
    `;

    await sendEmail(user.email, "Password Reset - Smart Library", html);

    res.json({ msg: "Reset link sent to your email" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};



// ================= RESET PASSWORD =================
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    await user.save();

    res.json({
      msg: "Password reset successful",
      role: user.role
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};
