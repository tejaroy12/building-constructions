const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { sendBookingEmail } = require("../utils/mailer");

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, "../db/database.sqlite"));

// Booking form POST
router.post("/bookings", async (req, res) => {
  try {
    const { name, email, phone, location, message } = req.body;

    if (!name || !email || !phone || !location) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Save to DB
    const stmt = db.prepare(
      `INSERT INTO bookings (name, email, phone, location, message) VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(name, email, phone, location, message, function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Send email notification
      sendBookingEmail({ name, email, phone, location, message })
        .then(() => res.json({ success: true }))
        .catch((mailErr) => {
          console.error(mailErr);
          res.status(500).json({ error: "Booking saved but email failed to send" });
        });
    });
    stmt.finalize();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
