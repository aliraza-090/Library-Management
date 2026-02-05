const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const path = require("path");

dotenv.config();
connectDB();

const app = express();
// At the bottom of your server.js, add:
if (process.env.NODE_ENV !== 'test') {
  require('./cron/autoUnlock');
  console.log('Cron jobs started for auto-unlock and fine calculation');
}
// Middlewares
app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.get("/api/test", (req, res) => {
  res.json({ message: "API working ✅" });
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/books", require("./routes/bookRoutes"));
app.use("/api/borrow", require("./routes/borrowRoutes"));

app.listen(process.env.PORT, () => console.log("Server running on port", process.env.PORT));
