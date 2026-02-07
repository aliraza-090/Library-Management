const cron = require('node-cron');
const Borrow = require('../models/Borrow');

// Run daily at midnight to unlock reissues after 1 month
cron.schedule('0 0 * * *', async () => {
  try {
    const lockedRequests = await Borrow.find({
      isReissueLocked: true,
      lastReissueDate: { $ne: null }
    });
    
    const today = new Date();
    let unlockedCount = 0;
    
    for (const request of lockedRequests) {
      const lockUntil = new Date(request.lastReissueDate);
      lockUntil.setMonth(lockUntil.getMonth() + 1);
      
      if (today >= lockUntil) {
        request.isReissueLocked = false;
        await request.save();
        unlockedCount++;
      }
    }
    
    console.log(`Auto-unlock: ${unlockedCount} reissues unlocked at ${today.toISOString()}`);
  } catch (error) {
    console.error('Error in auto-unlock cron job:', error);
  }
});

// Run hourly to check and update overdue status
cron.schedule('0 * * * *', async () => {
  try {
    const issuedBooks = await Borrow.find({
      status: { $in: ['issued', 'overdue'] }
    });
    
    let updatedCount = 0;
    
    for (const book of issuedBooks) {
      if (book.checkOverdue) {
        const oldFine = book.fine;
        book.checkOverdue();
        if (book.fine !== oldFine) {
          await book.save();
          updatedCount++;
        }
      }
    }
    
    console.log(`Fine check: ${updatedCount} fines updated`);
  } catch (error) {
    console.error('Error in fine calculation cron job:', error);
  }
});