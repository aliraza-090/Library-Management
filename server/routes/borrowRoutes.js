const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");

// Import controller
const borrowController = require("../controllers/borrowController");

// ================= STUDENT =================

// Request book
router.post("/request", protect, borrowController.requestBook);

// Get my borrows
router.get("/my", protect, borrowController.getMyBorrows);

// Reissue request
router.post("/:id/reissue", protect, borrowController.updateBorrowStatus);

// Return request
router.post("/:id/return", protect, borrowController.updateBorrowStatus);

// ================= ADMIN =================

// Get all borrow requests
router.get("/", borrowController.getAllBorrows);

// Update borrow status
router.put("/:id/status", borrowController.updateBorrowStatus);

// Delete borrow request
router.delete("/:id", borrowController.deleteBorrow);

module.exports = router;
