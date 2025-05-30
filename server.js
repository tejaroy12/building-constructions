const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const projectsRoutes = require("./routes/projects");
const bookingsRoutes = require("./routes/bookings");

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB & Run schema.sql to create tables
const db = new sqlite3.Database(path.join(__dirname, "db/database.sqlite"));
const fs = require("fs");
const schema = fs.readFileSync(path.join(__dirname, "db/schema.sql"), "utf-8");
db.exec(schema, (err) => {
  if (err) console.error("DB schema creation error:", err.message);
  else console.log("Database initialized");
});
db.close();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", projectsRoutes);
app.use("/api", bookingsRoutes);

// Health check
app.get("/", (req, res) => {
  res.send("Builder backend is running");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
