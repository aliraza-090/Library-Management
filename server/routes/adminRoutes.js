// This is the full code for backend/routes/adminRoutes.js (updated with existing code, added stats route for dashboard integration, no removals)
const router = require("express").Router();
const {
  getStudents,
  getStudentById,
  updateStatus,
  addStudentManual,
  updateStudent,
  deleteStudent,
  getStats
} = require("../controllers/adminController");

const { protect, isAdmin } = require("../middleware/authMiddleware");

router.get("/students", protect, isAdmin, getStudents);
router.get("/students/:id", protect, isAdmin, getStudentById);
router.patch("/update-status", protect, isAdmin, updateStatus);
router.post("/students/manual", protect, isAdmin, addStudentManual);
router.put("/students/:id", protect, isAdmin, updateStudent);
router.delete("/students/:id", protect, isAdmin, deleteStudent);
router.get("/stats", protect, isAdmin, getStats);

module.exports = router;