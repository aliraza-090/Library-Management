const Borrow = require("../models/Borrow");
const Book = require("../models/Book");
const User = require("../models/User");

//////////////////////////////////////////////////////////////
// ➕ STUDENT REQUEST BOOK
//////////////////////////////////////////////////////////////
exports.requestBook = async (req, res) => {
  try {
    const { bookId } = req.body;
    const userId = req.user._id;

    if (!bookId) {
      return res.status(400).json({ error: "Missing bookId" });
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    if (book.status === "Borrowed") {
      return res.status(400).json({ error: "Book already borrowed" });
    }

    const existing = await Borrow.findOne({
      bookId,
      userId,
      status: { $in: ["requested", "issued", "reissue-requested"] },
    });

    if (existing) {
      return res.status(400).json({ error: "You already requested this book" });
    }

    const borrow = new Borrow({
      bookId,
      userId,
      status: "requested",
      requestType: "borrow",
    });

    await borrow.save();

    book.status = "reserved"; // or "Requested" — your choice
    await book.save();

    res.status(201).json({
      message: "Book request sent to admin",
      borrow,
    });
  } catch (err) {
    console.error("requestBook error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};

//////////////////////////////////////////////////////////////
// 📚 ADMIN – GET ALL BORROWS (ROBUST VERSION)
//////////////////////////////////////////////////////////////
exports.getAllBorrows = async (req, res) => {
  try {
    const borrows = await Borrow.find()
      .populate({
        path: "userId",
        select: "fullName rollNo batch",
      })
      .populate({
        path: "bookId",
        select: "title department",
      })
      .sort({ createdAt: -1 })
      .lean(); // faster + easier to modify, prevents population crashes

    const formatted = borrows.map((b) => ({
      id: b._id.toString(),
      student: b.userId?.fullName || "User deleted",
      rollNo: b.userId?.rollNo || "—",
      batch: b.userId?.batch || "—",
      book: b.bookId?.title || "Book deleted",
      department: b.bookId?.department || "—",
      requestedOn: b.createdAt ? new Date(b.createdAt).toDateString() : "—",
      issueDate: b.issueDate ? new Date(b.issueDate).toDateString() : "—",
      dueDate: b.dueDate ? new Date(b.dueDate).toDateString() : "—",
      status: b.status || "unknown",
      fine: b.fine || 0,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("getAllBorrows error:", err);
    res.status(500).json({
      error: "Failed to fetch borrow requests",
      message: err.message,
    });
  }
};

//////////////////////////////////////////////////////////////
// ✏ ADMIN – UPDATE STATUS
//////////////////////////////////////////////////////////////
exports.updateBorrowStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["requested", "issued", "returned", "rejected", "reissue-requested"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) {
      return res.status(404).json({ error: "Borrow record not found" });
    }

    const book = await Book.findById(borrow.bookId);
    if (!book) {
      return res.status(404).json({ error: "Related book not found" });
    }

    borrow.status = status;

    if (status === "issued") {
      borrow.issueDate = new Date();
      borrow.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      book.status = "Borrowed";
      await book.save();
    }

    if (status === "returned") {
      borrow.returnDate = new Date();
      book.status = "Available";
      await book.save();
    }

    await borrow.save();

    // optional: re-populate for response
    await borrow.populate([
      { path: "userId", select: "fullName rollNo batch" },
      { path: "bookId", select: "title department" },
    ]);

    res.json({ message: "Status updated", borrow });
  } catch (err) {
    console.error("updateBorrowStatus error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};

//////////////////////////////////////////////////////////////
// ❌ ADMIN – DELETE REQUEST
//////////////////////////////////////////////////////////////
exports.deleteBorrow = async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) {
      return res.status(404).json({ error: "Borrow not found" });
    }

    // Optional: only allow delete if not issued/returned
    if (borrow.status === "issued" || borrow.status === "returned") {
      return res.status(400).json({ error: "Cannot delete active/returned borrow" });
    }

    await Borrow.findByIdAndDelete(req.params.id);

    res.json({ message: "Borrow request deleted" });
  } catch (err) {
    console.error("deleteBorrow error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};

//////////////////////////////////////////////////////////////
// 👨‍🎓 STUDENT – MY BORROWS
//////////////////////////////////////////////////////////////
exports.getMyBorrows = async (req, res) => {
  try {
    const borrows = await Borrow.find({ userId: req.user._id })
      .populate({
        path: "bookId",
        select: "title author department coverImage status",
      })
      .sort({ createdAt: -1 })
      .lean();

    res.json(borrows);
  } catch (err) {
    console.error("getMyBorrows error:", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
};