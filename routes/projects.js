const express = require("express");
const multer = require("multer");
const { cloudinary } = require("../utils/cloudinary");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const streamifier = require("streamifier");

const router = express.Router();

// Use multer memory storage to handle file upload buffer
const upload = multer({ storage: multer.memoryStorage() });

// Connect to SQLite DB
const db = new sqlite3.Database(path.join(__dirname, "../db/database.sqlite"));

// Create Project
router.post("/projects", (req, res) => {
  const { title, description, owner_name, location, completion_date } = req.body;
  const stmt = db.prepare(
    `INSERT INTO projects (title, description, owner_name, location, completion_date) VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(title, description, owner_name, location, completion_date, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID });
  });
  stmt.finalize();
});

// Get All Projects (with images)
router.get("/projects", (req, res) => {
  const query = `SELECT * FROM projects ORDER BY created_at DESC`;
  db.all(query, [], (err, projects) => {
    if (err) return res.status(500).json({ error: err.message });

    // For each project, fetch images
    const promises = projects.map(
      (project) =>
        new Promise((resolve, reject) => {
          db.all(
            `SELECT image_url FROM images WHERE project_id = ?`,
            [project.id],
            (err, images) => {
              if (err) reject(err);
              else resolve({ ...project, images: images.map((i) => i.image_url) });
            }
          );
        })
    );

    Promise.all(promises)
      .then((results) => res.json(results))
      .catch((error) => res.status(500).json({ error: error.message }));
  });
});

// Upload Image for a Project (max 5)
router.post(
  "/projects/:id/images",
  upload.single("image"),
  (req, res) => {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    // Check current images count for this project
    db.get(
      `SELECT COUNT(*) as count FROM images WHERE project_id = ?`,
      [id],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row.count >= 5) {
          return res.status(400).json({ error: "Max 5 images allowed per project" });
        }

        // Upload to Cloudinary using upload_stream and streamifier
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "projects" },
          (error, result) => {
            if (error) return res.status(500).json({ error: error.message });

            const imageUrl = result.secure_url;

            // Save imageUrl to database
            db.run(
              `INSERT INTO images (project_id, image_url) VALUES (?, ?)`,
              [id, imageUrl],
              function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, imageUrl });
              }
            );
          }
        );

        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      }
    );
  }
);

module.exports = router;
