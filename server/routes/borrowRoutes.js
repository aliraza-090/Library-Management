const express = require("express");
const router = express.Router();
const Borrow = require("../models/Borrow");
const Book = require("../models/Book");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");


// 🔹 Helper: calculate fine
const calculateFine = (dueDate) => {
  const today = new Date();
  if (today <= dueDate) return 0;

  const diffTime = today - dueDate;
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  return diffWeeks * 80;
};

// 🔹 NEW: Check if can reissue (1 month lock)
const canReissue = (borrow) => {
  if (!borrow.lastReissueDate) return true;
  
  const lockPeriod = 30 * 24 * 60 * 60 * 1000; // 1 month in milliseconds
  const now = new Date();
  const unlockDate = new Date(borrow.lastReissueDate.getTime() + lockPeriod);
  
  return now >= unlockDate;
};

// 🔹 NEW: Check 12-day rule
const canRequestAgain = (borrow) => {
  if (borrow.status !== "rejected" || !borrow.rejectedDate) return true;
  
  const twelveDays = 12 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const canRequestDate = new Date(borrow.rejectedDate.getTime() + twelveDays);
  
  return now >= canRequestDate;
};


// ➕ Student requests a book (UPDATED with 12-day rule)
router.post("/request", protect, async (req, res) => {
  try {
    const { bookId } = req.body;
    const userId = req.user._id;

    if (!bookId) {
      return res.status(400).json({ error: "Missing required field: bookId" });
    }

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: "Book not found" });

    if (book.status === "Borrowed") {
      return res.status(400).json({ error: "Book is currently borrowed by someone else" });
    }

    // 🔥 Check 12-day rule for rejected requests
    const rejectedRequest = await Borrow.findOne({
      bookId,
      userId,
      status: "rejected"
    }).sort({ rejectedDate: -1 });

    if (rejectedRequest && !canRequestAgain(rejectedRequest)) {
      const rejectDate = new Date(rejectedRequest.rejectedDate);
      const availableDate = new Date(rejectDate.getTime() + (12 * 24 * 60 * 60 * 1000));
      return res.status(400).json({ 
        error: "You can request this book again after 12 days from rejection",
        availableAfter: availableDate,
        daysLeft: Math.ceil((availableDate - new Date()) / (1000 * 60 * 60 * 24))
      });
    }

    const existing = await Borrow.findOne({
      bookId,
      userId,
      status: { $in: ["requested", "issued", "overdue", "reissue-requested", "return-requested"] },
    });

    if (existing) {
      return res.status(400).json({
        error: `You already have an active request for this book (status: ${existing.status})`
      });
    }

    const borrow = new Borrow({
      bookId,
      userId,
      status: "requested",
      requestType: "borrow"
    });

    await borrow.save();

    // Update book status to reserved
    if (book) {
      book.status = "reserved";
      await book.save();
    }

    res.status(201).json({ 
      message: "Book requested successfully. Waiting for admin approval.", 
      borrow,
      note: "Your request will appear in reservations section"
    });

  } catch (err) {
    console.error("Error requesting book:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// 📚 Admin: get all borrow requests (UPDATED with fines)
router.get("/", protect, async (req, res) => {
  try {
    const borrows = await Borrow.find()
      .populate("bookId", "title author department status coverImage")
      .populate("userId", "fullName rollNo batch email")
      .sort({ createdAt: -1 });

    // Calculate fines for each
    const formatted = borrows.map((b) => {
      const fine = b.dueDate ? calculateFine(b.dueDate) : 0;
      
      return {
        id: b._id,
        student: b.userId?.fullName || "Unknown",
        rollNo: b.userId?.rollNo || "-",
        batch: b.userId?.batch || "-",
        book: b.bookId?.title || "Deleted Book",
        department: b.bookId?.department || "-",
        requestedOn: b.createdAt.toDateString(),
        issueDate: b.issueDate ? new Date(b.issueDate).toDateString() : "-",
        dueDate: b.dueDate ? new Date(b.dueDate).toDateString() : "-",
        returnDate: b.returnDate ? new Date(b.returnDate).toDateString() : "-",
        status: b.status,
        fine,
        finePaid: b.finePaid || false,
        requestType: b.requestType || "borrow",
        canReissue: canReissue(b),
        reissueCount: b.reissueCount || 0
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🎓 Student: Get own reservations + fine info (UPDATED - This is the main endpoint)
router.get("/my", protect, async (req, res) => {
  try {
    const borrows = await Borrow.find({ userId: req.user._id })
      .populate("bookId", "title author department coverImage status")
      .sort({ createdAt: -1 });

    const result = borrows.map(b => {
      const fine = b.dueDate ? calculateFine(b.dueDate) : 0;
      const isOverdue = b.dueDate && new Date() > b.dueDate;
      const overdueDays = isOverdue ? Math.ceil((new Date() - b.dueDate) / (1000 * 60 * 60 * 24)) : 0;

      return {
        id: b._id,
        book: {
          _id: b.bookId?._id,
          title: b.bookId?.title || "Unknown Book",
          author: b.bookId?.author || "Unknown Author",
          coverImage: b.bookId?.coverImage,
          department: b.bookId?.department,
          status: b.bookId?.status
        },
        status: b.status,
        issueDate: b.issueDate,
        dueDate: b.dueDate,
        returnDate: b.returnDate,
        fine: b.fine || fine,
        finePaid: b.finePaid || false,
        isOverdue,
        overdueDays,
        canReissue: canReissue(b),
        reissueLockedUntil: b.lastReissueDate ? 
          new Date(b.lastReissueDate.getTime() + (30 * 24 * 60 * 60 * 1000)) : null,
        canRequestAgain: canRequestAgain(b),
        reissueCount: b.reissueCount || 0,
        requestType: b.requestType || "borrow",
        rejectedDate: b.rejectedDate,
        adminNotes: b.adminNotes,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🔁 Student reissue request (UPDATED with lock check)
router.post("/:id/reissue", protect, async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow record not found" });

    if (!["issued", "overdue"].includes(borrow.status)) {
      return res.status(400).json({ error: "Only issued/overdue books can be reissued" });
    }

    // Check reissue lock (1 month)
    if (!canReissue(borrow)) {
      const lastDate = new Date(borrow.lastReissueDate);
      const unlockDate = new Date(lastDate.getTime() + (30 * 24 * 60 * 60 * 1000));
      return res.status(400).json({ 
        error: "Reissue locked for 1 month after last reissue",
        availableAfter: unlockDate
      });
    }

    // Check if fine exists
    const fine = calculateFine(borrow.dueDate);
    if (fine > 0 && !borrow.finePaid) {
      return res.status(400).json({ 
        error: "Clear outstanding fine before reissuing",
        fineAmount: fine
      });
    }

    borrow.status = "reissue-requested";
    borrow.lastReissueDate = new Date();
    borrow.isReissueLocked = true;
    await borrow.save();

    res.json({ 
      message: "Reissue request sent to admin",
      note: "Your request will appear in reservations section"
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// 📕 Student return request (UPDATED with fine calculation)
router.post("/:id/return", protect, async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow record not found" });

    if (!["issued", "overdue"].includes(borrow.status)) {
      return res.status(400).json({ error: "Only issued books can be returned" });
    }

    // Calculate fine
    const fine = calculateFine(borrow.dueDate);
    
    borrow.status = "return-requested";
    borrow.fine = fine > 0 ? fine : borrow.fine;
    await borrow.save();

    res.json({ 
      message: "Return request sent to admin",
      fineAmount: borrow.fine,
      note: "Your request will appear in reservations section"
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ✏ Admin updates borrow status (UPDATED with all features)
router.put("/:id/status", protect, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const borrow = await Borrow.findById(req.params.id).populate("bookId");
    if (!borrow) return res.status(404).json({ error: "Borrow request not found" });

    const oldStatus = borrow.status;
    
    // Update status and notes
    borrow.status = status;
    if (adminNotes) borrow.adminNotes = adminNotes;

    // 📗 When admin issues book
    if (status === "issued") {
      borrow.issueDate = new Date();
      borrow.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 1 month
      if (borrow.bookId) {
        borrow.bookId.status = "Borrowed";
        await borrow.bookId.save();
      }
    }

    // 📘 When admin approves reissue
    if (status === "reissued") {
      borrow.reissueCount = (borrow.reissueCount || 0) + 1;
      borrow.lastReissueDate = new Date();
      borrow.isReissueLocked = true;
      borrow.issueDate = new Date();
      borrow.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      borrow.status = "issued";
    }

    // 📕 When admin marks returned
    if (status === "returned") {
      borrow.returnDate = new Date();
      borrow.actualReturnDate = new Date();
      
      // Calculate final fine if overdue
      const fine = calculateFine(borrow.dueDate);
      if (fine > 0) {
        borrow.fine = fine;
        borrow.status = "fine-pending";
      } else {
        borrow.status = "completed";
      }
      
      if (borrow.bookId) {
        borrow.bookId.status = "Available";
        await borrow.bookId.save();
      }
    }

    // ❌ When admin rejects request
    if (status === "rejected") {
      borrow.rejectedDate = new Date();
      if (borrow.bookId && borrow.bookId.status === "reserved") {
        borrow.bookId.status = "Available";
        await borrow.bookId.save();
      }
    }

    // Save changes
    await borrow.save();
    res.json({ 
      message: "Borrow status updated", 
      borrow,
      oldStatus,
      newStatus: status,
      fineAmount: borrow.fine
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ❌ Admin deletes borrow request
router.delete("/:id", protect, async (req, res) => {
  try {
    await Borrow.findByIdAndDelete(req.params.id);
    res.json({ message: "Borrow request deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🔥 NEW: Student cancel request
router.put("/:id/cancel", protect, async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow not found" });

    if (!["requested", "reissue-requested", "return-requested"].includes(borrow.status)) {
      return res.status(400).json({ error: "Only pending requests can be cancelled" });
    }

    borrow.status = "cancelled";
    await borrow.save();

    // If it's a borrow request, make book available again
    if (borrow.requestType === "borrow") {
      const book = await Book.findById(borrow.bookId);
      if (book && book.status === "reserved") {
        book.status = "Available";
        await book.save();
      }
    }

    res.json({ message: "Request cancelled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🔥 NEW: Pay fine
router.put("/:id/pay-fine", protect, async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow not found" });

    if (borrow.fine <= 0 || borrow.finePaid) {
      return res.status(400).json({ error: "No fine pending" });
    }

    borrow.finePaid = true;
    borrow.status = borrow.status === "fine-pending" ? "completed" : borrow.status;
    await borrow.save();

    res.json({ 
      message: "Fine paid successfully",
      paidAmount: borrow.fine,
      newStatus: borrow.status
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🔥 NEW: Get reservation details for student (This is what your frontend is calling)
router.get("/reservations", protect, async (req, res) => {
  try {
    const borrows = await Borrow.find({ userId: req.user._id })
      .populate("bookId", "title author department coverImage status")
      .sort({ createdAt: -1 });

    const reservations = borrows.map(b => {
      const fine = b.dueDate ? calculateFine(b.dueDate) : 0;
      const isOverdue = b.dueDate && new Date() > b.dueDate;
      const overdueDays = isOverdue ? Math.ceil((new Date() - b.dueDate) / (1000 * 60 * 60 * 24)) : 0;
      
      return {
        id: b._id,
        book: {
          _id: b.bookId?._id,
          title: b.bookId?.title || "Unknown Book",
          author: b.bookId?.author || "Unknown Author",
          coverImage: b.bookId?.coverImage,
          department: b.bookId?.department,
          status: b.bookId?.status
        },
        status: b.status,
        issueDate: b.issueDate,
        dueDate: b.dueDate,
        returnDate: b.returnDate,
        fine: b.fine || fine,
        finePaid: b.finePaid || false,
        isOverdue,
        overdueDays,
        canReissue: canReissue(b),
        reissueLockedUntil: b.lastReissueDate ? 
          new Date(b.lastReissueDate.getTime() + (30 * 24 * 60 * 60 * 1000)) : null,
        canRequestAgain: canRequestAgain(b),
        reissueCount: b.reissueCount || 0,
        requestType: b.requestType || "borrow",
        adminNotes: b.adminNotes,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt
      };
    });
    
    res.json(reservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🔥 NEW: Get admin dashboard stats
router.get("/admin/stats", protect, async (req, res) => {
  try {
    const totalRequests = await Borrow.countDocuments();
    const pendingRequests = await Borrow.countDocuments({ 
      status: { $in: ["requested", "reissue-requested", "return-requested"] } 
    });
    const issuedBooks = await Borrow.countDocuments({ status: "issued" });
    const overdueBooks = await Borrow.countDocuments({ 
      status: "issued",
      dueDate: { $lt: new Date() }
    });
    
    // Calculate total fines
    const overdueBorrows = await Borrow.find({ 
      status: "issued",
      dueDate: { $lt: new Date() }
    });
    
    let totalFines = 0;
    overdueBorrows.forEach(b => {
      const fine = calculateFine(b.dueDate);
      totalFines += fine;
    });
    
    res.json({
      totalRequests,
      pendingRequests,
      issuedBooks,
      overdueBooks,
      totalFines
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


module.exports = router;