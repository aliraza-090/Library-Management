const Borrow = require("../models/Borrow");
const Book = require("../models/Book");
const User = require("../models/User");

//////////////////////////////////////////////////////////////
// ➕ STUDENT REQUEST BOOK (Enhanced with 12-day rule)
//////////////////////////////////////////////////////////////
exports.requestBook = async (req, res) => {
  try {
    const { bookId } = req.body;
    const userId = req.user._id;

    if (!bookId) {
      return res.status(400).json({ error: "Missing required field: bookId" });
    }

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    if (book.status === "Borrowed") {
      return res.status(400).json({ error: "Book is currently borrowed by someone else" });
    }

    // 🔥 Check 12-day rule for rejected requests
    const rejectedRequest = await Borrow.findOne({
      bookId,
      userId,
      status: "rejected"
    }).sort({ rejectedDate: -1 });

    if (rejectedRequest && !rejectedRequest.canRequestAgain()) {
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
      status: { $in: ["requested", "issued", "overdue", "reissue-requested"] },
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
    book.status = "reserved";
    await book.save();

    await borrow.populate("bookId", "title author department coverImage status");

    res.status(201).json({
      message: "Book requested successfully. Waiting for admin approval.",
      borrow,
      note: "Your request will appear in reservations section"
    });
  } catch (err) {
    console.error("Error in requestBook:", err);
    res.status(500).json({ error: "Server error while creating borrow request" });
  }
};

//////////////////////////////////////////////////////////////
// 📚 GET ALL BORROWS (ADMIN) - Enhanced with fine calculation
//////////////////////////////////////////////////////////////
exports.getAllBorrows = async (req, res) => {
  try {
    const borrows = await Borrow.find()
      .populate("bookId", "title department status coverImage")
      .populate("userId", "fullName rollNo batch email")
      .sort({ createdAt: -1 });

    // Auto-calculate fines for all issued/overdue books
    borrows.forEach(b => {
      try {
        if (b.checkOverdue) b.checkOverdue();
      } catch (e) {
        console.warn("checkOverdue failed for borrow", b._id, e);
      }
    });

    const formatted = borrows.map(b => ({
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
      fine: b.fine || 0,
      finePaid: b.finePaid || false,
      requestType: b.requestType || "borrow",
      canReissue: b.canReissue ? b.canReissue() : true,
      reissueCount: b.reissueCount || 0
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Error in getAllBorrows:", err);
    res.status(500).json({ error: "Server error while fetching borrow records" });
  }
};

//////////////////////////////////////////////////////////////
// ✏ UPDATE STATUS (ADMIN) - Enhanced with reservation logic
//////////////////////////////////////////////////////////////
exports.updateBorrowStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const allowedStatuses = [
      "requested", "issued", "returned", "rejected", "overdue",
      "reissue-requested", "return-requested", "cancelled", "reissued", "return-approved"
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const borrow = await Borrow.findById(req.params.id).populate("bookId");
    if (!borrow) return res.status(404).json({ error: "Borrow record not found" });

    const oldStatus = borrow.status;
    borrow.status = status;
    if (adminNotes) borrow.adminNotes = adminNotes;

    const book = borrow.bookId;

    // 📌 ISSUE BOOK (Admin approves)
    if (status === "issued") {
      borrow.issueDate = new Date();
      borrow.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 1 month
      if (book) {
        book.status = "Borrowed";
        await book.save();
      }
    }

    // 📌 REJECT REQUEST
    if (status === "rejected") {
      borrow.rejectedDate = new Date();
      if (book && book.status === "reserved") {
        book.status = "Available";
        await book.save();
      }
    }

    // 📌 RETURN BOOK
    if (status === "returned" || status === "return-approved") {
      borrow.returnDate = new Date();
      borrow.actualReturnDate = new Date();
      
      // Calculate final fine if overdue
      if (borrow.dueDate && new Date() > borrow.dueDate) {
        const diffTime = Math.abs(new Date() - borrow.dueDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const overdueWeeks = Math.ceil(diffDays / 7);
        borrow.fine = overdueWeeks * 80;
        borrow.status = "fine-pending";
      } else {
        borrow.status = "completed";
      }
      
      if (book) {
        book.status = "Available";
        await book.save();
      }
    }

    // 🔁 ADMIN APPROVES REISSUE
    if (status === "reissued") {
      borrow.reissueCount += 1;
      borrow.lastReissueDate = new Date();
      borrow.isReissueLocked = true;
      borrow.issueDate = new Date();
      borrow.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      borrow.status = "issued";
    }

    // Auto-calculate overdue fine
    if (borrow.checkOverdue) borrow.checkOverdue();

    await borrow.save();

    res.json({ 
      message: "Status updated successfully", 
      borrow,
      oldStatus,
      newStatus: status
    });
  } catch (err) {
    console.error("Error in updateBorrowStatus:", err);
    res.status(500).json({ error: "Server error while updating borrow status" });
  }
};

//////////////////////////////////////////////////////////////
// ❌ DELETE REQUEST (ADMIN)
//////////////////////////////////////////////////////////////
exports.deleteBorrow = async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow record not found" });

    if (["issued", "returned"].includes(borrow.status)) {
      return res.status(400).json({ error: "Cannot delete active or completed borrow records" });
    }

    await Borrow.findByIdAndDelete(req.params.id);
    res.json({ message: "Borrow request deleted successfully" });
  } catch (err) {
    console.error("Error in deleteBorrow:", err);
    res.status(500).json({ error: "Server error while deleting borrow record" });
  }
};

//////////////////////////////////////////////////////////////
// 👨‍🎓 STUDENT MY BORROWS - Enhanced with fine & reissue info
//////////////////////////////////////////////////////////////
exports.getMyBorrows = async (req, res) => {
  try {
    const borrows = await Borrow.find({ userId: req.user._id })
      .populate({
        path: "bookId",
        select: "title author department coverImage status isbn pages year"
      })
      .sort({ createdAt: -1 });

    // Calculate fines and check reissue eligibility
    const enhancedBorrows = borrows.map(b => {
      // Auto-calculate fine
      if (b.checkOverdue) b.checkOverdue();
      
      const canReissue = b.canReissue ? b.canReissue() : true;
      const canRequestAgain = b.canRequestAgain ? b.canRequestAgain() : true;
      
      return {
        ...b.toObject(),
        canReissue,
        canRequestAgain,
        // Add human-readable status
        statusText: getStatusText(b.status),
        // Calculate days remaining
        daysRemaining: b.dueDate ? 
          Math.ceil((b.dueDate - new Date()) / (1000 * 60 * 60 * 24)) : null
      };
    });

    res.json(enhancedBorrows);
  } catch (err) {
    console.error("Error in getMyBorrows:", err);
    res.status(500).json({ error: "Server error while fetching your borrow records" });
  }
};

//////////////////////////////////////////////////////////////
// 🔁 STUDENT REISSUE REQUEST - Enhanced with lock check
//////////////////////////////////////////////////////////////
exports.requestReissue = async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow not found" });

    if (!["issued", "overdue"].includes(borrow.status)) {
      return res.status(400).json({ error: "Only issued/overdue books can be reissued" });
    }

    // Check reissue lock (1 month)
    if (!borrow.canReissue()) {
      const lastDate = new Date(borrow.lastReissueDate);
      const unlockDate = new Date(lastDate.getTime() + (30 * 24 * 60 * 60 * 1000));
      return res.status(400).json({ 
        error: "Reissue locked for 1 month after last reissue",
        availableAfter: unlockDate
      });
    }

    // Check if fine exists
    if (borrow.fine > 0 && !borrow.finePaid) {
      return res.status(400).json({ 
        error: "Clear outstanding fine before reissuing",
        fineAmount: borrow.fine
      });
    }

    // Create new reissue request
    const reissueRequest = new Borrow({
      bookId: borrow.bookId,
      userId: borrow.userId,
      parentRequestId: borrow._id,
      requestType: "reissue",
      status: "reissue-requested",
      reissueCount: borrow.reissueCount + 1
    });

    await reissueRequest.save();

    // Update original request
    borrow.isReissueLocked = true;
    borrow.lastReissueDate = new Date();
    await borrow.save();

    res.json({ 
      message: "Reissue request sent to admin",
      requestId: reissueRequest._id,
      note: "Your request will appear in reservations section"
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

//////////////////////////////////////////////////////////////
// 📕 STUDENT RETURN REQUEST - Enhanced with fine calculation
//////////////////////////////////////////////////////////////
exports.requestReturn = async (req, res) => {
  try {
    const borrow = await Borrow.findById(req.params.id);
    if (!borrow) return res.status(404).json({ error: "Borrow not found" });

    if (!["issued", "overdue"].includes(borrow.status)) {
      return res.status(400).json({ error: "Only issued books can be returned" });
    }

    // Calculate final fine
    if (borrow.checkOverdue) borrow.checkOverdue();
    
    // Create return request
    const returnRequest = new Borrow({
      bookId: borrow.bookId,
      userId: borrow.userId,
      parentRequestId: borrow._id,
      requestType: "return",
      status: "return-requested",
      fine: borrow.fine
    });

    await returnRequest.save();

    res.json({ 
      message: "Return request sent to admin",
      fineAmount: borrow.fine,
      requestId: returnRequest._id,
      note: "Your request will appear in reservations section"
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

//////////////////////////////////////////////////////////////
// ❌ STUDENT CANCEL REQUEST
//////////////////////////////////////////////////////////////
exports.cancelRequest = async (req, res) => {
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
    res.status(500).json({ error: "Server error" });
  }
};

//////////////////////////////////////////////////////////////
// 💰 PAY FINE
//////////////////////////////////////////////////////////////
exports.payFine = async (req, res) => {
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
    res.status(500).json({ error: "Server error" });
  }
};

// Helper function
function getStatusText(status) {
  const statusMap = {
    "requested": "Pending Approval",
    "issued": "Issued",
    "returned": "Returned",
    "rejected": "Rejected",
    "overdue": "Overdue",
    "reissue-requested": "Reissue Requested",
    "return-requested": "Return Requested",
    "cancelled": "Cancelled",
    "fine-pending": "Fine Pending",
    "completed": "Completed"
  };
  return statusMap[status] || status;
}