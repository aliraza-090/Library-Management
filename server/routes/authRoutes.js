// This is the full code for backend/routes/authRoutes.js (updated with existing code, no removals)
const router = require("express").Router();
const { register, login } = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);

module.exports = router;