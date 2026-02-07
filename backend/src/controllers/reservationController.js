const Reservation = require("../models/Reservation");
const Book = require("../models/Book");

exports.createReservation = async (req, res) => {
  try {
    const { bookId } = req.body;

    const book = await Book.findById(bookId);
    if (!book || book.availableCopies <= 0) {
      return res.status(400).json({ message: "Book not available" });
    }

    const exists = await Reservation.findOne({
      userId: req.user.id,
      bookId
    });

    if (exists) {
      return res.status(400).json({ message: "Already reserved" });
    }

    const reservation = await Reservation.create({
      userId: req.user.id,
      bookId
    });

    book.availableCopies -= 1;
    await book.save();

    res.status(201).json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyReservations = async (req, res) => {
  try {
    const reservations = await Reservation.find({
      userId: req.user.id
    }).populate("bookId");

    res.json(reservations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.cancelReservation = async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation || reservation.userId.toString() !== req.user.id) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    reservation.status = "cancelled";
    await reservation.save();

    const book = await Book.findById(reservation.bookId);
    book.availableCopies += 1;
    await book.save();

    res.json({ message: "Reservation cancelled" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
