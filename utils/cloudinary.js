const cloudinary = require("cloudinary").v2;
require("dotenv").config();



cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log("Cloudinary config:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET ? "****" : undefined,
});


// Simple test: get Cloudinary account details
cloudinary.api
  .ping()
  .then(() => {
    console.log("✅ Cloudinary connected successfully.");
  })
  .catch((err) => {
    console.error("❌ Cloudinary connection error:", err.message);
  });

module.exports = { cloudinary };

