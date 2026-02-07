const express = require("express");
const router = express.Router();
const Borrow = require("../models/Borrow");
const Book = require("../models/Book");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { isAdmin } = require("../middleware/authMiddleware");



// 🔹 Helper: calculate fine (₹80 per week after due date)
const calculateFine = (dueDate) => {
  if (!dueDate) return { fine: 0, weeks: 0 };

  const today = new Date();
  if (today <= dueDate) return { fine: 0, weeks: 0 };

  const diffTime = today - dueDate;
  const weeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  return {
    fine: weeks * 80,
    weeks,
  };
};


// ➕ Student requests a book
router.post("/request", protect, async (req, res) => {
  try {
    const { bookId } = req.body;
    const userId = req.user._id;

    if (!bookId) {
      return res.status(400).json({ error: "Missing bookId" });
    }

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: "Book not found" });

    const activeBorrow = await Borrow.findOne({
      bookId,
      userId,
      status: { $in: ["requested", "issued", "reissue-requested"] },
    });

    if (activeBorrow) {
      return res.status(400).json({ error: "Book already requested or issued" });
    }

    // ⏳ 12-day retry rule after rejection
    const rejectedBorrow = await Borrow.findOne({ bookId, userId, status: "rejected" });
    if (rejectedBorrow) {
      const diffDays =
        (new Date() - rejectedBorrow.updatedAt) / (1000 * 60 * 60 * 24);
      if (diffDays < 12) {
        return res.status(400).json({
          error: "You can request this book again after 12 days",
        });
      }
    }

    const borrow = new Borrow({
      bookId,
      userId,
      status: "requested",
    });

    await borrow.save();
    res.status(201).json({ message: "Book request sent to admin", borrow });
  } catch (err) {
    console.error("Error requesting book:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// 📚 Admin: get all borrow requests
router.get("/",protect , isAdmin ,  async (req, res) => {
  try {
    const borrows = await Borrow.find()
      .populate("bookId")
      .populate("userId")
      .sort({ createdAt: -1 });

    const formatted = borrows.map((b) => ({
      id: b._id,
      student: b.userId.fullName,
      rollNo: b.userId.rollNo,
      batch: b.userId.batch || "-",
      book: b.bookId.title,
      department: b.bookId.department,
      requestedOn: b.createdAt.toDateString(),
      status: b.status,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// 🎓 Student: Reservation section (with fine & lock info)
router.get("/my", protect, async (req, res) => {
  try {
    const borrows = await Borrow.find({ userId: req.user._id })
      .populate("bookId")
      .sort({ createdAt: -1 });

    const result = borrows.map((b) => {
      const { fine, weeks } = calculateFine(b.dueDate);

      const reissueLocked =
        b.issueDate &&
        new Date() <
          new Date(b.issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      return {
        id: b._id,
        book: b.bookId.title,
        status: b.status,
        issueDate: b.issueDate,
        dueDate: b.dueDate,
        returnDate: b.returnDate,
        fine,
        fineMessage:
          fine > 0 ? `You have ${weeks} week fine ₹${fine}` : null,
        reissueLocked,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// 🔁 Student reissue request
router.post("/:id/reissue", protect, async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow not found" });

    if (borrow.status !== "issued") {
      return res.status(400).json({ error: "Only issued books can be reissued" });
    }

    // 🔒 Lock reissue for 1 month
    const lockUntil = new Date(
      borrow.issueDate.getTime() + 30 * 24 * 60 * 60 * 1000
    );

    if (new Date() < lockUntil) {
      return res.status(400).json({
        error: "Reissue available only after 1 month",
      });
    }

    borrow.status = "reissue-requested";
    await borrow.save();

    res.json({ message: "Reissue request sent to admin" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// 📕 Student return request
router.post("/:id/return", protect, async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow not found" });

    borrow.status = "return-requested";
    await borrow.save();

    res.json({ message: "Return request sent to admin" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ✏ Admin updates borrow status
router.put("/:id/status",protect , isAdmin,  async (req, res) => {
  try {
    const { status } = req.body;
    const borrow = await Borrow.findById(req.params.id).populate("bookId");
    if (!borrow) return res.status(404).json({ error: "Borrow not found" });

    borrow.status = status;

    // 📗 Issue book
    if (status === "issued") {
      borrow.issueDate = new Date();
      borrow.dueDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );
      borrow.bookId.status = "Borrowed";
      await borrow.bookId.save();
    }

    // 📘 Approve reissue
    if (status === "reissued") {
      borrow.issueDate = new Date();
      borrow.dueDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );
      borrow.status = "issued";
    }

    // 📕 Return approved
    if (status === "returned") {
      borrow.returnDate = new Date();
      borrow.bookId.status = "Available";
      await borrow.bookId.save();
    }

    await borrow.save();
    res.json({ message: "Borrow status updated", borrow });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ❌ Admin deletes borrow request
router.delete("/:id",protect , isAdmin, async (req, res) => {
  try {
    await Borrow.findByIdAndDelete(req.params.id);
    res.json({ message: "Borrow request deleted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
