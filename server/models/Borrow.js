const mongoose = require("mongoose");

const BorrowSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    issueDate: { type: Date },
    dueDate: { type: Date },
    returnDate: { type: Date },
    actualReturnDate: { type: Date },

    // 🔥 ENHANCED FIELDS
    reissueCount: { type: Number, default: 0 },
    lastReissueDate: { type: Date },
    isReissueLocked: { type: Boolean, default: false },
    
    // 🔥 NEW: Track request history
    requestType: { 
      type: String, 
      enum: ["borrow", "reissue", "return"],
      default: "borrow"
    },
    parentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "Borrow" }, // For reissue/return tracking
    
    status: {
      type: String,
      enum: [
        "requested",
        "issued",
        "returned",
        "rejected",
        "overdue",
        "reissue-requested",
        "return-requested",
        "cancelled",
        "fine-pending",
        "completed"
      ],
      default: "requested",
    },

    fine: { type: Number, default: 0 },
    finePaid: { type: Boolean, default: false },
    fineHistory: [{
      weeks: Number,
      amount: Number,
      calculatedDate: Date
    }],
    
    // 🔥 NEW: Rejection tracking for 12-day rule
    rejectedDate: { type: Date },
    
    adminNotes: String,
    
    // 🔥 NEW: For reservation system
    reservationId: String,
    priority: { type: Number, default: 1 },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// 🔥 UPDATED Fine Logic (80 per week with auto-calculation)
BorrowSchema.methods.checkOverdue = function () {
  if (this.status === "issued" || this.status === "overdue") {
    const today = new Date();
    const dueDate = this.dueDate;
    
    if (dueDate && today > dueDate) {
      const diffTime = Math.abs(today - dueDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const overdueWeeks = Math.ceil(diffDays / 7);
      
      // Calculate new fine
      const newFine = overdueWeeks * 80;
      
      // Only update if fine increased
      if (newFine > this.fine) {
        this.fine = newFine;
        this.status = "overdue";
        
        // Record fine history
        this.fineHistory.push({
          weeks: overdueWeeks,
          amount: newFine,
          calculatedDate: today
        });
      }
    }
  }
};

// 🔥 NEW: Check if reissue is allowed (1 month lock)
BorrowSchema.methods.canReissue = function () {
  if (!this.lastReissueDate) return true;
  
  const lockPeriod = 30 * 24 * 60 * 60 * 1000; // 1 month in milliseconds
  const now = new Date();
  const unlockDate = new Date(this.lastReissueDate.getTime() + lockPeriod);
  
  return now >= unlockDate;
};

// 🔥 NEW: Check if can request again after rejection (12-day rule)
BorrowSchema.methods.canRequestAgain = function () {
  if (this.status !== "rejected" || !this.rejectedDate) return true;
  
  const twelveDays = 12 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const canRequestDate = new Date(this.rejectedDate.getTime() + twelveDays);
  
  return now >= canRequestDate;
};

module.exports = mongoose.model("Borrow", BorrowSchema);