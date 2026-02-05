const User = require("../models/User");
const bcrypt = require("bcryptjs");

// Get students by status
exports.getStudents = async (req, res) => {
  const status = req.query.status;
  const batch = req.query.batch;

  let filter = { role: "student" };
  if (status) filter.status = status;

  // Only filter batch if it's a valid number
  if (batch && !isNaN(batch)) filter.batch = Number(batch);

  const students = await User.find(filter);
  res.json(students);
};

// Get single student
exports.getStudentById = async (req, res) => {
  const student = await User.findById(req.params.id);
  res.json(student);
};

// Approve / Reject
exports.updateStatus = async (req, res) => {
  const { userId, status } = req.body;
  await User.findByIdAndUpdate(userId, { status });
  res.json({ msg: `Student ${status} successfully!` });
};

// Admin manual add student
exports.addStudentManual = async (req, res) => {
  try {
    const password = req.body.password || "123456"; // custom or default
    const hashed = await bcrypt.hash(password, 10);

    // ✅ Only set batch if valid number
    let batchNumber;
    if (req.body.batch && !isNaN(req.body.batch)) {
      batchNumber = Number(req.body.batch);
    }

    const student = new User({
      ...req.body,
      batch: batchNumber, // safe batch
      password: hashed,
      status: "approved",
      role: "student"
    });

    await student.save();
    res.json({ msg: "Student added manually successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to add student" });
  }
};

// Update student info
exports.updateStudent = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    // ✅ Only update batch if valid number
    if (updateData.batch && !isNaN(updateData.batch)) {
      updateData.batch = Number(updateData.batch);
    } else {
      delete updateData.batch; // prevent NaN error
    }

    await User.findByIdAndUpdate(req.params.id, updateData);
    res.json({ msg: "Student updated successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to update student" });
  }
};

// Delete student
exports.deleteStudent = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ msg: "Student deleted permanently successfully!" });
};

// Get dashboard stats
exports.getStats = async (req, res) => {
  try {
    const totalBooks = 0; // TODO: Implement Book model if needed
    const totalStudents = await User.countDocuments({ role: "student", status: "approved" });
    const activeBorrows = 0; // TODO: Implement Borrow model if needed
    const pendingApprovals = await User.countDocuments({ role: "student", status: "pending" });

    res.json({ totalBooks, totalStudents, activeBorrows, pendingApprovals });
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch stats" });
  }
};
