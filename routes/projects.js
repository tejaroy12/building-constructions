const express = require("express");
const multer = require("multer");
const { cloudinary } = require("../utils/cloudinary"); // Ensure cloudinary config is correct
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const streamifier = require("streamifier");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const db = new sqlite3.Database(path.join(__dirname, "../db/database.sqlite"));

// Enable foreign key support for SQLite
db.on('open', () => {
  db.exec('PRAGMA foreign_keys = ON;', (err) => {
    if (err) {
      console.error("Failed to enable foreign keys:", err.message);
    } else {
      console.log("Foreign keys enabled for SQLite.");
    }
  });
});

/* --- Create Project --- */
router.post("/projects", (req, res) => {
  const { title, description, owner_name, location, completion_date } = req.body;
  const stmt = db.prepare(`INSERT INTO projects (title, description, owner_name, location, completion_date) VALUES (?, ?, ?, ?, ?)`);
  stmt.run(title, description, owner_name, location, completion_date, function (err) {
    if (err) {
      console.error("Error creating project:", err.message);
      return res.status(500).json({ error: "Failed to create project." });
    }
    res.status(201).json({ id: this.lastID });
  });
  stmt.finalize();
});

/* --- Get All Projects with Images --- */
router.get("/projects", (req, res) => {
  const query = `SELECT * FROM projects ORDER BY created_at DESC`;
  db.all(query, [], async (err, projects) => {
    if (err) {
      console.error("Error fetching projects:", err.message);
      return res.status(500).json({ error: "Failed to fetch projects." });
    }

    const results = await Promise.all(projects.map(project =>
      new Promise((resolve, reject) => {
        db.all(`SELECT image_url FROM images WHERE project_id = ?`, [project.id], (err, images) => {
          if (err) {
            console.error("Error fetching images for project:", err.message);
            reject(err);
          } else {
            resolve({ ...project, images: images.map(i => i.image_url) });
          }
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
    if (err) {
      console.error("Error fetching single project:", err.message);
      return res.status(500).json({ error: "Failed to fetch project." });
    }
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    db.all(`SELECT image_url FROM images WHERE project_id = ?`, [id], (err, images) => {
      if (err) {
        console.error("Error fetching images for single project:", err.message);
        return res.status(500).json({ error: "Failed to fetch project images." });
      }
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
      if (err) {
        console.error("Error updating project:", err.message);
        return res.status(500).json({ error: "Failed to update project." });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Project not found or no changes made." });
      }
      res.json({ success: true, message: "Project updated successfully." });
    }
  );
});

/* --- Delete Project and Images --- */
router.delete("/projects/:id", (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM images WHERE project_id = ?`, [id], (err) => {
    if (err) {
      console.error("Error deleting project images:", err.message);
      return res.status(500).json({ error: "Failed to delete project images." });
    }
    db.run(`DELETE FROM projects WHERE id = ?`, [id], function (err) {
      if (err) {
        console.error("Error deleting project:", err.message);
        return res.status(500).json({ error: "Failed to delete project." });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Project not found." });
      }
      res.json({ success: true, message: "Project and associated images deleted successfully." });
    });
  });
});

// --- Upload Multiple Images (up to 5) ---
router.post("/projects/:id/images", upload.array("images", 5), async (req, res) => {
  const { id } = req.params;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No images uploaded." });
  }

  try {
    // 1. Check current image count for the project
    const row = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM images WHERE project_id = ?`, [id], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (row.count + files.length > 5) {
      return res.status(400).json({ error: `You can upload ${5 - row.count} more image(s). Max 5 images allowed per project.` });
    }

    // 2. Create an array of promises for each file upload and DB insertion
    const uploadPromises = files.map(file => {
      return new Promise((resolve, reject) => {
        // Cloudinary upload stream
        const uploadStream = cloudinary.uploader.upload_stream({ folder: "projects" }, async (error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            return reject(new Error("Cloudinary upload failed for one or more images."));
          }

          const imageUrl = result.secure_url;
          try {
            // Insert image URL into database
            await new Promise((dbResolve, dbReject) => {
              db.run(`INSERT INTO images (project_id, image_url) VALUES (?, ?)`, [id, imageUrl], function (err) {
                if (err) {
                  console.error("DB insert error for image URL:", err.message);
                  return dbReject(new Error("Failed to save image URL to database."));
                }
                dbResolve();
              });
            });
            resolve(imageUrl); // Resolve with the URL if both upload and DB save are successful
          } catch (dbError) {
            reject(dbError); // Propagate database error
          }
        });
        // Pipe the file buffer to the Cloudinary upload stream
        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });
    });

    // 3. Await all upload and DB insertion promises
    const uploadedUrls = await Promise.all(uploadPromises);

    // 4. Send final success response after all operations are complete
    res.json({ success: true, message: "Images uploaded successfully.", images: uploadedUrls });

  } catch (error) {
    // Catch any errors from promises and send appropriate response
    console.error("Error in /projects/:id/images route:", error);
    res.status(500).json({ error: error.message || "Failed to upload images." });
  }
});


/* --- Get All Project Images --- */
router.get("/images", (req, res) => {
  db.all(`SELECT * FROM images ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      console.error("Error fetching all images:", err.message);
      return res.status(500).json({ error: "Failed to fetch images." });
    }
    res.json(rows);
  });
});

/* --- Search Projects by Owner or Location --- */
router.get("/projects/search", (req, res) => {
  const { owner, location } = req.query;
  const query = `SELECT * FROM projects WHERE owner_name LIKE ? AND location LIKE ?`;
  db.all(query, [`%${owner || ""}%`, `%${location || ""}%`], async (err, projects) => {
    if (err) {
      console.error("Error searching projects:", err.message);
      return res.status(500).json({ error: "Failed to search projects." });
    }

    const results = await Promise.all(projects.map(project =>
      new Promise((resolve, reject) => {
        db.all(`SELECT image_url FROM images WHERE project_id = ?`, [project.id], (err, images) => {
          if (err) {
            console.error("Error fetching images for search results:", err.message);
            reject(err);
          } else {
            resolve({ ...project, images: images.map(i => i.image_url) });
          }
        });
      })
    ));
    res.json(results);
  });
});

/* --- Get All Bookings --- */
router.get("/bookings", (req, res) => {
  db.all(`SELECT * FROM bookings ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) {
      console.error("Error fetching bookings:", err.message);
      return res.status(500).json({ error: "Failed to fetch bookings." });
    }
    res.json(rows);
  });
});

module.exports = router;
