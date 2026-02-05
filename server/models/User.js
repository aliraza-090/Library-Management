const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: String,
  fatherName: String,
  department: String,
  rollNo: String,                  
  batch: Number,                   // ✅ NEW FIELD FOR BATCH
  cnic: { type: String, unique: true },
  email: { type: String, unique: true },
  phone: String,
  password: String,

  role: { type: String, enum: ["student", "admin"], default: "student" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
