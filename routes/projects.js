const express = require("express");
const multer = require("multer");
const { cloudinary } = require("../utils/cloudinary");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const streamifier = require("streamifier");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const db = new sqlite3.Database(path.join(__dirname, "../db/database.sqlite"));

/* --- Create Project --- */
router.post("/projects", (req, res) => {
  const { title, description, owner_name, location, completion_date } = req.body;
  const stmt = db.prepare(`INSERT INTO projects (title, description, owner_name, location, completion_date) VALUES (?, ?, ?, ?, ?)`);
  stmt.run(title, description, owner_name, location, completion_date, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID });
  });
  stmt.finalize();
});

/* --- Get All Projects with Images --- */
router.get("/projects", (req, res) => {
  const query = `SELECT * FROM projects ORDER BY created_at DESC`;
  db.all(query, [], async (err, projects) => {
    if (err) return res.status(500).json({ error: err.message });

    const results = await Promise.all(projects.map(project =>
      new Promise((resolve, reject) => {
        db.all(`SELECT image_url FROM images WHERE project_id = ?`, [project.id], (err, images) => {
          if (err) reject(err);
          else resolve({ ...project, images: images.map(i => i.image_url) });
        });
      })
    ));
    res.json(results);
  });
});

/* --- Get Single Project with Images --- */
router.get("/projects/:id", (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM projects WHERE id = ?`, [id], (err, project) => {
    if (err || !project) return res.status(404).json({ error: "Project not found" });
    db.all(`SELECT image_url FROM images WHERE project_id = ?`, [id], (err, images) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ...project, images: images.map(i => i.image_url) });
    });
  });
});

/* --- Update Project --- */
router.put("/projects/:id", (req, res) => {
  const { title, description, owner_name, location, completion_date } = req.body;
  db.run(
    `UPDATE projects SET title = ?, description = ?, owner_name = ?, location = ?, completion_date = ? WHERE id = ?`,
    [title, description, owner_name, location, completion_date, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

/* --- Delete Project and Images --- */
router.delete("/projects/:id", (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM images WHERE project_id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM projects WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

/* --- Upload Multiple Images (up to 5) --- */
router.post("/projects/:id/images", upload.array("images", 5), async (req, res) => {
  const { id } = req.params;
  const files = req.files;

  if (!files || files.length === 0) return res.status(400).json({ error: "No images uploaded" });

  db.get(`SELECT COUNT(*) as count FROM images WHERE project_id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row.count + files.length > 5) {
      return res.status(400).json({ error: "Max 5 images allowed per project" });
    }

    const uploadedUrls = [];

    for (const file of files) {
      const uploadStream = cloudinary.uploader.upload_stream({ folder: "projects" }, (error, result) => {
        if (error) return res.status(500).json({ error: error.message });

        const imageUrl = result.secure_url;
        db.run(`INSERT INTO images (project_id, image_url) VALUES (?, ?)`, [id, imageUrl], (err) => {
          if (err) console.error(err);
        });

        uploadedUrls.push(imageUrl);
        if (uploadedUrls.length === files.length) {
          res.json({ success: true, images: uploadedUrls });
        }
      });

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    }
  });
});

/* --- Get All Project Images --- */
router.get("/images", (req, res) => {
  db.all(`SELECT * FROM images ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/* --- Search Projects by Owner or Location --- */
router.get("/projects/search", (req, res) => {
  const { owner, location } = req.query;
  const query = `SELECT * FROM projects WHERE owner_name LIKE ? AND location LIKE ?`;
  db.all(query, [`%${owner || ""}%`, `%${location || ""}%`], async (err, projects) => {
    if (err) return res.status(500).json({ error: err.message });

    const results = await Promise.all(projects.map(project =>
      new Promise((resolve, reject) => {
        db.all(`SELECT image_url FROM images WHERE project_id = ?`, [project.id], (err, images) => {
          if (err) reject(err);
          else resolve({ ...project, images: images.map(i => i.image_url) });
        });
      })
    ));
    res.json(results);
  });
});

/* --- Get All Bookings --- */
router.get("/bookings", (req, res) => {
  db.all(`SELECT * FROM bookings ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;
