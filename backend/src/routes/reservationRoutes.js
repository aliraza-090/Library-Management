const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  createReservation,
  getMyReservations,
  cancelReservation
} = require("../controllers/reservationController");

router.post("/", auth, createReservation);
router.get("/my", auth, getMyReservations);
router.put("/:id/cancel", auth, cancelReservation);

module.exports = router;
