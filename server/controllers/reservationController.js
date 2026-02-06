const Borrow = require("../models/Borrow");
const Book = require("../models/Book");

// Get student reservations with enhanced info
exports.getStudentReservations = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get all borrow requests for this student
    const borrows = await Borrow.find({ userId })
      .populate({
        path: "bookId",
        select: "title author department coverImage status isbn"
      })
      .sort({ createdAt: -1 });

    // Enhance each reservation with calculated data
    const reservations = borrows.map(borrow => {
      const book = borrow.bookId;
      const today = new Date();
      
      // Calculate fine if overdue
      let fineAmount = 0;
      let isOverdue = false;
      let overdueDays = 0;
      
      if (borrow.dueDate && today > borrow.dueDate && !borrow.finePaid) {
        isOverdue = true;
        const diffTime = Math.abs(today - borrow.dueDate);
        overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const overdueWeeks = Math.ceil(overdueDays / 7);
        fineAmount = overdueWeeks * 80;
      }
      
      // Check reissue eligibility
      let canReissue = false;
      let reissueLockedUntil = null;
      
      if (borrow.status === "issued" && borrow.canReissue && borrow.canReissue()) {
        canReissue = true;
      } else if (borrow.lastReissueDate) {
        const lockUntil = new Date(borrow.lastReissueDate);
        lockUntil.setMonth(lockUntil.getMonth() + 1);
        reissueLockedUntil = lockUntil;
      }
      
      // Check if can request again after rejection
      let canRequestAgain = true;
      if (borrow.status === "rejected" && borrow.rejectedDate) {
        const twelveDays = new Date(borrow.rejectedDate);
        twelveDays.setDate(twelveDays.getDate() + 12);
        canRequestAgain = today >= twelveDays;
      }
      
      return {
        id: borrow._id,
        book: {
          title: book?.title || "Unknown Book",
          author: book?.author || "Unknown Author",
          coverImage: book?.coverImage,
          department: book?.department,
          status: book?.status
        },
        requestType: borrow.requestType || "borrow",
        status: borrow.status,
        statusText: getStatusText(borrow.status),
        issueDate: borrow.issueDate,
        dueDate: borrow.dueDate,
        returnDate: borrow.returnDate,
        fine: borrow.fine || fineAmount,
        finePaid: borrow.finePaid || false,
        isOverdue,
        overdueDays,
        canReissue,
        reissueLockedUntil,
        canRequestAgain,
        reissueCount: borrow.reissueCount || 0,
        createdAt: borrow.createdAt,
        updatedAt: borrow.updatedAt,
        adminNotes: borrow.adminNotes
      };
    });
    
    res.json(reservations);
  } catch (error) {
    console.error("Error in getStudentReservations:", error);
    res.status(500).json({ error: "Server error while fetching reservations" });
  }
};

// Get admin reservation dashboard
exports.getAdminReservations = async (req, res) => {
  try {
    const pendingRequests = await Borrow.find({ 
      status: { $in: ["requested", "reissue-requested", "return-requested"] } 
    })
      .populate("bookId", "title author department")
      .populate("userId", "fullName rollNo email")
      .sort({ createdAt: 1 });
    
    const issuedBooks = await Borrow.find({ 
      status: "issued" 
    })
      .populate("bookId", "title author")
      .populate("userId", "fullName rollNo")
      .sort({ dueDate: 1 });
    
    // Calculate overdue books with fines
    const overdueBooks = await Borrow.find({
      status: "issued",
      dueDate: { $lt: new Date() }
    })
      .populate("bookId", "title")
      .populate("userId", "fullName rollNo");
    
    const overdueWithFines = overdueBooks.map(book => {
      const dueDate = book.dueDate;
      const today = new Date();
      const diffTime = Math.abs(today - dueDate);
      const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const overdueWeeks = Math.ceil(overdueDays / 7);
      const fineAmount = overdueWeeks * 80;
      
      return {
        ...book.toObject(),
        overdueDays,
        fineAmount
      };
    });
    
    res.json({
      pendingRequests,
      issuedBooks,
      overdueBooks: overdueWithFines,
      stats: {
        totalPending: pendingRequests.length,
        totalIssued: issuedBooks.length,
        totalOverdue: overdueBooks.length,
        totalFines: overdueWithFines.reduce((sum, book) => sum + book.fineAmount, 0)
      }
    });
  } catch (error) {
    console.error("Error in getAdminReservations:", error);
    res.status(500).json({ error: "Server error while fetching admin reservations" });
  }
};

// Helper function
function getStatusText(status) {
  const statusMap = {
    "requested": "📋 Pending Approval",
    "issued": "✅ Issued",
    "returned": "📦 Returned",
    "rejected": "❌ Rejected",
    "overdue": "⚠️ Overdue (Fine Pending)",
    "reissue-requested": "🔄 Reissue Requested",
    "return-requested": "📤 Return Requested",
    "cancelled": "🚫 Cancelled",
    "fine-pending": "💰 Fine Pending",
    "completed": "🏁 Completed"
  };
  return statusMap[status] || status;
}