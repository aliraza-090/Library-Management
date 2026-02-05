const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
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
      default: "Available" 
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }
);

module.exports = mongoose.model("Book", bookSchema);