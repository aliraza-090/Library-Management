const express = require("express");
const router = express.Router();
const { protect, isAdmin } = require("../middleware/authMiddleware"); // Assuming isAdmin exists

const {
  requestBook,
  getAllBorrows,
  updateBorrowStatus,
  deleteBorrow,
  getMyBorrows,
} = require("../controllers/borrowController");

// ADMIN routes
router.get("/", protect, isAdmin, getAllBorrows);
router.put("/:id/status", protect, isAdmin, updateBorrowStatus);
router.delete("/:id", protect, isAdmin, deleteBorrow);

// STUDENT routes
router.post("/request", protect, requestBook);
router.get("/my", protect, getMyBorrows);

module.exports = router;