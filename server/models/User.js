const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: String,
  fatherName: String,
  department: String,
  rollNo: String,
  batch: Number,
  cnic: { type: String, unique: true },
  email: { type: String, unique: true },
  phone: String,
  password: String,
role: { type: String, enum: ["student", "admin", "user"], default: "student" },

 
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },

  // ✅ NEW FIELDS (Added only)
  resetToken: String,
  resetTokenExpiry: Date

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
