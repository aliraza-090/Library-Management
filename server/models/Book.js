const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    // 🔹 Manual / Display Book ID (OPTIONAL)
    bookID: {
      type: String,
      default: null,   // IMPORTANT: allow null for old books
    },

    title: { type: String, required: true },
    author: { type: String, required: true },

    // 🔹 ISBN should stay unique
    isbn: { type: String, required: true, unique: true },

    publisher: String,
    publicationYear: Number,
    category: String,
    department: { type: String, required: true },
    pages: Number,

    totalCopies: { type: Number, default: 1 },
    availableCopies: { type: Number, default: 1 },

    location: String,
    description: String,
    coverImage: String,

    status: {
      type: String,
      enum: ["Available", "Borrowed", "reserved", "Lost", "Damaged"],
      default: "Available",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Book", bookSchema);
