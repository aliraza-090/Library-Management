const express = require("express");
const router = express.Router();
const Book = require("../models/Book");
const multer = require("multer");
const path = require("path");

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });


// ➕ Add Book with Image
router.post("/", upload.single("coverImage"), async (req, res) => {
  try {
    // ✅ SAFE pages conversion
    let pagesValue = undefined;
    if (
      req.body.pages !== undefined &&
      req.body.pages !== "" &&
      req.body.pages !== "null"
    ) {
      const num = Number(req.body.pages);
      pagesValue = isNaN(num) ? undefined : num;
    }

    const newBook = new Book({
      ...req.body,
      pages: pagesValue,
      coverImage: req.file ? `/uploads/${req.file.filename}` : "",
    });

    await newBook.save();
    res.status(201).json(newBook);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// ✏ Update Book with Image
router.put("/:id", upload.single("coverImage"), async (req, res) => {
  try {
    const updatedData = { ...req.body };

    // ✅ SAFE pages conversion (prevents crash)
    if (
      req.body.pages === undefined ||
      req.body.pages === "" ||
      req.body.pages === "null"
    ) {
      updatedData.pages = undefined;
    } else {
      const num = Number(req.body.pages);
      updatedData.pages = isNaN(num) ? undefined : num;
    }

    if (req.file) {
      updatedData.coverImage = `/uploads/${req.file.filename}`;
    }

    const book = await Book.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true }
    );

    res.json(book);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 📚 Get All Books
router.get("/", async (req, res) => {
  const books = await Book.find();
  res.json(books);
});


// ❌ Delete Book
router.delete("/:id", async (req, res) => {
  await Book.findByIdAndDelete(req.params.id);
  res.json({ message: "Book deleted" });
});

module.exports = router;
