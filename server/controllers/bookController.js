const Book = require("../models/Book");

// Add New Book
exports.addBook = async (req, res) => {
  try {
    // Auto-generate Book ID
    const count = await Book.countDocuments();
    const generatedID = "BK-" + String(count + 1).padStart(4, "0");

    const newBook = new Book({
      ...req.body,
      bookID: generatedID
    });

    await newBook.save();
    res.status(201).json({ msg: "Book added successfully!", book: newBook });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get All Books (with filtering)
exports.getAllBooks = async (req, res) => {
  try {
    const { department, category, search } = req.query;
    let query = {};

    if (department && department !== "All") query.department = department;
    if (category && category !== "All") query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } }
      ];
    }

    const books = await Book.find(query);
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Book
exports.updateBook = async (req, res) => {
  try {
    const updatedBook = await Book.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ msg: "Book updated!", book: updatedBook });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete Book
exports.deleteBook = async (req, res) => {
  try {
    await Book.findByIdAndDelete(req.params.id);
    res.json({ msg: "Book deleted!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
